import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Define base paths
SRC_DIR = Path(__file__).parent.resolve()
WORKER_DIR = SRC_DIR.parent
PROJECT_ROOT = WORKER_DIR.parent

# Load root .env as baseline credentials, then overlay worker-specific overrides
if (PROJECT_ROOT / ".env").exists():
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
if (WORKER_DIR / ".env").exists():
    load_dotenv(dotenv_path=WORKER_DIR / ".env", override=True)

# Default configurations
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "https://rendofren.onrender.com")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://rendofren.vercel.app/")
# For the hackathon demo, we can use a random or hardcoded worker address if not set
WORKER_ADDRESS = os.getenv("WORKER_ADDRESS", "0x9999999999999999999999999999999999999999")
WORKER_PRIVATE_KEY = os.getenv("WORKER_PRIVATE_KEY", "")

# IPFS Pinata Configuration
PINATA_API_KEY = os.getenv("PINATA_API_KEY", os.getenv("REDIS_API_KEY", ""))
PINATA_API_SECRET = os.getenv("PINATA_API_SECRET", os.getenv("REDIS_API_SECRET", ""))
PINATA_JWT = os.getenv("PINATA_JWT", os.getenv("REDIS_JWT", ""))

# Upstash Redis REST
UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL", "")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")

# Blockchain Configuration
BASE_RPC_URL = os.getenv("BASE_RPC_URL", "")
NETWORK_CHAIN_ID = int(os.getenv("NETWORK_CHAIN_ID", "84532"))

import platform

# Blender executable fallback logic (Portable, Cloud, or System-wide)
is_linux = platform.system() == "Linux"
FORCE_LOCAL_ADDRESS = os.getenv("FORCE_LOCAL_ADDRESS", "false").lower() == "true"

if is_linux:
    # Search both the worker folder and the root project folder for the extracted Blender
    path_worker = WORKER_DIR / "blender-4.1.0-linux-x64" / "blender"
    path_root = PROJECT_ROOT / "blender-4.1.0-linux-x64" / "blender"
    
    if path_worker.exists():
        BLENDER_DEFAULT = str(path_worker.resolve())
    elif path_root.exists():
        BLENDER_DEFAULT = str(path_root.resolve())
    else:
        BLENDER_DEFAULT = "blender"
else:
    if getattr(sys, 'frozen', False):
        _portable = Path(sys.executable).parent / "blender" / "blender.exe"
        if _portable.exists():
            BLENDER_DEFAULT = str(_portable)
        else:
            BLENDER_DEFAULT = "C:/Program Files/Blender Foundation/Blender 4.1/blender.exe"
    else:
        if (WORKER_DIR / "blender" / "blender.exe").exists():
            BLENDER_DEFAULT = str(WORKER_DIR / "blender" / "blender.exe")
        else:
            BLENDER_DEFAULT = "C:/Program Files/Blender Foundation/Blender 4.1/blender.exe"

BLENDER_PATH = os.getenv("BLENDER_PATH", BLENDER_DEFAULT)

# Safety check: On Linux, force-override if the .env path is relative or Windows-based
if is_linux:
    if not BLENDER_PATH.startswith("/") or BLENDER_PATH.startswith("C:") or BLENDER_PATH.startswith("D:"):
        BLENDER_PATH = BLENDER_DEFAULT

# Performance & Polling config
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "10"))
USE_PERSISTENT_TEMP = os.getenv("USE_PERSISTENT_TEMP", "true").lower() in ("true", "1", "yes")

# API Authentication
WORKER_API_KEY = os.getenv("WORKER_API_KEY", "")

# Directories
TEMP_DIR = WORKER_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)

RENDERS_DIR = WORKER_DIR / "renders"
RENDERS_DIR.mkdir(exist_ok=True)

# Save configuration file
CONFIG_FILE = WORKER_DIR / "config_cache.json"

def save_worker_identity(address, private_key):
    """Save worker keys back to .env for persistence"""
    env_file = WORKER_DIR / ".env"
    if not env_file.exists() and (PROJECT_ROOT / ".env").exists():
        env_file = PROJECT_ROOT / ".env"
        
    # Read existing or create new
    lines = []
    if env_file.exists():
        with open(env_file, 'r') as f:
            lines = f.readlines()
            
    # Update or add WORKER_ADDRESS and WORKER_PRIVATE_KEY
    updated_address = False
    updated_key = False
    for i, line in enumerate(lines):
        if line.startswith("WORKER_ADDRESS="):
            lines[i] = f'WORKER_ADDRESS="{address}"\n'
            updated_address = True
        elif line.startswith("WORKER_PRIVATE_KEY="):
            lines[i] = f'WORKER_PRIVATE_KEY="{private_key}"\n'
            updated_key = True
            
    if not updated_address:
        lines.append(f'WORKER_ADDRESS="{address}"\n')
    if not updated_key:
        lines.append(f'WORKER_PRIVATE_KEY="{private_key}"\n')
        
    with open(env_file, 'w') as f:
        f.writelines(lines)
        
    # Reload environment variables
    load_dotenv(dotenv_path=env_file, override=True)
    global WORKER_ADDRESS, WORKER_PRIVATE_KEY
    WORKER_ADDRESS = address
    WORKER_PRIVATE_KEY = private_key
