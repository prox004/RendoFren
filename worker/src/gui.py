import os
import sys
import time
import secrets
from datetime import datetime

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QLineEdit, QTextEdit, QProgressBar,
    QTabWidget, QGroupBox, QFormLayout, QSystemTrayIcon, QMenu,
    QMessageBox, QFrame, QGridLayout, QSizePolicy
)
from PyQt6.QtCore import Qt, QTimer, QThread, pyqtSignal, QSize
from PyQt6.QtGui import QIcon, QFont, QAction, QColor, QTextCursor, QPalette

from .config import (
    BACKEND_API_URL, WORKER_ADDRESS, WORKER_PRIVATE_KEY,
    PINATA_API_KEY, PINATA_API_SECRET, PINATA_JWT, POLL_INTERVAL,
    save_worker_identity, CONFIG_FILE, BLENDER_PATH, FRONTEND_URL
)
from .gpu_monitor import GPUMonitor
from .benchmark import GPUBenchmarker
from .api_client import WorkerAPIClient
from .render_manager import RenderManager

# Cyberpunk Styling Palette (Neon Dark)
QSS_STYLING = """
QMainWindow {
    background-color: #0b0c10;
}
QWidget {
    font-family: 'Outfit', 'Segoe UI', Arial;
    color: #c5c6c7;
}
QFrame {
    background-color: #1f2833;
    border: 1px solid #45a29e;
    border-radius: 12px;
}
QLabel {
    color: #c5c6c7;
    font-size: 13px;
    border: none;
    background: transparent;
}
QLabel#titleLabel {
    color: #66fcf1;
    font-weight: bold;
    font-size: 24px;
    margin-bottom: 5px;
}
QLabel#subtitleLabel {
    color: #45a29e;
    font-size: 12px;
    margin-bottom: 15px;
}
QLabel#cardVal {
    color: #66fcf1;
    font-size: 26px;
    font-weight: bold;
}
QLabel#cardLbl {
    color: #45a29e;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
}
QGroupBox {
    border: 2px solid #45a29e;
    border-radius: 10px;
    margin-top: 20px;
    font-weight: bold;
    color: #66fcf1;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 5px 0 5px;
}
QPushButton {
    background-color: #1f2833;
    border: 2px solid #66fcf1;
    border-radius: 8px;
    color: #66fcf1;
    font-weight: bold;
    font-size: 13px;
    padding: 8px 16px;
}
QPushButton:hover {
    background-color: #66fcf1;
    color: #0b0c10;
}
QPushButton:pressed {
    background-color: #45a29e;
    color: #0b0c10;
}
QPushButton#glowButton {
    background-color: #0b0c10;
    border: 2px solid #ff007f;
    color: #ff007f;
}
QPushButton#glowButton:hover {
    background-color: #ff007f;
    color: #0b0c10;
}
QLineEdit {
    background-color: #0b0c10;
    border: 1px solid #45a29e;
    border-radius: 6px;
    color: #66fcf1;
    padding: 6px;
    font-family: 'Consolas', monospace;
}
QLineEdit:focus {
    border: 1px solid #66fcf1;
}
QTextEdit {
    background-color: #0b0c10;
    border: 1px solid #45a29e;
    border-radius: 8px;
    color: #c5c6c7;
    padding: 8px;
    font-family: 'Consolas', monospace;
    font-size: 12px;
}
QProgressBar {
    background-color: #1f2833;
    border: 1px solid #45a29e;
    border-radius: 8px;
    text-align: center;
    color: #ffffff;
    font-weight: bold;
}
QProgressBar::chunk {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #66fcf1, stop:1 #ff007f);
    border-radius: 7px;
}
QTabWidget::pane {
    border: 1px solid #45a29e;
    border-radius: 12px;
    background-color: #11141a;
}
QTabBar::tab {
    background: #0b0c10;
    border: 1px solid #45a29e;
    border-bottom: none;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    padding: 8px 16px;
    color: #45a29e;
    font-weight: bold;
}
QTabBar::tab:selected {
    background: #11141a;
    border-color: #66fcf1;
    color: #66fcf1;
}
QTabBar::tab:hover {
    color: #66fcf1;
}
"""

