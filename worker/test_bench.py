import bpy
import time

def run_benchmark():
    # Clear existing data
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Create main scene
    bpy.ops.scene.new(type='NEW')
    scene = bpy.context.scene
    
    # Create reflective sphere
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.5, location=(0, 0, 0))
    sphere = bpy.context.active_object
    
    # Add Subdivision Surface modifier
    subsurf = sphere.modifiers.new(name="Subdiv", type='SUBSURF')
    subsurf.levels = 3
    subsurf.render_levels = 4
    
    # Create smooth shading
    bpy.ops.object.shade_smooth()
    
    # Set up material
    mat = bpy.data.materials.new(name="MetallicMetal")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled:
        principled.inputs['Metallic'].default_value = 0.95
        principled.inputs['Roughness'].default_value = 0.1
        principled.inputs['Base Color'].default_value = (0.0, 0.94, 1.0, 1.0) # Neon Cyan
        
    sphere.data.materials.append(mat)
    
    # Add reflective floor
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, -1.5))
    floor = bpy.context.active_object
    mat_floor = bpy.data.materials.new(name="FloorMat")
    mat_floor.use_nodes = True
    nodes_floor = mat_floor.node_tree.nodes
    principled_floor = nodes_floor.get("Principled BSDF")
    if principled_floor:
        principled_floor.inputs['Roughness'].default_value = 0.2
        principled_floor.inputs['Base Color'].default_value = (0.05, 0.05, 0.08, 1.0) # Dark Navy
    floor.data.materials.append(mat_floor)
    
    # Add a Point Light
    bpy.ops.object.light_add(type='POINT', radius=1.0, location=(3, -3, 4))
    light = bpy.context.active_object
    light.data.energy = 500.0
    light.data.color = (1.0, 0.0, 0.5, 1.0) # Neon Pink
    
    # Add a Sun Light
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
    sun = bpy.context.active_object
    sun.data.energy = 2.0
    
    # Add Camera
    bpy.ops.object.camera_add(location=(0, -6, 2.5), rotation=(1.2, 0.0, 0.0))
    scene.camera = bpy.context.active_object
    
    # Render Settings
    scene.render.resolution_x = 400
    scene.render.resolution_y = 400
    scene.render.resolution_percentage = 100
    
    # Set rendering engine
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 15
        
    scene.render.filepath = 'benchmark_temp_out.png'
    
    # Force GPU usage configuration
    try:
        preferences = bpy.context.preferences
        cycles_preferences = preferences.addons['cycles'].preferences
        cycles_preferences.compute_device_type = 'CUDA' # Try CUDA first
        
        # Device fallback list
        for device_type in ['CUDA', 'OPTIX', 'ONEAPI', 'METAL', 'HIP']:
            try:
                cycles_preferences.compute_device_type = device_type
                print(f"BENCHMARK_DEVICE: Activated {device_type}")
                break
            except Exception:
                continue
                
        cycles_preferences.get_devices()
        for device in cycles_preferences.devices:
            device.use = True
    except Exception as e:
        print(f"BENCHMARK_DEVICE_WARNING: Config failed, using default: {e}")
        
    # Start timer & render
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    t1 = time.time()
    
    print(f"BENCHMARK_TIME: {t1 - t0:.4f}")

if __name__ == '__main__':
    run_benchmark()
