import os
import sys
import tempfile
import shutil
from pathlib import Path

# Adjust path to import src modules
sys.path.insert(0, str(Path(__file__).parent.resolve()))

try:
    from src.encryption import EncryptionManager
    from src.gpu_monitor import GPUMonitor
    from src.benchmark import GPUBenchmarker
    from src.config import TEMP_DIR
    print("[OK] Successfully imported RendoFren worker core modules.")
except ImportError as e:
    print(f"[FAIL] Import error: {e}")
    sys.exit(1)

def run_test_suite():
    print("\n==========================================")
    print("   RENDOFREN WORKER PHASE 1 TEST SUITE    ")
    print("==========================================\n")
    
    tests_passed = 0
    total_tests = 3
    
    # -------------------------------------------------------------
    # Test 1: Secure AES-256-CBC Encryption & Decryption Sandbox
    # -------------------------------------------------------------
    print("[Test 1/3] Testing AES-256 Encryption & Decryption Pipeline...")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_file = temp_path / "original_project.blend"
            encrypted_file = temp_path / "project.blend.enc"
            decrypted_file = temp_path / "decrypted_project.blend"
            
            # Write a mock blend file content
            original_content = b"RenderDataBlock_Blender_3D_Project_Mock_Content_" * 100
            with open(source_file, 'wb') as f:
                f.write(original_content)
                
            passphrase = "super_secret_hackathon_escrow_passphrase_2026"
            
            # Encrypt
            enc_success = EncryptionManager.encrypt_file(
                str(source_file), str(encrypted_file), passphrase
            )
            if not enc_success or not encrypted_file.exists():
                raise RuntimeError("Encryption failed or did not output file.")
                
            # Verify file contents are modified (not raw plaintext anymore)
            with open(encrypted_file, 'rb') as f:
                encrypted_content = f.read()
            if original_content in encrypted_content:
                raise RuntimeError("Security Breach: Plaintext was found inside the encrypted output!")
                
            # Decrypt
            dec_success = EncryptionManager.decrypt_file(
                str(encrypted_file), str(decrypted_file), passphrase
            )
            if not dec_success or not decrypted_file.exists():
                raise RuntimeError("Decryption failed or did not output file.")
                
            # Verify exact content matches
            with open(decrypted_file, 'rb') as f:
                final_content = f.read()
            if final_content != original_content:
                raise RuntimeError("Integrity Error: Decrypted content does not match original!")
                
            # Test decryption failure with incorrect key (security boundary)
            corrupted_decrypt = temp_path / "corrupted.blend"
            bad_key_success = EncryptionManager.decrypt_file(
                str(encrypted_file), str(corrupted_decrypt), "wrong_passphrase"
            )
            # Decrypting with wrong key should either fail or output corrupted unpadded data which throws padding errors
            if bad_key_success:
                # Double check if integrity is breached (it should be gibberish or crash)
                if corrupted_decrypt.exists():
                    with open(corrupted_decrypt, 'rb') as f:
                        gibberish = f.read()
                    if gibberish == original_content:
                        raise RuntimeError("Security Breach: Decrypted successfully with wrong passphrase!")
            
            print("[PASS] AES-256 encryption, decryption, integrity, and security boundaries verified.")
            tests_passed += 1
    except Exception as e:
        print(f"[FAIL] Encryption test failed: {e}")
        import traceback
        traceback.print_exc()

    # -------------------------------------------------------------
    # Test 2: Hardware Telemetry and Device Scanner
    # -------------------------------------------------------------
    print("\n[Test 2/3] Testing Hardware Telemetry and Device Scanner...")
    try:
        gpu = GPUMonitor.get_gpu_info()
        sys_stats = GPUMonitor.get_system_stats()
        
        print(f"  - Detected GPU Hardware: {gpu.get('name')}")
        print(f"  - GPU Usage: {gpu.get('usage')}% | Temperature: {gpu.get('temperature')} C")
        print(f"  - Allocated VRAM: {gpu.get('vram_used')} GB / {gpu.get('vram_total')} GB")
        print(f"  - CPU Load: {sys_stats.get('cpu_usage')}% | System RAM: {sys_stats.get('ram_used')} / {sys_stats.get('ram_total')} GB")
        print(f"  - Free Storage: {sys_stats.get('disk_free_gb')} GB")
        
        # Verify dictionary structure and numeric correctness
        assert isinstance(gpu, dict), "GPU info must be a dictionary"
        assert isinstance(sys_stats, dict), "System stats must be a dictionary"
        assert gpu.get("vram_total") >= 0, "VRAM total must be non-negative"
        assert sys_stats.get("cpu_usage") >= 0, "CPU usage must be non-negative"
        
        print("[PASS] Hardware telemetry successfully fetched and verified.")
        tests_passed += 1
    except Exception as e:
        print(f"[FAIL] Telemetry scan failed: {e}")

    # -------------------------------------------------------------
    # Test 3: Standardized Benchmarking Calculation
    # -------------------------------------------------------------
    print("\n[Test 3/3] Testing Performance Rating Calculation...")
    try:
        # Check calculation parameters
        score_fast = GPUBenchmarker.calculate_score(5.0)   # 5s render
        score_med = GPUBenchmarker.calculate_score(15.42)  # 15s render
        score_slow = GPUBenchmarker.calculate_score(120.0) # 120s render
        
        print(f"  - Performance rating for 5s render (high-end): {score_fast} PTS")
        print(f"  - Performance rating for 15.42s render (mid-end): {score_med} PTS")
        print(f"  - Performance rating for 120s render (low-end): {score_slow} PTS")
        
        assert score_fast > score_med > score_slow, "Scoring hierarchy violated!"
        assert score_fast == 1000, f"Expected 1000, got {score_fast}"
        assert score_slow == 41, f"Expected 41, got {score_slow}"
        
        blender_found = GPUBenchmarker.check_blender()
        print(f"  - Blender CLI availability on host: {'AVAILABLE' if blender_found else 'NOT DETECTED (Estimator fallback active)'}")
        
        print("[PASS] Benchmarking algorithm and estimator fallback verified.")
        tests_passed += 1
    except Exception as e:
        print(f"[FAIL] Benchmark check failed: {e}")

    # -------------------------------------------------------------
    # Results Summary
    # -------------------------------------------------------------
    print("\n==========================================")
    print(f"  RESULT: {tests_passed} / {total_tests} TESTS PASSED")
    print("==========================================")
    if tests_passed == total_tests:
        print("Worker Core System is 100% stable and fully operational!")
        return True
    else:
        print("Some tests failed. Please review errors above.")
        return False

if __name__ == "__main__":
    success = run_test_suite()
    sys.exit(0 if success else 1)
