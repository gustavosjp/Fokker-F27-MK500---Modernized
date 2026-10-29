"""Converts the interior's base-colour DDS textures to PNG for the textured Blender preview (Blender needs no DDS support that way).
Lookup order = the it80 variation's texture.cfg chain: texture.it80 -> texture.vcit -> texture.common -> texture.
Usage: python convert_textures.py <interior.json from dump_geometry.mjs> <outDir>"""
import json, os, sys
from PIL import Image
sim = r'C:\Projetos\bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2'
chain = ['texture.it80', 'texture.vcit', 'texture.common', 'texture']
meta = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
for name in sorted({p['tex'] for p in meta['prims'] if p['tex']}):
    dst = os.path.join(out, name.replace('.PNG.DDS', '.png'))
    if os.path.exists(dst):
        continue
    src = next((os.path.join(sim, c, name) for c in chain if os.path.exists(os.path.join(sim, c, name))), None)
    if not src:
        print('missing', name); continue
    try:
        im = Image.open(src)
        im.load()
        im.save(dst)
        print('ok', name, im.size, im.mode)
    except Exception as e:  # noqa: BLE001 - report and continue
        print('FAIL', name, e)
