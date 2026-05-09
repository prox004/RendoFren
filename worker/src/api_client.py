"""
api_client.py
Full bidirectional communication layer between the worker node and the RendoFren backend.
Handles: registration, heartbeats, job polling, job claiming, completion reporting,
         real-time Socket.io events, and direct Pinata IPFS uploads.
"""
import os
import time
import threading
import requests
import socketio
from typing import Optional, List, Callable
from .config import (
    BACKEND_API_URL, WORKER_ADDRESS, WORKER_PRIVATE_KEY,
    PINATA_API_KEY, PINATA_API_SECRET, PINATA_JWT, POLL_INTERVAL,
    WORKER_API_KEY
)


class WorkerAPIClient:
    """Handles all communication between the worker node and the backend orchestrator."""

    def __init__(self, ui_logger_callback=None):
        self.backend_url = BACKEND_API_URL.rstrip('/')
        self.worker_address = WORKER_ADDRESS
        self.worker_api_key = WORKER_API_KEY
        self.ui_logger = ui_logger_callback or print

        self.sio: Optional[socketio.Client] = None
        self.connected_sio = False
        self.job_callback: Optional[Callable] = None

        # Account info from API Key
        self.account_info = None

        # Background heartbeat thread
        self._heartbeat_stop = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._last_gpu_stats = {}
        self._current_status = "idle"
        self._bench_score = self._load_persisted_score()

    def _load_persisted_score(self) -> int:
        """Loads cached benchmark score from config_cache.json"""
        from .config import CONFIG_FILE
        import json
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    return data.get("benchmarkScore", 0)
            except:
                pass
        return 0

    def _save_persisted_score(self, score: int):
        """Saves benchmark score to config_cache.json"""
        from .config import CONFIG_FILE
        import json
        data = {}
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
            except:
                pass
        data["benchmarkScore"] = score
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(data, f)
        except:
            pass

    # ─────────────────────────── Logging ───────────────────────────────
    def log(self, msg: str):
        self.ui_logger(f"[Network] {msg}")

    # ─────────────────────────── Registration ──────────────────────────
    def register_or_authenticate(self, register: bool = True) -> bool:
        """
        Register this worker with the backend.
        Uses /api/workers/register (HTTP POST).
        """
        # Enforce API Key registration requirement
        if not self.worker_api_key:
            self.log("Registration Blocked: RendoFren Worker API Key is missing. Please provide a valid key under Config.")
            return False
            
        try:
            self.log(f"Fetching account details via API Key...")
            auth_url = f"{self.backend_url}/api/auth/me"
            resp = requests.get(auth_url, headers={"x-api-key": self.worker_api_key}, timeout=5)
            if resp.status_code == 200:
                self.account_info = resp.json()
                user_addr = self.account_info.get("address")
                from .config import FORCE_LOCAL_ADDRESS
                if user_addr and not FORCE_LOCAL_ADDRESS:
                    self.worker_address = user_addr
                self.log(f"Authenticated as: {self.account_info.get('email', 'Unknown User')} ({self.worker_address})")
                self.log(f"Status: {'VIEW-ONLY (API Managed)' if not FORCE_LOCAL_ADDRESS else 'FORCE LOCAL WALLET ACTIVE'}")
                
                # If we only want to validate credentials, return early without registering the worker node
                if not register:
                    return True
            else:
                self.log(f"API Key authentication failed (HTTP {resp.status_code}). Blocked from joining network.")
                return False
        except Exception as e:
            self.log(f"Error during API Key auth: {e}")
            return False

        url = f"{self.backend_url}/api/workers/register"
        from .gpu_monitor import GPUMonitor
        from .benchmark import GPUBenchmarker
        
        gpu = GPUMonitor.get_gpu_info()
        gpu_name = gpu.get("name", "Unknown GPU")
        
        # Pull official score directly from the offline gpu.json using the hardware string
        official_score = GPUBenchmarker.calculate_score(elapsed_time=0, gpu_name=gpu_name)
        if official_score > 0:
            self._bench_score = official_score
            self._save_persisted_score(self._bench_score)
            
        payload = {
            "address": self.worker_address,
            "gpuName": gpu_name,
            "vram": gpu.get("vram_total", 0),
            "benchmarkScore": self._bench_score or 180,
            "status": "idle",
        }
        self.log(f"Registering worker at {url} ...")
        try:
            r = requests.post(url, json=payload, timeout=6)
            if r.status_code in (200, 201):
                self.log(f"Registered successfully. Address: {self.worker_address}")
                return True
            else:
                self.log(f"Registration returned {r.status_code}: {r.text[:120]}")
                return True  # Still allow operation even if backend skipped it
        except requests.exceptions.ConnectionError:
            self.log(f"Backend not reachable at {self.backend_url}. Running in offline mode.")
            return False
        except Exception as e:
            self.log(f"Registration error: {e}")
            return False

    # ─────────────────────────── Heartbeat ────────────────────────────
    def send_heartbeat(self, gpu_stats: dict, system_stats: dict,
                       status: str = "idle", current_job_id: str = None) -> bool:
        """
        Sends live telemetry to the backend every POLL_INTERVAL seconds.
        Prefers Socket.io emit; falls back to HTTP POST.
        Endpoint: POST /api/workers/:address/heartbeat
        """
        self._last_gpu_stats = gpu_stats
        self._last_sys_stats = system_stats
        self._current_status = status
        
        # If a score was passed in stats/payload, persist it
        if "benchmarkScore" in gpu_stats and gpu_stats["benchmarkScore"] > 0:
            self._bench_score = gpu_stats["benchmarkScore"]
            self._save_persisted_score(self._bench_score)

        payload = {
            "gpu": gpu_stats.get("name", "Unknown GPU"),
            "vram": gpu_stats.get("vram_total", 0),
            "usage": gpu_stats.get("usage", 0),
            "temperature": gpu_stats.get("temperature", 0),
            "benchmarkScore": self._bench_score,
            "status": status,
            "currentJobId": current_job_id,
        }

        # Socket.io fast path
        if self.connected_sio and self.sio:
            try:
                self.sio.emit("worker:heartbeat", payload)
                return True
            except Exception:
                pass

        # HTTP fallback
        url = f"{self.backend_url}/api/workers/{self.worker_address}/heartbeat"
        try:
            r = requests.post(url, json=payload, timeout=4)
            return r.status_code in (200, 201)
        except Exception:
            return False

    def update_benchmark_score(self, score: int):
        """Called by the GUI after a benchmark completes to update the score reported in heartbeats."""
        self._bench_score = score
        self._save_persisted_score(score)
        # Immediately push to backend
        url = f"{self.backend_url}/api/workers/{self.worker_address}/heartbeat"
        try:
            requests.post(url, json={"benchmarkScore": score, "status": self._current_status}, timeout=4)
        except Exception:
            pass

    # ─────────────────────────── Job Polling (HTTP fallback) ───────────
    def fetch_jobs(self) -> List[dict]:
        """
        Poll for pending jobs from the backend.
        Endpoint: GET /api/jobs  (filters for pending status client-side)
        """
        url = f"{self.backend_url}/api/jobs"
        try:
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                data = r.json()
                jobs = data.get("jobs", data) if isinstance(data, dict) else data
                # Only return jobs that are pending and not yet assigned
                pending = [j for j in jobs if j.get("status") in ("pending", "queued")]
                return pending
        except Exception:
            pass
        return []

    def claim_job(self, job_id: str) -> bool:
        """
        Claim a job so no other worker picks it up.
        Endpoint: POST /api/jobs/:id/claim
        """
        url = f"{self.backend_url}/api/jobs/{job_id}/claim"
        try:
            r = requests.post(url, json={"workerAddress": self.worker_address}, timeout=5)
            if r.status_code not in (200, 201):
                self.log(f"Claim HTTP error: Status {r.status_code} | Msg: {r.text}")
            return r.status_code in (200, 201)
        except Exception as e:
            import traceback
            self.log(f"Claim exception: {e}")
            traceback.print_exc()
            return False

    def submit_job_completion(self, job_id: str, result_cid: str) -> bool:
        """
        Report successful job completion with the IPFS CID of the output.
        Endpoint: POST /api/jobs/:id/complete
        """
        url = f"{self.backend_url}/api/jobs/{job_id}/complete"
        payload = {
            "workerAddress": self.worker_address,
            "resultCid": result_cid,
        }
        try:
            r = requests.post(url, json=payload, timeout=8)
            return r.status_code in (200, 201)
        except Exception:
            return False

    def submit_job_failure(self, job_id: str, error: str) -> bool:
        """
        Report a job failure back to the backend.
        Endpoint: POST /api/jobs/:id/fail
        """
        url = f"{self.backend_url}/api/jobs/{job_id}/fail"
        try:
            r = requests.post(url, json={"workerAddress": self.worker_address, "error": error}, timeout=5)
            return r.status_code in (200, 201)
        except Exception:
            return False

    # ─────────────────────────── IPFS Upload ──────────────────────────
    def upload_to_pinata(self, file_path: str) -> Optional[str]:
        """
        Upload a file directly to Pinata IPFS and return the CID.
        Uses JWT auth if available, falls back to API key/secret pair.
        """
        if not PINATA_JWT and not (PINATA_API_KEY and PINATA_API_SECRET):
            self.log("Pinata credentials missing — IPFS upload skipped.")
            return None

        self.log(f"Uploading to Pinata IPFS: {os.path.basename(file_path)} ...")
        url = "https://api.pinata.cloud/pinning/pinFileToIPFS"

        headers = {}
        if PINATA_JWT:
            headers["Authorization"] = f"Bearer {PINATA_JWT}"
        else:
            headers["pinata_api_key"] = PINATA_API_KEY
            headers["pinata_secret_api_key"] = PINATA_API_SECRET

        try:
            filename = os.path.basename(file_path)
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "application/octet-stream")}
                data = {"pinataMetadata": f'{{"name":"rendofren_{filename}"}}'}
                r = requests.post(url, files=files, data=data, headers=headers, timeout=120)
                r.raise_for_status()
                cid = r.json().get("IpfsHash")
                self.log(f"Pinned to IPFS → CID: {cid}")
                return cid
        except Exception as e:
            self.log(f"Pinata upload failed: {e}")
            return None

    # ─────────────────────────── Socket.io ────────────────────────────
    def connect_socket_io(self, on_job_received_cb: Callable):
        """
        Connect to the backend Socket.io server for real-time job dispatch.
        Worker joins its private room so the dispatcher can push jobs directly.
        """
        self.job_callback = on_job_received_cb
        try:
            self.sio = socketio.Client(
                reconnection=True,
                reconnection_attempts=20,
                reconnection_delay=5,
                logger=False,
                engineio_logger=False,
            )

            @self.sio.event
            def connect():
                self.connected_sio = True
                self.log("Socket.io connected to backend orchestrator.")
                # Announce this worker's identity + register
                from .gpu_monitor import GPUMonitor
                gpu = GPUMonitor.get_gpu_info()
                self.sio.emit("worker:register", {
                    "address": self.worker_address,
                    "gpuName": gpu.get("name", "Unknown GPU"),
                    "vram": gpu.get("vram_total", 0),
                    "benchmarkScore": getattr(self, "_bench_score", 0),
                })

            @self.sio.event
            def connect_error(data):
                self.log(f"Socket.io connection error: {data}")

            @self.sio.event
            def disconnect():
                self.connected_sio = False
                self.log("Socket.io disconnected.")

            # ── Receive job dispatch from backend dispatcher ──
            @self.sio.on("job:assigned")
            def on_job_assigned(data):
                self.log(f"Real-time job dispatch received: jobId={data.get('jobId')}")
                if self.job_callback:
                    # Normalize to the field names the worker pipeline expects
                    normalized = {
                        "id": data.get("jobId"),
                        "asset_cid": data.get("assetCid"),
                        "encryption_key": data.get("encryptionKey"),
                        "start_frame": data.get("startFrame", 1),
                        "end_frame": data.get("endFrame", 1),
                        "reward_amount": data.get("rewardEth", 0.001),
                    }
                    self.job_callback(normalized)

            # ── Worker receives a ping from the backend ──
            @self.sio.on("ping")
            def on_ping():
                if self.sio:
                    self.sio.emit("pong", {"address": self.worker_address})

            # Connect with worker role query parameter so socketHandler.js routes it correctly
            connect_url = f"{self.backend_url}?role=worker&address={self.worker_address}"
            self.sio.connect(
                connect_url,
                namespaces=["/"],
                transports=["websocket", "polling"],
                auth={"role": "worker", "address": self.worker_address},
                # Pass role + address as headers for socketHandler.js
                headers={"role": "worker", "address": self.worker_address},
            )
            # Give it a moment to settle
            time.sleep(0.5)

        except Exception as e:
            self.log(f"Socket.io setup failed (HTTP polling fallback will be used): {e}")
            self.connected_sio = False

    def disconnect_socket_io(self):
        """Cleanly disconnect Socket.io."""
        if self.sio and self.connected_sio:
            try:
                self.sio.disconnect()
            except Exception:
                pass
        self.connected_sio = False
