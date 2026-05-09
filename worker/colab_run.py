# ====================================================================
# RendoFren GPU Worker - Colab & Kaggle Node Execution
# ====================================================================
import os
import sys
from pathlib import Path

BASE_DIR = Path.cwd()
BLENDER_DIR = BASE_DIR / "blender-4.1.0-linux-x64"

def print_banner(text):
    print("\n" + "=" * 65)
    print(f"  {text}")
    print("=" * 65 + "\n", flush=True)

print_banner("Launching Headless Render Node...")

blender_bin = BLENDER_DIR / "blender"
if not blender_bin.exists():
    print("[FATAL ERROR] Blender binary not found! Please run colab_setup.py first!")
    sys.exit(1)

os.chmod(blender_bin, 0o755)

# Inject environment overrides for portable run
os.environ["BLENDER_PATH"] = str(blender_bin)
os.environ["USE_PERSISTENT_TEMP"] = "true"

# Write dynamic credentials file if we have system arguments
api_key = sys.argv[1] if len(sys.argv) > 1 else os.getenv("WORKER_API_KEY", "")
backend_url = sys.argv[2] if len(sys.argv) > 2 else os.getenv("BACKEND_API_URL", "https://rendofren.onrender.com")

if api_key:
    os.environ["WORKER_API_KEY"] = api_key
    print(f" -> Active Node Security Key: {api_key[:6]}...{api_key[-4:]}")
else:
    print(" -> WARNING: No WORKER_API_KEY was passed! Node registration will be rejected by backend.")

os.environ["BACKEND_API_URL"] = backend_url
print(f" -> Target Cluster Oracle URL: {backend_url}")

# Ensure we import from the package src folder
sys.path.insert(0, str(BASE_DIR))

# Import and execute the headless daemon
try:
    from src.headless_worker import HeadlessWorker
    daemon = HeadlessWorker()
    daemon.start()
except KeyboardInterrupt:
    print("\n[RendoFren] Shutting down cloud render node cleanly via User Interrupt.")
except Exception as e:
    import traceback
    print(f"\n[FATAL ERROR] Daemon execution failed: {e}")
    traceback.print_exc()
