"""로우폴리 가로등 소품 생성 -> public/models/prop.glb
실행: blender --background --python docker/blender/make_prop.py
"""
import os
import bpy

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "prop.glb")
OUT = os.path.normpath(OUT)

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgba, metallic=0.0, roughness=0.6, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    if emission:
        b.inputs["Emission Color"].default_value = emission
        b.inputs["Emission Strength"].default_value = 2.0
    return m


def put(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_flat()
    return obj


metal = material("DarkMetal", (0.12, 0.12, 0.14, 1), metallic=0.8, roughness=0.4)
glass = material("LampGlow", (1.0, 0.85, 0.4, 1), emission=(1.0, 0.8, 0.3, 1))
stone = material("Stone", (0.45, 0.45, 0.48, 1), roughness=0.9)

# 받침대
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.5, depth=0.2, location=(0, 0, 0.1))
put(bpy.context.active_object, "Base", stone)
# 기둥
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.06, depth=2.6, location=(0, 0, 1.5))
put(bpy.context.active_object, "Pole", metal)
# 램프
bpy.ops.mesh.primitive_cube_add(size=0.4, location=(0, 0, 3.0))
put(bpy.context.active_object, "Lamp", glass)
# 지붕
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.4, radius2=0.0, depth=0.3, location=(0, 0, 3.35))
put(bpy.context.active_object, "Roof", metal)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes")
