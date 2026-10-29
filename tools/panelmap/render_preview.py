"""Headless Blender preview of the F27 interior from the pilot's eye (geometry/fit check, flat colours, no textures).

Why: the sim needs a closed game and a package rebuild for every model change, so the layout of the glass screens is checked here first.
Blender's glTF importer cannot read this MSFS "optimized" interior, so the geometry comes from dump_geometry.mjs (world-space triangles).

Usage:  blender --background --python render_preview.py -- <layout.json> <out.png>
layout.json keys: dump (prefix of interior.json/.bin), eye [x,y,z], look_at [x,y,z], fov_deg, res [w,h],
  hide_prefixes  : node-name prefixes that are NOT drawn (analogue instruments to remove)
  hilite_prefixes: node-name prefixes drawn in red (to see what would be removed)
  screens / bezels: [{name, center:[x,y,z], size:[w,h], color:[r,g,b], depth, image}]   (glTF space, quad facing the pilot; image = optional PNG)
  moves          : [{nodes:[prefixes], from:[x,y], to:[x,y], scale}] instruments relocated by make-g1000-interior.mjs (x/y only)
  textured (bool) : draw the real base-colour textures (needs <dump>.uv.bin from dump_geometry.mjs and PNGs from convert_textures.py in tex_dir)
  sim_winding (bool, default true): cull back faces with the sim's rule (front = clockwise), so wrongly wound meshes show up here too
  gauge_images   : {"$gauges...": png} draws a page image on the dumped screen quad of that material (for screens that are turned)
glTF space here is right-handed, y up, z forward, +x = aircraft LEFT. Blender space used: X = -x (right), Y = z (forward), Z = y (up).
"""
import colorsys
import os
import hashlib
import json
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
layout = json.load(open(argv[0], encoding="utf-8"))
out_png = argv[1]

meta = json.load(open(layout["dump"] + ".json", encoding="utf-8"))
blob = open(layout["dump"] + ".bin", "rb").read()
nf = meta["vertexFloats"]
verts_all = np.frombuffer(blob, dtype=np.float32, count=nf).reshape(-1, 3)
idx_all = np.frombuffer(blob, dtype=np.uint32, count=meta["indexCount"], offset=nf * 4)

textured = bool(layout.get("textured"))
tex_dir = layout.get("tex_dir", "C:/Projetos/f27-g1000/tools/panelmap/out/tex")
uv_all = np.frombuffer(open(layout["dump"] + ".uv.bin", "rb").read(), dtype=np.float32).reshape(-1, 2) if textured else None
hide_prefixes = tuple(layout.get("hide_prefixes", []))
hilite_prefixes = tuple(layout.get("hilite_prefixes", []))
# Back faces are culled as in the sim (v8 lesson: meshes wound the wrong way looked fine here and were invisible in the sim).
sim_winding = bool(layout.get("sim_winding", True))
gauge_images = layout.get("gauge_images", {})   # {"$gauges...": png}: page image for a screen material (v9: the CDU's turned screen)


def to_b(v):
    return Vector((-v[0], v[2], v[1]))


def color_for(key):
    h = int(hashlib.md5(key.encode()).hexdigest()[:6], 16)
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360.0, 0.25, 0.85)
    return (r, g, b, 1.0)


bpy.ops.wm.read_factory_settings(use_empty=True)
mats = {}


def material(name, rgba):
    if name not in mats:
        m = bpy.data.materials.new(name)
        m.diffuse_color = rgba
        mats[name] = m
    return mats[name]


def tex_material(png, blend):
    key = "tex:" + png + (":blend" if blend else "")
    if key not in mats:
        m = bpy.data.materials.new(os.path.basename(png))
        m.use_nodes = True
        nt = m.node_tree
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(png, check_existing=True)
        bsdf = nt.nodes.get("Principled BSDF")
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        if blend:
            nt.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
            m.surface_render_method = "BLENDED"
        nt.nodes.active = node
        mats[key] = m
    return mats[key]