class WorkerBackgroundThread(QThread):
    """Background worker loop thread that fetches, assigns, and executes secure Blender rendering jobs"""
    
    log_signal = pyqtSignal(str)
    progress_signal = pyqtSignal(str, int)
    status_signal = pyqtSignal(str, str) # status, job_id
    stats_signal = pyqtSignal(int, float) # completed_jobs, earnings
    
    def __init__(self, api_client: WorkerAPIClient, renderer: RenderManager):
        super().__init__()
        self.api = api_client
        self.renderer = renderer
        self.running = False
        self.completed_jobs = 0
        self.earnings = 0.0
        
    def log(self, text: str):
        self.log_signal.emit(text)
        
    def stop(self):
        self.running = False
        self.api.disconnect_socket_io()
        
    def run(self):
        self.running = True
        self.log("Worker pipeline background engine started.")
        
        # 1. Register/Authenticate at backend
        if not self.api.register_or_authenticate():
            self.log("Authentication Failed: Blocked from joining network. Shutting down daemon...")
            self.status_signal.emit("offline / unauthenticated", "")
            self.running = False
            return
        else:
            self.status_signal.emit("idle", "")
            
        # 2. Connect socket.io for real-time dispatch
        def on_socket_job(job_data):
            self.log(f"Instantly dispatced job payload received: {job_data}")
            self.process_incoming_job(job_data)
            
        self.api.connect_socket_io(on_socket_job)
        
        # 3. Core job polling fallback loop
        while self.running:
            try:
                # If socket.io is connected, we don't need to poll HTTP
                if not self.api.connected_sio:
                    self.status_signal.emit("polling", "")
                    available_jobs = self.api.fetch_jobs()
                    
                    if available_jobs:
                        # Grab first job
                        job = available_jobs[0]
                        self.process_incoming_job(job)
                    else:
                        self.status_signal.emit("idle", "")
                else:
                    self.status_signal.emit("idle (socket linked)", "")
                    
                # High-frequency sleep to allow fast shutdown
                for _ in range(POLL_INTERVAL):
                    if not self.running:
                        break
                    time.sleep(1)
                    
            except Exception as e:
                self.log(f"Engine Loop Exception: {e}")
                time.sleep(5)
                
    def process_incoming_job(self, job: dict):
        """Processes an assigned or claimed job inside the secure pipeline"""
        job_id = str(job.get("id", job.get("_id", secrets.token_hex(4))))
        cid = job.get("asset_cid", job.get("full_asset_cid", ""))
        enc_key = job.get("encryption_key", "rendofren_hack")
        start_frame = int(job.get("start_frame", 1))
        end_frame = int(job.get("end_frame", 1))
        reward = float(job.get("reward_amount", job.get("reward", 0.05)))
        
        self.log(f"Claiming job ID: {job_id} | CID: {cid} | Segment: {start_frame}-{end_frame}...")
        self.status_signal.emit("claiming", job_id)
        
        # Claim
        if not self.api.claim_job(job_id):
            self.log(f"Failed to claim job {job_id} (already assigned or network error).")
            return
            
        self.log(f"Successfully claimed job {job_id}. Activating secure sandbox render...")
        self.status_signal.emit("rendering", job_id)
        
        # Execute Secure Pipeline (renders and uploads)
        def progress_tracker(step_name, pct):
            self.progress_signal.emit(step_name, pct)
            
        result_cid = self.renderer.run_secure_pipeline(
            cid=cid,
            encryption_key=enc_key,
            start_frame=start_frame,
            end_frame=end_frame,
            ipfs_upload_cb=self.api.upload_to_pinata,
            progress_callback=progress_tracker
        )
        
        if result_cid:
            self.log("Submitting completion proof back to backend...")
            self.progress_signal.emit("Submitting render proof...", 98)
            
            if self.api.submit_job_completion(job_id, result_cid):
                self.log(f"Job {job_id} completed and verified! Earned {reward} ETH.")
                self.completed_jobs += 1
                self.earnings += reward
                self.stats_signal.emit(self.completed_jobs, self.earnings)
            else:
                self.log(f"Error submitting completion proof for job {job_id}.")
        else:
            error_msg = f"Render pipeline failed for job {job_id}."
            self.log(error_msg)
            self.api.submit_job_failure(job_id, error_msg)
            
        self.progress_signal.emit("Pipeline idle", 0)
        self.status_signal.emit("idle", "")


class BenchmarkThread(QThread):
    """Runs the hardware benchmark in the background to avoid freezing the UI"""
    progress_signal = pyqtSignal(str, int)
    completion_signal = pyqtSignal(float, int) # elapsed time, score
    
    def run(self):
        def on_prog(msg, pct):
            self.progress_signal.emit(msg, pct)
            
        # 1. First check the local database for a match (quick win)
        from .gpu_monitor import GPUMonitor
        gpu_info = GPUMonitor.get_gpu_info()
        gpu_name = gpu_info.get("name", "Unknown GPU")
        
        self.progress_signal.emit(f"Scanning hardware for Blender Open Data matching...", 5)
        score = GPUBenchmarker.find_matching_score(gpu_name, is_gpu=True)
        
        if score > 0:
            self.progress_signal.emit(f"MATCH FOUND in DB: {gpu_name} -> {score} PTS", 15)
            # We still run a VERY short verification render to ensure Blender works
            time.sleep(0.5)
            self.progress_signal.emit("Initiating short verification render...", 25)
            elapsed = GPUBenchmarker.run_benchmark(progress_callback=on_prog)
            
            if elapsed > 0:
                self.progress_signal.emit(f"Verification successful. Rendered in {elapsed:.2f}s.", 95)
                self.completion_signal.emit(elapsed, score)
                return
        
        # 2. If no match OR if we want fresh data, run the full in-engine benchmark
        self.progress_signal.emit("No exact DB match found. Running full in-engine performance audit...", 20)
        elapsed = GPUBenchmarker.run_benchmark(progress_callback=on_prog)
        
        if elapsed > 0:
            calculated_score = GPUBenchmarker.calculate_score(elapsed)
            self.progress_signal.emit(f"Audit complete. Performance Rating: {calculated_score} PTS", 100)
            self.completion_signal.emit(elapsed, calculated_score)
        else:
            self.progress_signal.emit("Benchmark render failed.", 100)
            self.completion_signal.emit(0.0, 0)


