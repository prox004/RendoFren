import os
import sys
import traceback
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt
from .gui import RendoFrenWorkerApp

def run_gui():
    """Main execution function for launching the RendoFren PyQt6 application"""
    # 1. Enable high DPI scaling configurations for crisp rendering on modern displays
    try:
        QApplication.setHighDpiScaleFactorRoundingPolicy(
            Qt.HighDpiScaleFactorRoundingPolicy.RoundPreferDpi
        )
    except AttributeError:
        pass # Handle potential compatibility variations in older Qt versions
        
    # 2. Create the QApplication instance
    app = QApplication(sys.argv)
    
    # 3. Create and configure main window
    window = RendoFrenWorkerApp()
    window.show()
    
    # 4. Handle clean exit
    sys.exit(app.exec())

if __name__ == "__main__":
    try:
        run_gui()
    except Exception as e:
        # Diagnostic crash logger
        crash_log = os.path.join(os.path.dirname(__file__), "..", "crash_report.log")
        with open(crash_log, "w") as f:
            f.write("=== RENDOFREN WORKER CRASH REPORT ===\n")
            traceback.print_exc(file=f)
        print(f"[FATAL] App crashed. Diagnostics written to: {crash_log}")
        traceback.print_exc()
