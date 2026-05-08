"""
src/headless_worker.py
Lightweight headless server CLI daemon for RendoFren GPU Worker.
Allows running the node on headless rendering servers, Docker, or background environments.
Uses the exact same core api_client and render_manager as the PyQt6 GUI.
"""
import os
import sys
import time
import secrets
from pathlib import Path

# Fix sys path
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

from src.config import BACKEND_API_URL, WORKER_ADDRESS, POLL_INTERVAL
from src.api_client import WorkerAPIClient
from src.render_manager import RenderManager
from src.gpu_monitor import GPUMonitor

class HeadlessWorker:
    def __init__(self):
        self.api = WorkerAPIClient(ui_logger_callback=self.log)
        self.renderer = RenderManager(logger_callback=self.log)
        self.running = False

    def log(self, text: str):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [HEADLESS-NODE] {text}", flush=True)

    def process_job(self, job: dict):
        job_id = str(job.get("id", job.get("_id", secrets.token_hex(4))))
        cid = job.get("asset_cid", job.get("full_asset_cid", ""))
        enc_key = job.get("encryption_key", "rendofren_hack")
        start_frame = int(job.get("start_frame", 1))
        end_frame = int(job.get("end_frame", 1))
        reward = float(job.get("reward_amount", job.get("reward", 0.05)))

        self.log(f"Received Job Assignment! ID: {job_id} | CID: {cid} | Segment: {start_frame}-{end_frame}")
        
        # 1. Claim job on backend
        if not self.api.claim_job(job_id):
            self.log(f"Failed to claim job {job_id} (already assigned or network error).")
            return

        self.log(f"Successfully claimed job {job_id}. Running secure sandbox render...")

        # 2. Frame-level progress tracking
        def progress_tracker(step_name, pct):
            self.log(f"Progress: {step_name} -> {pct}%")
            # We can also notify backend of progress if needed
            self.api.sio.emit("worker:frame_progress", {
                "jobId": job_id,
                "samplesCompleted": pct,
                "totalSamples": 100,
                "frameIdx": start_frame
            })

        # 3. Run secure pipeline
        result_cid = self.renderer.run_secure_pipeline(
            cid=cid,
            encryption_key=enc_key,
            start_frame=start_frame,
            end_frame=end_frame,
            ipfs_upload_cb=self.api.upload_to_pinata,
            progress_callback=progress_tracker
        )

        if result_cid:
            self.log(f"Secure render success! Uploaded output to IPFS CID: {result_cid}")
            self.api.submit_job_completion(job_id, result_cid)
            self.api.sio.emit("worker:job_complete", {"jobId": job_id, "resultCid": result_cid})
        else:
            self.log(f"Secure render failed for job {job_id}.")
            self.api.submit_job_failure(job_id, "Rendering execution failed on worker hardware.")
            self.api.sio.emit("worker:job_failed", {"jobId": job_id, "error": "Blender execution failure."})

    def start(self):
        self.running = True
        self.log("=" * 60)
        self.log("  RENDOFREN HEADLESS SERVER GPU WORKER INITIALIZING")
        self.log("=" * 60)
        self.log(f"Backend API URL: {BACKEND_API_URL}")
        self.log(f"Worker Address: {WORKER_ADDRESS}")

        # 1. Query local GPU capabilities
        gpu_info = GPUMonitor.get_gpu_info()
        self.log(f"GPU Detected: {gpu_info.get('name', 'CPU Falling Back')} | VRAM: {gpu_info.get('vram_total', 0)} MB")

        # 2. Register with backend
        if not self.api.register_or_authenticate():
            self.log("[CRITICAL] Failed to authenticate with RendoFren backend server.")
            return

        self.log("Registration successful.")

        # 3. Handle Socket.io connections for real-time dispatch
        self.api.connect_socket_io(on_job_received_cb=self.process_job)

        # 4. Heartbeat & Event loop
        self.log("Entering active telemetry & job listening loop...")
        while self.running:
            try:
                if self.api.connected_sio:
                    # Send periodic worker heartbeat containing GPU metrics
                    gpu = GPUMonitor.get_gpu_info()
                    sys_stats = GPUMonitor.get_system_stats()
                    cpu_use = sys_stats.get("cpu_usage", 5.0)
                    
                    self.api.sio.emit("worker:heartbeat", {
                        "gpu": gpu.get("name", "Unknown GPU"),
                        "vram": gpu.get("vram_total", 0), # in MB/GB
                        "usage": gpu.get("usage", cpu_use),
                        "temperature": gpu.get("temperature", 55),
                        "benchmarkScore": self.api._bench_score or 485, # persist or fallback
                        "status": "idle"
                    })
                else:
                    self.log("Socket connection lost. Reconnecting...")
                    self.api.connect_socket_io(on_job_received_cb=self.process_job)

                # Wait interval
                time.sleep(10)
            except KeyboardInterrupt:
                self.log("Shutting down headless worker...")
                self.running = False
            except Exception as e:
                self.log(f"Heartbeat loop exception: {e}")
                time.sleep(10)

if __name__ == "__main__":
    worker = HeadlessWorker()
    worker.start()