class DownloadOpenDataThread(QThread):
    """Downloads Blender Open Data benchmark scores in the background"""
    progress_signal = pyqtSignal(str, int)
    completion_signal = pyqtSignal(bool)
    
    def run(self):
        def on_prog(msg, pct):
            self.progress_signal.emit(msg, pct)
            
        success = GPUBenchmarker.download_all_blender_benchmarks(progress_callback=on_prog)
        self.completion_signal.emit(success)


class RendoFrenWorkerApp(QMainWindow):
    """The central RendoFren PyQt6 application featuring real-time telemetry, system tray minimization, and background scheduling"""
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("RendoFren — Secure GPU Render Node")
        self.setMinimumSize(780, 560)
        self.setStyleSheet(QSS_STYLING)
        
        self.bench_score = 0
        self.completed_jobs = 0
        self.total_earnings = 0.0
        self.node_status = "inactive"
        self.config_inputs = {}
        
        # Init core classes
        self.renderer = RenderManager(logger_callback=self.log_to_console)
        self.api_client = WorkerAPIClient(ui_logger_callback=self.log_to_console)
        
        # Load persisted score from API client (which reads config_cache.json)
        self.bench_score = getattr(self.api_client, '_bench_score', 0)
        
        # Init threads
        self.worker_thread = None
        self.benchmark_thread = None
        
        # Create UI and Tray
        self.init_ui()
        self.init_system_tray()
        
        # Resource stats poll timer
        self.stats_timer = QTimer()
        self.stats_timer.timeout.connect(self.update_system_telemetry)
        self.stats_timer.start(2500) # update every 2.5 seconds
        
        # Heartbeat send timer
        self.heartbeat_timer = QTimer()
        self.heartbeat_timer.timeout.connect(self.send_api_heartbeat)
        self.heartbeat_timer.start(10000) # every 10 seconds
        
        # Welcome message
        self.log_to_console("RendoFren Worker Node client initialized.")
        self.log_to_console("Standardized GPU device benchmarking is highly recommended before launch.")
        
        # Check API registration on startup
        QTimer.singleShot(1000, self.check_startup_auth)

    def check_startup_auth(self):
        """Validates API key and updates UI with account details if available"""
        if self.api_client.register_or_authenticate(register=False):
            if self.api_client.account_info:
                email = self.api_client.account_info.get('email', 'N/A')
                addr = self.api_client.account_info.get('address', 'N/A')
                self.lbl_id_status.setText(f"ACCOUNT MANAGED (READ-ONLY)")
                self.lbl_id_status.setStyleSheet("font-weight: bold; color: #66fcf1; font-size: 11px;")
                self.lbl_id_email.setText(f"User: {email}")
                self.lbl_id_email.setStyleSheet("color: #c5c6c7; font-size: 10px;")
                self.lbl_id_wallet.setText(f"Wallet Address: {addr[:10]}...{addr[-8:]}")
                self.lbl_id_wallet.setStyleSheet("color: #c5c6c7; font-size: 10px;")
                self.log_to_console(f"Authenticated as {email}. Profile lock active.")
    
    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(15, 15, 15, 15)
        
        # Header banner
        header_layout = QHBoxLayout()
        header_text_layout = QVBoxLayout()
        
        title = QLabel("RendoFren Node")
        title.setObjectName("titleLabel")
        subtitle = QLabel("DECENTRALIZED ENCRYPTED GPU RENDER WORKER")
        subtitle.setObjectName("subtitleLabel")
        
        header_text_layout.addWidget(title)
        header_text_layout.addWidget(subtitle)
        header_layout.addLayout(header_text_layout)
        header_layout.addStretch()
        
        # Start/Stop Switch
        self.btn_toggle_node = QPushButton("LAUNCH NODE")
        self.btn_toggle_node.setStyleSheet("border-color: #39ff14; color: #39ff14; font-size: 14px; padding: 10px 20px;")
        self.btn_toggle_node.clicked.connect(self.toggle_node_lifecycle)
        header_layout.addWidget(self.btn_toggle_node)
        
        main_layout.addLayout(header_layout)
        
        # Navigation Tabs
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)
        
        # Assemble separate views
        self.tabs.addTab(self.create_dashboard_tab(), "TELEMETRY DASHBOARD")
        self.tabs.addTab(self.create_benchmark_tab(), "GPU BENCHMARK")
        self.tabs.addTab(self.create_config_tab(), "CONFIG & IDENTITY")
        self.tabs.addTab(self.create_logs_tab(), "CONSOLE LOGS")
        
        # Bottom Status Bar & Progress bar
        bottom_bar = QHBoxLayout()
        self.lbl_pipeline_status = QLabel("Engine State: Idle")
        self.lbl_pipeline_status.setStyleSheet("color: #45a29e; font-weight: bold;")
        bottom_bar.addWidget(self.lbl_pipeline_status)
        
        self.pipeline_progress = QProgressBar()
        self.pipeline_progress.setRange(0, 100)
        self.pipeline_progress.setValue(0)
        self.pipeline_progress.setFixedHeight(12)
        bottom_bar.addWidget(self.pipeline_progress)
        
        main_layout.addLayout(bottom_bar)
        
        # Populate initial config
        self.update_config_inputs()
        
        # Load initial display states from disk
        if self.bench_score > 0:
            self.lbl_bench_score_display.setText(f"SCORE: {self.bench_score} PTS")
            self.lbl_node_score.setText(f"Benchmark Rating: {self.bench_score} PTS (Cached)")
            self.lbl_node_score.setStyleSheet("color: #39ff14; font-weight: bold;")
        
    # -------------------------------------------------------------
    # 1. View Creators
    # -------------------------------------------------------------
    def create_dashboard_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(10, 15, 10, 10)
        
        # Telemetry cards (grid)
        card_grid = QGridLayout()
        card_grid.setSpacing(10)
        
        self.card_gpu_name = self.create_card("GPU Hardware", "Scanning Hardware...", card_grid, 0, 0)
        self.card_gpu_usage = self.create_card("GPU Load", "0.0%", card_grid, 0, 1)
        self.card_vram = self.create_card("VRAM Alloc", "0.0 / 0.0 GB", card_grid, 0, 2)
        
        self.card_cpu_usage = self.create_card("CPU Core usage", "0.0%", card_grid, 1, 0)
        self.card_jobs = self.create_card("Completed jobs", "0", card_grid, 1, 1)
        self.card_earnings = self.create_card("Earnings Accumulation", "0.0000 ETH", card_grid, 1, 2)
        
        layout.addLayout(card_grid)
        
        # Telemetry progress indicators
        bars_frame = QFrame()
        bars_layout = QGridLayout(bars_frame)
        
        bars_layout.addWidget(QLabel("GPU Load Gauge:"), 0, 0)
        self.bar_gpu_load = QProgressBar()
        bars_layout.addWidget(self.bar_gpu_load, 0, 1)
        
        bars_layout.addWidget(QLabel("VRAM Allocation Gauge:"), 1, 0)
        self.bar_vram_load = QProgressBar()
        bars_layout.addWidget(self.bar_vram_load, 1, 1)
        
        bars_layout.addWidget(QLabel("CPU Load Gauge:"), 2, 0)
        self.bar_cpu_load = QProgressBar()
        bars_layout.addWidget(self.bar_cpu_load, 2, 1)
        
        layout.addWidget(bars_frame)
        
        # Quick summary node status
        node_status_bar = QHBoxLayout()
        self.lbl_node_score = QLabel("Benchmark Rating: UNRATED (Run benchmark under GPU Tab)")
        self.lbl_node_score.setStyleSheet("color: #ff007f; font-weight: bold;")
        node_status_bar.addWidget(self.lbl_node_score)
        node_status_bar.addStretch()
        
        # Open Web Portal Button next to status indicators
        btn_open_web = QPushButton("OPEN WEB PORTAL")
        btn_open_web.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_open_web.setStyleSheet("""
            QPushButton {
                border: 1px solid #66fcf1;
                color: #66fcf1;
                font-weight: bold;
                font-size: 11px;
                padding: 6px 15px;
                border-radius: 6px;
                background-color: rgba(102, 252, 241, 0.05);
            }
            QPushButton:hover {
                background-color: rgba(102, 252, 241, 0.15);
                color: #ffffff;
            }
        """)
        btn_open_web.clicked.connect(self.open_web_portal)
        node_status_bar.addWidget(btn_open_web)
        
        layout.addLayout(node_status_bar)
        layout.addStretch()
        return widget

    def open_web_portal(self):
        import webbrowser
        webbrowser.open(FRONTEND_URL)
        
    def create_card(self, title: str, value: str, grid: QGridLayout, r: int, c: int) -> QLabel:
        frame = QFrame()
        lay = QVBoxLayout(frame)
        lay.setContentsMargins(12, 12, 12, 12)
        
        lbl_title = QLabel(title)
        lbl_title.setObjectName("cardLbl")
        
        lbl_val = QLabel(value)
        lbl_val.setObjectName("cardVal")
        lbl_val.setWordWrap(True)
        
        lay.addWidget(lbl_title)
        lay.addWidget(lbl_val)
        grid.addWidget(frame, r, c)
        return lbl_val

    def create_benchmark_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(15, 15, 15, 15)
        
        info_box = QFrame()
        info_lay = QVBoxLayout(info_box)
        info_title = QLabel("Hardware Verification & Speed Analysis")
        info_title.setStyleSheet("font-size: 16px; font-weight: bold; color: #66fcf1;")
        info_desc = QLabel(
            "To qualify for the parallel distribution scheduler, your node must benchmark its rendering speed.\n"
            "This launches an isolated, memory-rendered 3D scene (metallic materials, lights, subsurface subdivision) inside Blender CLI.\n"
            "Your rendering speed computes a 'Benchmark Rating', determining your job priority and payout multipliers."
        )
        info_desc.setWordWrap(True)
        info_lay.addWidget(info_title)
        info_lay.addWidget(info_desc)
        layout.addWidget(info_box)
        
        # Hardware display
        self.lbl_bench_hw = QLabel("Detected Hardware: Loading...")
        self.lbl_bench_hw.setStyleSheet("font-size: 14px; font-weight: bold; color: #c5c6c7; margin-top: 10px;")
        layout.addWidget(self.lbl_bench_hw)
        
        # Benchmark score widget
        self.lbl_bench_score_display = QLabel("SCORE: UNRATED")
        self.lbl_bench_score_display.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_bench_score_display.setStyleSheet("font-size: 38px; font-weight: bold; color: #ff007f; background-color: #0b0c10; padding: 20px; border-radius: 8px; border: 1px dashed #ff007f;")
        layout.addWidget(self.lbl_bench_score_display)
        
        # Control Buttons
        btn_layout = QHBoxLayout()
        self.btn_run_benchmark = QPushButton("RUN IN-ENGINE BENCHMARK")
        self.btn_run_benchmark.setObjectName("glowButton")
        self.btn_run_benchmark.clicked.connect(self.trigger_hardware_benchmark)
        btn_layout.addWidget(self.btn_run_benchmark)
        
        self.btn_download_opendata = QPushButton("FETCH BLENDER OPEN DATA")
        self.btn_download_opendata.setStyleSheet("font-size: 13px; font-weight: bold; color: #66fcf1; background-color: #1f2833; border: 1px solid #66fcf1; padding: 10px; border-radius: 4px;")
        self.btn_download_opendata.clicked.connect(self.trigger_opendata_download)
        btn_layout.addWidget(self.btn_download_opendata)
        
        layout.addLayout(btn_layout)
        
        # Console output for benchmark specifically
        self.bench_console = QTextEdit()
        self.bench_console.setReadOnly(True)
        self.bench_console.setPlaceholderText("Benchmark details will print here...")
        layout.addWidget(self.bench_console)
        
        return widget

    def create_config_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(15, 15, 15, 15)
        
        # Read-only Identity Banner
        self.identity_banner = QFrame()
        self.identity_banner.setObjectName("identityBanner")
        self.identity_banner.setStyleSheet("background: #1f2833; border: 0px solid #66fcf1; border-radius: 12px;")
        self.identity_banner_layout = QVBoxLayout(self.identity_banner)
        
        self.lbl_id_status = QLabel("Account Status: UNTREATED (Enter API Key)")
        self.lbl_id_status.setStyleSheet("font-weight: bold; color: #45a29e; font-size: 11px;")
        self.lbl_id_email = QLabel("Linked Email: Not Authenticated")
        self.lbl_id_email.setStyleSheet("color: #c5c6c7; font-size: 10px;")
        self.lbl_id_wallet = QLabel("Reward Wallet: 0x...")
        self.lbl_id_wallet.setStyleSheet("color: #c5c6c7; font-size: 10px;")
        
        self.identity_banner_layout.addWidget(self.lbl_id_status)
        self.identity_banner_layout.addWidget(self.lbl_id_email)
        self.identity_banner_layout.addWidget(self.lbl_id_wallet)
        layout.addWidget(self.identity_banner)

        form_frame = QFrame()
        form = QFormLayout(form_frame)
        form.setContentsMargins(15, 15, 15, 15)
        
        # Only API Key is editable
        self.in_api_key = QLineEdit()
        self.in_api_key.setPlaceholderText("rf_...")
        self.in_api_key.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow("RendoFren Worker API Key:", self.in_api_key)
        self.config_inputs["WORKER_API_KEY"] = self.in_api_key
        
        layout.addWidget(form_frame)
        
        # Action Buttons
        btn_layout = QHBoxLayout()
        
        btn_save = QPushButton("SAVE & AUTHENTICATE")
        btn_save.clicked.connect(self.commit_config_changes)
        btn_layout.addWidget(btn_save)
        
        layout.addLayout(btn_layout)

        # Info text
        info_lbl = QLabel("Note: All other settings (Blender path, IPFS, Wallet) are now managed automatically via your API profile for security.")
        info_lbl.setWordWrap(True)
        info_lbl.setStyleSheet("color: #45a29e; font-size: 10px; margin-top: 10px; font-style: italic;")
        layout.addWidget(info_lbl)
        
        layout.addStretch()
        return widget

    def create_logs_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(10, 10, 10, 10)
        
        self.terminal = QTextEdit()
        self.terminal.setReadOnly(True)
        self.terminal.setStyleSheet(
            "background-color: #030406; border: 1px solid #45a29e; "
            "color: #39ff14; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;"
        )
        layout.addWidget(self.terminal)
        
        # Clear button
        btn_clear = QPushButton("CLEAR LOGGER")
        btn_clear.clicked.connect(self.terminal.clear)
        layout.addWidget(btn_clear)
        
        return widget

    # -------------------------------------------------------------
    # 2. Logic & Backends Integration
    # -------------------------------------------------------------
    def log_to_console(self, text: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_line = f"[{timestamp}] {text}"
        self.terminal.append(log_line)
        # Auto scroll to bottom
        self.terminal.moveCursor(QTextCursor.MoveOperation.End)
        print(log_line) # fallback to terminal too

    def update_system_telemetry(self):
        """Polls hardware monitor and updates cards/progress indicators dynamically"""
        gpu = GPUMonitor.get_gpu_info()
        sys_stats = GPUMonitor.get_system_stats()
        
        self.card_gpu_name.setText(gpu.get("name", "Unknown GPU"))
        self.lbl_bench_hw.setText(f"Detected Hardware: {gpu.get('name', 'Unknown')}")
        
        total_vram = gpu.get("vram_total", 8.0)
        used_vram = gpu.get("vram_used", 0.0)
        self.card_vram.setText(f"{used_vram:.1f} / {total_vram:.1f} GB")
        vram_pct = int((used_vram / total_vram) * 100) if total_vram > 0 else 0
        self.bar_vram_load.setValue(vram_pct)
        
        gpu_usage = gpu.get("usage", 0.0)
        self.card_gpu_usage.setText(f"{gpu_usage:.1f}%")
        self.bar_gpu_load.setValue(int(gpu_usage))
        
        cpu_usage = sys_stats.get("cpu_usage", 0.0)
        self.card_cpu_usage.setText(f"{cpu_usage:.1f}%")
        self.bar_cpu_load.setValue(int(cpu_usage))

    def send_api_heartbeat(self):
        """Dispatches active telemetry stats to the central backend orchestrator"""
        if self.worker_thread and self.worker_thread.isRunning():
            gpu = GPUMonitor.get_gpu_info()
            sys_stats = GPUMonitor.get_system_stats()
            
            # Map detailed UI-specific statuses to backend core statuses ('idle', 'rendering', 'offline')
            backend_status = "idle"
            if self.node_status in ("rendering", "claiming"):
                backend_status = "rendering"
            elif self.node_status == "offline":
                backend_status = "offline"
                
            # Send stats to backend
            self.api_client.send_heartbeat(
                gpu_stats=gpu,
                system_stats=sys_stats,
                status=backend_status,
                current_job_id=None
            )

    def toggle_node_lifecycle(self):
        """Launches or stops the background worker daemon"""
        if self.worker_thread and self.worker_thread.isRunning():
            # Stop Node
            self.log_to_console("Deactivating render node...")
            self.node_status = "inactive"
            self.btn_toggle_node.setText("LAUNCH NODE")
            self.btn_toggle_node.setStyleSheet("border-color: #39ff14; color: #39ff14; font-size: 14px; padding: 10px 20px;")
            self.worker_thread.stop()
            self.worker_thread.terminate()
            self.worker_thread.wait()
            self.worker_thread = None
            self.lbl_pipeline_status.setText("Engine State: Inactive")
            self.log_to_console("Render node deactivated successfully.")
            self.stats_timer.start(2500) # resume fast stats
        else:
            # Enforce API Key requirement prior to activation
            api_key = self.config_inputs.get("WORKER_API_KEY")
            api_key_text = api_key.text().strip() if api_key else ""
            
            if not api_key_text:
                QMessageBox.critical(
                    self, 
                    "API Key Required", 
                    "Authentication Required:\n\nYou cannot launch or connect a GPU worker node without a valid RendoFren API Key.\n\nPlease copy your API Key from your profile dashboard under the Web Portal (https://rendofren.vercel.app/) and paste it inside the Config tab."
                )
                self.log_to_console("Activation aborted: Missing RendoFren Worker API Key.")
                return

            # Start Node
            self.log_to_console("Activating render node...")
            self.node_status = "idle"
            self.btn_toggle_node.setText("STOP NODE")
            self.btn_toggle_node.setStyleSheet("border-color: #ff007f; color: #ff007f; font-size: 14px; padding: 10px 20px;")
            
            # Sync config to API client
            self.api_client.backend_url = BACKEND_API_URL
            self.api_client.worker_api_key = api_key_text
            
            # Run background thread
            self.worker_thread = WorkerBackgroundThread(self.api_client, self.renderer)
            self.worker_thread.log_signal.connect(self.log_to_console)
            self.worker_thread.progress_signal.connect(self.handle_pipeline_progress)
            self.worker_thread.status_signal.connect(self.handle_node_status)
            self.worker_thread.stats_signal.connect(self.handle_worker_stats)
            self.worker_thread.start()
            
    def handle_pipeline_progress(self, message: str, pct: int):
        self.lbl_pipeline_status.setText(f"Engine State: {message}")
        self.pipeline_progress.setValue(pct)
        
    def handle_node_status(self, status: str, job_id: str):
        self.node_status = status
        if job_id:
            self.lbl_pipeline_status.setText(f"Processing Job {job_id} [{status.upper()}]")
        else:
            self.lbl_pipeline_status.setText(f"Engine State: {status.capitalize()}")
            
    def handle_worker_stats(self, completed: int, earnings: float):
        self.completed_jobs = completed
        self.total_earnings = earnings
        self.card_jobs.setText(str(completed))
        self.card_earnings.setText(f"{earnings:.4f} ETH")
        
        # System Tray Balloon Notification
        self.tray_icon.showMessage(
            "RendoFren Render Complete",
            f"Successfully processed segment. Earned {earnings:.4f} ETH total!",
            QSystemTrayIcon.MessageIcon.Information,
            5000
        )

    def trigger_hardware_benchmark(self):
        """Triggers the inline background Blender benchmark scene execution"""
        if self.benchmark_thread and self.benchmark_thread.isRunning():
            self.bench_console.append("Benchmark already running!")
            return
            
        self.btn_run_benchmark.setEnabled(False)
        self.btn_run_benchmark.setText("RUNNING ANALYSIS...")
        self.bench_console.clear()
        self.bench_console.append("Starting rendering performance analysis...")
        
        self.benchmark_thread = BenchmarkThread()
        self.benchmark_thread.progress_signal.connect(self.handle_benchmark_progress)
        self.benchmark_thread.completion_signal.connect(self.handle_benchmark_completion)
        self.benchmark_thread.start()
        
    def handle_benchmark_progress(self, message: str, pct: int):
        self.bench_console.append(f"[{pct}%] {message}")
        
    def handle_benchmark_completion(self, elapsed_time: float, score: int):
        self.bench_score = score
        self.btn_run_benchmark.setEnabled(True)
        self.btn_run_benchmark.setText("RUN IN-ENGINE BENCHMARK")
        self.lbl_bench_score_display.setText(f"SCORE: {score} PTS")
        self.lbl_node_score.setText(f"Benchmark Rating: {score} PTS ({elapsed_time:.2f}s render)")
        self.lbl_node_score.setStyleSheet("color: #39ff14; font-weight: bold;")
        
        # Sync config and send heartbeat to backend
        self.api_client.update_benchmark_score(score)
        self.log_to_console(f"Benchmark score {score} PTS reported to orchestrator.")
        
        self.bench_console.append("\n==========================================")
        self.bench_console.append("BENCHMARK COMPLETED SUCCESSFULLY!")
        self.bench_console.append(f"Elapsed render duration: {elapsed_time:.2f} seconds")
        self.bench_console.append(f"Assigned Worker Rating: {score} PTS")
        self.bench_console.append("==========================================")
        self.bench_console.append("Node is qualified to receive jobs matching this performance tier.")
        
        # System Tray Balloon
        self.tray_icon.showMessage(
            "RendoFren Benchmarked",
            f"Your hardware scored {score} PTS!",
            QSystemTrayIcon.MessageIcon.Information,
            5000
        )

    def trigger_opendata_download(self):
        """Triggers the background thread to download the latest Blender Open Data benchmarks list"""
        if hasattr(self, "download_thread") and self.download_thread and self.download_thread.isRunning():
            self.bench_console.append("[OpenData] Download already in progress...")
            return
            
        self.btn_download_opendata.setEnabled(False)
        self.btn_download_opendata.setText("SYNCING...")
        self.bench_console.append("\n>>> Starting sync with Blender Open Data database...")
        
        self.download_thread = DownloadOpenDataThread()
        self.download_thread.progress_signal.connect(self.handle_download_progress)
        self.download_thread.completion_signal.connect(self.handle_download_completion)
        self.download_thread.start()
        
    def handle_download_progress(self, message: str, pct: int):
        self.bench_console.append(f"[{pct}%] {message}")
        
    def handle_download_completion(self, success: bool):
        self.btn_download_opendata.setEnabled(True)
        self.btn_download_opendata.setText("FETCH BLENDER OPEN DATA")
        if success:
            self.bench_console.append("\n>>> Database synchronization complete! Local hardware profiles updated.")
            gpu_info = GPUMonitor.get_gpu_info()
            gpu_name = gpu_info.get("name", "Unknown GPU")
            score = GPUBenchmarker.find_matching_score(gpu_name, is_gpu=True)
            if score > 0:
                self.bench_score = score
                self.lbl_bench_score_display.setText(f"SCORE: {score} PTS")
                self.lbl_node_score.setText(f"Benchmark Rating: {score} PTS (Open Data Synced)")
                self.lbl_node_score.setStyleSheet("color: #39ff14; font-weight: bold;")
                self.api_client.update_benchmark_score(score)
                self.log_to_console(f"Official Open Data score {score} PTS loaded and reported.")
                self.bench_console.append(f"\n[Success] Identified matching hardware score: {score} PTS.")
            else:
                self.bench_console.append("\n[Notice] Database synced, but could not match local hardware name exactly. Please run in-engine benchmark.")
        else:
            self.bench_console.append("\n>>> Synchronization failed. Reverting to offline local database profiles.")

    # -------------------------------------------------------------
    # 3. Settings & Identity management
    # -------------------------------------------------------------
    def update_config_inputs(self):
        from . import config
        for key, input_field in self.config_inputs.items():
            val = getattr(config, key, "")
            input_field.setText(str(val))
        
    def commit_config_changes(self):
        """Saves current input changes back to persistent files and reloads"""
        api_key_field = self.config_inputs.get("WORKER_API_KEY")
        if not api_key_field:
            self.log_to_console("Error: WORKER_API_KEY field not found in UI.")
            return

        api_key = api_key_field.text().strip()
        if not api_key:
            QMessageBox.warning(self, "Invalid API Key", "Please enter a valid RendoFren Worker API Key.")
            return
            
        # Save API key to global environment file
        env_file = os.path.join(os.getcwd(), "..", ".env")
        if not os.path.exists(env_file):
            env_file = os.path.join(os.getcwd(), ".env")
            
        lines = []
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                lines = f.readlines()
                
        # Simple update logic for the .env file
        updated = False
        for i, line in enumerate(lines):
            if line.startswith("WORKER_API_KEY="):
                lines[i] = f'WORKER_API_KEY="{api_key}"\n'
                updated = True
                break
        if not updated:
            lines.append(f'WORKER_API_KEY="{api_key}"\n')
                
        with open(env_file, 'w') as f:
            f.writelines(lines)
            
        # Reload the identity via API client if possible
        self.api_client.worker_api_key = api_key
        self.check_startup_auth() # Force refresh UI with details from the new key
        
        QMessageBox.information(self, "Config Saved", "API Key saved. Account details fetched successfully.")
        self.log_to_console("WORKER_API_KEY updated and saved.")

    def generate_random_identity(self):
        """Generates a secure mock hot wallet pair for instant demo registration"""
        import secrets
        # 20 bytes random address
        address = "0x" + secrets.token_hex(20)
        private_key = secrets.token_hex(32)
        
        self.config_inputs["WORKER_ADDRESS"].setText(address)
        self.config_inputs["WORKER_PRIVATE_KEY"].setText(private_key)
        self.log_to_console("Generated new mock hot wallet identity.")

    # -------------------------------------------------------------
    # 4. System Tray Minimization
    # -------------------------------------------------------------
    def init_system_tray(self):
        """Sets up the system tray integration"""
        self.tray_icon = QSystemTrayIcon(self)
        
        # Use an elegant system tray icon (fallback to standard system icons if file not found)
        # We can dynamically draw a nice icon or use PyQt's built-in styles for maximum portability!
        icon = self.style().standardIcon(self.style().StandardPixmap.SP_ComputerIcon)
        self.tray_icon.setIcon(icon)
        
        # Context menu
        tray_menu = QMenu()
        
        action_show = QAction("Show Node Dashboard", self)
        action_show.triggered.connect(self.showNormal)
        tray_menu.addAction(action_show)
        
        action_toggle = QAction("Launch / Stop Node", self)
        action_toggle.triggered.connect(self.toggle_node_lifecycle)
        tray_menu.addAction(action_toggle)
        
        action_bench = QAction("Run Benchmark", self)
        action_bench.triggered.connect(self.trigger_hardware_benchmark)
        tray_menu.addAction(action_bench)
        
        tray_menu.addSeparator()
        
        action_exit = QAction("Terminate Node", self)
        action_exit.triggered.connect(self.terminate_application)
        tray_menu.addAction(action_exit)
        
        self.tray_icon.setContextMenu(tray_menu)
        self.tray_icon.show()
        
        # Double click opens window
        self.tray_icon.activated.connect(self.on_tray_activated)
        
    def on_tray_activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.showNormal()
            self.activateWindow()
            
    def closeEvent(self, event):
        """Override closeEvent to minimize to the system tray and notify the user"""
        if self.tray_icon.isVisible():
            event.ignore()
            self.hide() # hide window, keeps running in background
            self.tray_icon.showMessage(
                "RendoFren running in background",
                "Dashboard minimized to system tray. Double-click tray icon to restore.",
                QSystemTrayIcon.MessageIcon.Information,
                3000
            )
            self.log_to_console("Dashboard minimized to system tray. Node is running.")
            
    def terminate_application(self):
        """Terminates process entirely from tray menu"""
        self.log_to_console("Shutting down worker node daemon...")
        if self.worker_thread:
            self.worker_thread.stop()
            self.worker_thread.terminate()
            self.worker_thread.wait()
            
        QApplication.quit()
