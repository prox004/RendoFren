import os
import sys
import subprocess
import shutil
import requests
import tempfile
from pathlib import Path
from typing import Optional, Callable
from .config import BLENDER_PATH, TEMP_DIR, RENDERS_DIR, BACKEND_API_URL
from .encryption import EncryptionManager

class RenderManager:
    """Manages secure downloads, temp decryption, Blender CLI rendering, encryption of results, and disk sanitization"""
    
    def __init__(self, logger_callback=None):
        self.log = logger_callback or print
        
    def download_encrypted_asset(self, cid: str, destination_path: str) -> bool:
        """Downloads encrypted blend file asset from public IPFS gateways with multiple retries & fallbacks"""
        self.log(f"Downloading CID from IPFS: {cid}...")
        gateways = [
            f"{BACKEND_API_URL}/api/jobs/download/{cid}",
            f"https://gateway.pinata.cloud/ipfs/{cid}",
            f"https://ipfs.io/ipfs/{cid}",
            f"https://cloudflare-ipfs.com/ipfs/{cid}",
            f"https://dweb.link/ipfs/{cid}"
        ]
        
        for gw in gateways:
            try:
                self.log(f"Trying IPFS Gateway: {gw}")
                response = requests.get(gw, stream=True, timeout=30)
                if response.status_code == 200:
                    with open(destination_path, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    file_size = os.path.getsize(destination_path)
                    self.log(f"Successfully downloaded asset ({file_size} bytes).")
                    return True
            except Exception as e:
                self.log(f"Gateway {gw} failed: {e}")
                continue
                
        return False


    def write_gpu_setup_script(self, script_dir: str) -> str:
        """
        Writes a robust GPU activation script to a temp .py file.
        
        Using a real script file instead of --python-expr avoids two critical issues:
          1. Windows shell quoting that can corrupt the expression string.
          2. The double get_devices() call needed in Blender 3.x/4.x to properly
             enumerate GPU devices after changing compute_device_type.
        
        The script tries OptiX first (fastest on RTX cards), then CUDA, then HIP (AMD).
        If none activate, it logs clearly and leaves Blender to render on CPU.
        """
        script_path = os.path.join(script_dir, "gpu_setup.py")
        script_content = """\
import bpy

def activate_gpu():
    prefs = bpy.context.preferences
    addon = prefs.addons.get('cycles')
    if not addon:
        print('[RendoFren] Cycles addon not found - cannot configure GPU.')
        return

    cprefs = addon.preferences

    # Step 1: Call get_devices() BEFORE changing compute_device_type.
    # This is required by Blender 3.x/4.x to seed the initial device list.
    cprefs.get_devices()

    # Step 2: Dynamically assign OptiX to supported architectures.
    # OPTIX is RTX-only. Initialising it in background mode on older GTX GPUs
    # causes a hard C++ crash inside Blender that kills the process.
    is_optix = False
    for d in cprefs.devices:
        name = d.name.upper()
        if any(x in name for x in ["RTX", "T4", "L4", "A10", "V100", "H100"]):
            is_optix = True
            break
            
    device_order = ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI') if is_optix else ('CUDA', 'OPTIX', 'HIP', 'METAL', 'ONEAPI')

    activated = False
    for device_type in device_order:
        try:
            cprefs.compute_device_type = device_type
            # Step 3: Must call get_devices() again AFTER setting the type.
            # This populates the device list for the chosen backend.
            cprefs.get_devices()
            gpu_devices = [d for d in cprefs.devices if d.type != 'CPU']
            if gpu_devices:
                for d in cprefs.devices:
                    d.use = (d.type != 'CPU')
                # Guard: bpy.context.scene can be None in background mode.
                scene = bpy.context.scene
                if scene and hasattr(scene, 'cycles'):
                    scene.cycles.device = 'GPU'
                print(f'[RendoFren] GPU_ACCEL_SUCCESS via {device_type}: {[d.name for d in gpu_devices]}')
                activated = True
                break
        except Exception as e:
            print(f'[RendoFren] {device_type} not available: {e}')
            continue

    if not activated:
        print('[RendoFren] GPU_ACCEL_FALLBACK - no GPU devices found, rendering on CPU.')

try:
    activate_gpu()
except Exception as e:
    print(f'[RendoFren] GPU activation script error: {e}')
"""
        with open(script_path, "w") as f:
            f.write(script_content)
        return script_path

    def render_frames(self, blend_path: str, output_path_pattern: str, start_frame: int, end_frame: int, use_gpu: bool = True, progress_callback=None) -> bool:
        """
        Executes Blender CLI in background mode to render a range of frames.
        Configures Cycles/EEVEE and output paths.
        """
        self.log(f"Starting Blender render on: {os.path.basename(blend_path)}")
        self.log(f"Frames: {start_frame} to {end_frame}")

        # Use a real temp dir for Blender log + GPU script to avoid path issues
        import tempfile
        render_temp = os.path.join(tempfile.gettempdir(), "RendoFren")
        os.makedirs(render_temp, exist_ok=True)
        log_file_path = os.path.join(render_temp, "blender_render.log")

        # Write GPU activation script to disk (avoids --python-expr quoting issues on Windows)
        gpu_script_path = self.write_gpu_setup_script(render_temp) if use_gpu else None

        # Build CLI command.
        # CRITICAL argument order for Blender: -b <file> [--python <script>] -o -F [-s -e] -f|-a
        # --python MUST come before any render-triggering flag (-f, -a).
        if start_frame == end_frame:
            cmd = [BLENDER_PATH, "-b", blend_path]
            if gpu_script_path:
                cmd.extend(["--python", gpu_script_path])
            cmd.extend(["-o", output_path_pattern, "-F", "PNG", "-f", str(start_frame)])
        else:
            cmd = [BLENDER_PATH, "-b", blend_path]
            if gpu_script_path:
                cmd.extend(["--python", gpu_script_path])
            cmd.extend(["-o", output_path_pattern, "-F", "PNG", "-s", str(start_frame), "-e", str(end_frame), "-a"])

        self.log(f"Executing Blender: {' '.join(cmd)}")

        if progress_callback:
            progress_callback("Launching Blender engine process...", 15)

        try:
            # CRITICAL: Do NOT use stdout=PIPE with CREATE_NO_WINDOW.
            # When Blender detects a pipe handle + no console window, it silently
            # falls back to CPU rendering, ignoring all GPU/CUDA configuration.
            # Redirect output to a real log file — Blender treats this as a valid
            # console handle and keeps GPU mode active.
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

            with open(log_file_path, "w") as log_f:
                process = subprocess.Popen(
                    cmd,
                    stdout=log_f,
                    stderr=log_f,
                    creationflags=creationflags
                )
                process.wait(timeout=300)

            # Parse the log file for GPU confirmation + progress markers
            gpu_confirmed = False
            if os.path.exists(log_file_path):
                with open(log_file_path, "r", errors="replace") as log_f:
                    for line_str in log_f:
                        line_str = line_str.strip()
                        if "GPU_ACCEL_SUCCESS" in line_str:
                            self.log(f"[Blender GPU] {line_str}")
                            gpu_confirmed = True
                        if "GPU_ACCEL_FALLBACK" in line_str:
                            self.log("[Blender GPU] Warning: GPU activation failed, rendered on CPU.")
                        if "Saved:" in line_str:
                            self.log(f"[Blender Output] {line_str}")
                        if progress_callback and ("Sample" in line_str or "Saved:" in line_str):
                            progress_callback("Rendered frame segment...", 60)

            if use_gpu and not gpu_confirmed:
                self.log("[Blender GPU] WARNING: GPU_ACCEL_SUCCESS not detected in log. Check driver/CUDA.")

            if process.returncode in (0, 1):  # Blender exits 1 in some valid success cases
                self.log("Blender process completed successfully.")
                if progress_callback:
                    progress_callback("Blender rendering complete.", 100)
                return True
            else:
                self.log(f"Blender failed with exit code: {process.returncode}")
                return False

        except Exception as e:
            self.log(f"Exception during rendering: {e}")
            return False

    def run_secure_pipeline(self, cid: str, encryption_key: str, start_frame: int, end_frame: int, ipfs_upload_cb: Callable[[str], Optional[str]], progress_callback=None) -> Optional[str]:
        """
        Executes the entire end-to-end secure render pipeline.
        1. Downloads encrypted file
        2. Decrypts blend file to memory-mapped/temp folder
        3. Renders selected frames using Blender CLI
        4. Encrypts output files
        5. Uploads encrypted output to Pinata
        6. Sanitizes disk (fully cleans up temp blend and decrypted outputs)
        """
        with tempfile.TemporaryDirectory() as raw_temp_dir:
            temp_path = Path(raw_temp_dir)
            encrypted_download = temp_path / "download.enc"
            decrypted_blend = temp_path / "project.blend"
            output_pattern = str(temp_path / "frame_####")
            
            # 1. Download encrypted asset
            if progress_callback:
                progress_callback("Downloading encrypted Blender asset...", 10)
            if not self.download_encrypted_asset(cid, str(encrypted_download)):
                self.log("Secure Pipeline Error: Failed to download encrypted asset.")
                return None
                
            # 2. Decrypt blend file
            if progress_callback:
                progress_callback("Decrypting project file...", 30)
            if not EncryptionManager.decrypt_file(str(encrypted_download), str(decrypted_blend), encryption_key):
                self.log("Secure Pipeline Error: Decryption failed (invalid key or corrupt asset).")
                return None
                
            # 3. Render frames
            if progress_callback:
                progress_callback("Running render engine...", 50)
            if not self.render_frames(str(decrypted_blend), output_pattern, start_frame, end_frame, use_gpu=True, progress_callback=progress_callback):
                self.log("Secure Pipeline Error: Blender rendering failed.")
                return None
                
            # Find the rendered frames in the temp folder
            rendered_files = sorted(list(temp_path.glob("frame_*.png")))
            if not rendered_files:
                self.log("Secure Pipeline Error: Blender finished but no output frames found!")
                return None
                
            # 4. Encrypt and Zip output files
            # For multiple frames, we can zip them or encrypt them individually, or zip first then encrypt the ZIP!
            # Zipping first then encrypting is incredibly efficient and easy for creators to download!
            if progress_callback:
                progress_callback("Securing and packing output frames...", 85)
                
            import zipfile
            zip_output_decrypted = temp_path / "results_decrypted.zip"
            zip_output_encrypted = temp_path / "results.zip.enc"
            
            with zipfile.ZipFile(zip_output_decrypted, 'w') as zipf:
                for file in rendered_files:
                    zipf.write(file, arcname=file.name)
                    
            # Encrypt the zip archive
            if not EncryptionManager.encrypt_file(str(zip_output_decrypted), str(zip_output_encrypted), encryption_key):
                self.log("Secure Pipeline Error: Encryption of results failed.")
                return None
                
            # Copy encrypted output to persistent Renders folder for viewer fallback
            persistent_out = RENDERS_DIR / f"results_{cid}.zip.enc"
            shutil.copy(str(zip_output_encrypted), str(persistent_out))
            
            # 5. Upload output
            if progress_callback:
                progress_callback("Uploading encrypted results to IPFS network...", 95)
            result_cid = ipfs_upload_cb(str(zip_output_encrypted))
            
            if not result_cid:
                self.log("Secure Pipeline Error: Failed to upload render output.")
                return None
                
            self.log(f"Secure Pipeline completed. Output Cid: {result_cid}")
            if progress_callback:
                progress_callback("Secure pipeline fully complete!", 100)
                
            return result_cid
            
            # 6. Disk Sanitization (Auto-handled by TemporaryDirectory context exit)
            # Both the decrypted .blend file, plaintext frames, and raw zips are fully deleted from disk!
