import sys
import os
from pathlib import Path

# Add the worker's parent directory to sys.path so 'src' is loaded as a proper package.
# This resolves relative imports (from .gui import ...) flawlessly when compiled into an EXE.
current_dir = Path(__file__).parent.resolve()
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

import src.main

if __name__ == "__main__":
    src.main.run_gui()
