import os
import sys
import time
from pathlib import Path

# Insert worker path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

from src.render_manager import RenderManager
from src.config import BLENDER_PATH, RENDERS_DIR

def run_copper_test():
    print("==========================================")
    print("     RENDOFREN COPPER.BLEND RENDER TEST   ")
    print("==========================================")
    
    # Define source blend file
    copper_blend_path = Path("g:/Project/RendoFren/Copper.blend").resolve()
    
    if not copper_blend_path.exists():
        print(f"[ERROR] Copper.blend test file not found at: {copper_blend_path}")
        return False
        
    print(f"Test File found: {copper_blend_path}")
    print(f"Using Blender CLI: {BLENDER_PATH}")
    
    # Initialize Render Manager
    renderer = RenderManager()
    
    # Define temporary output files pattern
    output_pattern = str(RENDERS_DIR / "copper_test_####")
    
    # Ensure renders directory exists
    RENDERS_DIR.mkdir(exist_ok=True)
    
    print("\nTriggering render for Frame 1 using GPU preferences...")
    t0 = time.time()
    
    # Render frame 1 using RenderManager's CLI engine
    success = renderer.render_frames(
        blend_path=str(copper_blend_path),
        output_path_pattern=output_pattern,
        start_frame=1,
        end_frame=1,
        use_gpu=True,
        progress_callback=lambda msg, pct: print(f"  [{pct}%] {msg}")
    )
    
    elapsed = time.time() - t0
    
    if success:
        print("\n==========================================")
        print("  SUCCESS: Copper.blend frame 1 rendered!")
        print(f"  Total render time: {elapsed:.2f} seconds")
        print(f"  Output folder: {RENDERS_DIR}")
        print("==========================================")
        
        # Check rendered file exists
        rendered_files = list(RENDERS_DIR.glob("copper_test_0001*"))
        if rendered_files:
            print(f"  Render file verified: {rendered_files[0].name} ({os.path.getsize(rendered_files[0])} bytes)")
        return True
    else:
        print("\n[FAIL] Copper.blend render failed.")
        return False

if __name__ == "__main__":
    run_copper_test()