skip_materials = set(layout.get("skip_materials", ["Occluder", "Collision"]))   # helper meshes the sim never draws
drawn = hidden = 0
for p in meta["prims"]:
    name = p["name"] or ""
    if p.get("material") in skip_materials:
        hidden += 1
        continue
    if hide_prefixes and name.startswith(hide_prefixes):
        hidden += 1
        continue
    v = verts_all[p["vOffset"]:p["vOffset"] + p["vCount"]]
    for mv in layout.get("moves", []):
        if name.startswith(tuple(mv["nodes"])):
            v = v.copy()
            v[:, 0] = mv["to"][0] + mv["scale"] * (v[:, 0] - mv["from"][0])
            v[:, 1] = mv["to"][1] + mv["scale"] * (v[:, 1] - mv["from"][1])
            v[:, 2] = 9.165 + mv["scale"] * (v[:, 2] - 9.165) + mv.get("dz", 0.0)   # same carrier transform as make-g1000-interior.mjs
    tri = idx_all[p["iOffset"]:p["iOffset"] + p["iCount"]].reshape(-1, 3)
    if sim_winding:   # the sim draws a triangle only from the side where it runs CLOCKWISE (all the author's meshes); Blender's front is CCW
        tri = tri[:, ::-1]
    vb = np.empty_like(v)
    vb[:, 0], vb[:, 1], vb[:, 2] = -v[:, 0], v[:, 2], v[:, 1]
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(vb))
    mesh.vertices.foreach_set("co", vb.reshape(-1))
    mesh.loops.add(len(tri) * 3)
    mesh.loops.foreach_set("vertex_index", tri.reshape(-1))
    mesh.polygons.add(len(tri))
    mesh.polygons.foreach_set("loop_start", np.arange(0, len(tri) * 3, 3, dtype=np.int32))
    mesh.polygons.foreach_set("loop_total", np.full(len(tri), 3, dtype=np.int32))
    mesh.update()
    mesh.validate()
    png = os.path.join(tex_dir, p.get("tex", "").replace(".PNG.DDS", ".png")) if textured and p.get("tex") else ""
    if textured and not png and p.get("material") in gauge_images:   # a screen quad: stand-in page on the real (maybe turned) quad
        png = gauge_images[p["material"]]
    if hilite_prefixes and name.startswith(hilite_prefixes):
        mesh.materials.append(material("HILITE", (0.9, 0.1, 0.1, 1.0)))
    elif png and os.path.exists(png):
        uv = uv_all[p["vOffset"]:p["vOffset"] + p["vCount"]][tri.reshape(-1)].copy()
        uv[:, 1] = 1.0 - uv[:, 1]          # glTF v runs downwards, Blender's upwards
        layer = mesh.uv_layers.new(name="UV0")
        layer.data.foreach_set("uv", uv.reshape(-1))
        mesh.materials.append(tex_material(png, p.get("alpha") == "BLEND"))
    elif textured:
        c = p.get("color", [0.8, 0.8, 0.8, 1])
        mesh.materials.append(material("flat:" + (p["material"] or "none"), (c[0], c[1], c[2], 1.0)))
    else:
        mesh.materials.append(material(p["material"] or "none", color_for(p["material"] or "none")))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    drawn += 1
print("primitives drawn:", drawn, "hidden:", hidden)


def add_box(name, center, size, color, depth, image=None):
    c = to_b(center)
    w, h = size
    d = max(depth, 0.0005) / 2.0
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vv in bm.verts:
        vv.co.x *= w
        vv.co.y *= d * 2
        vv.co.z *= h
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = c
    if image and textured:
        # map the image onto the face that looks at the pilot (Blender -Y side of the cube)
        layer = me.uv_layers.new(name="UV0")
        for poly in me.polygons:
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                layer.data[li].uv = (co.x / w + 0.5, co.z / h + 0.5)
        me.materials.append(tex_material(image, False))
    else:
        me.materials.append(material(name + "_m", (*color, 1.0)))
    bpy.context.collection.objects.link(ob)


for s in layout.get("bezels", []):
    add_box(s["name"], s["center"], s["size"], s.get("color", [0.03, 0.03, 0.035]), s.get("depth", 0.02), s.get("image"))
for s in layout.get("screens", []):
    add_box(s["name"], s["center"], s["size"], s.get("color", [0.1, 0.35, 0.8]), 0.001, s.get("image"))

scene = bpy.context.scene
cd = bpy.data.cameras.new("cam")
cd.lens_unit = "FOV"
cd.angle = layout.get("fov_deg", 60) * 3.14159265 / 180.0
cd.clip_start = layout.get("clip_start", 0.02)   # in metres from the camera: use it to cut away seats/pedestal in front of the panel
if layout.get("ortho"):
    cd.type = "ORTHO"
    cd.ortho_scale = layout.get("ortho_scale", 1.9)
cam = bpy.data.objects.new("cam", cd)
scene.collection.objects.link(cam)
cam.location = to_b(layout["eye"])
view_dir = (to_b(layout["look_at"]) - cam.location).normalized()
cam_q = view_dir.to_track_quat("-Z", "Y")
if layout.get("roll_deg"):   # roll about the viewing axis (from solve_camera.py)
    cam_q = Quaternion(view_dir, layout["roll_deg"] * 3.14159265 / 180.0) @ cam_q
cam.rotation_euler = cam_q.to_euler()
scene.camera = cam

w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.88, 0.92, 1)
scene.world = w
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE" if textured else "MATERIAL"
scene.display.shading.show_backface_culling = sim_winding
scene.display.render_aa = "8"
scene.render.resolution_x, scene.render.resolution_y = layout.get("res", [1600, 900])
scene.render.filepath = out_png
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("rendered", out_png)
