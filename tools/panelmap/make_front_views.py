"""Straight-on orthographic views of the main panel from the cabin (camera behind the yoke, near clipping cuts the yokes away), for a dump
prefix, plus a copy with a 5 cm grid labelled in glTF x / y (x = aircraft left positive, so the captain's side is on the image's LEFT).
Usage: python make_front_views.py <dump prefix> <out name> [hide json]
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
dump, name = sys.argv[1], sys.argv[2]
hidden = json.load(open(sys.argv[3], encoding='utf-8'))['all'] if len(sys.argv) > 3 else []
X0, X1, Y0, Y1 = -0.85, 0.85, -0.02, 0.78          # world window (x as glTF: +x = aircraft left)
RES = 1700                                        # px across X
scale = (X1 - X0) / RES
H = int((Y1 - Y0) / scale)
lay = dict(dump=dump.replace('\\', '/'), textured=True,
           skip_materials=['Occluder', 'Collision', 'int_Glass_Gauge', 'int_Glass_ApBtn', 'int_Glass_Visor', 'WINDSHIELD', 'WINDSHIELD.001'],
           hide_prefixes=hidden, screens=[], bezels=[], eye=[(X0 + X1) / 2, (Y0 + Y1) / 2, 8.45], look_at=[(X0 + X1) / 2, (Y0 + Y1) / 2, 9.5],
           ortho=True, ortho_scale=X1 - X0, clip_start=0.62, roll_deg=0, res=[RES, H])
path = os.path.join(OUT, 'layouts', f'{name}.json')
json.dump(lay, open(path, 'w', encoding='utf-8'))
png = os.path.join(OUT, f'{name}.png')
subprocess.run([r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe', '--background', '--python', os.path.join(HERE, 'render_preview.py'), '--', path, png],
               capture_output=True, text=True, check=True)
im = Image.open(png).convert('RGB')
d = ImageDraw.Draw(im)
try:
    f = ImageFont.truetype('arial.ttf', 14)
except OSError:
    f = ImageFont.load_default()
# looking +z from the cabin, image right = aircraft right = -x
px = lambda x: (X1 - x) / scale
py = lambda y: (Y1 - y) / scale
for k in range(int(X0 * 20), int(X1 * 20) + 1):
    x = k / 20
    d.line([(px(x), 0), (px(x), H)], fill=(255, 220, 0) if k % 2 == 0 else (120, 110, 40), width=1)
    if k % 2 == 0:
        d.text((px(x) + 2, 2), f'{x:+.1f}', fill=(255, 230, 60), font=f)
for k in range(int(Y0 * 20), int(Y1 * 20) + 1):
    y = k / 20
    d.line([(0, py(y)), (im.width, py(y))], fill=(0, 220, 255) if k % 2 == 0 else (40, 100, 120), width=1)
    if k % 2 == 0:
        d.text((2, py(y) + 2), f'{y:.1f}', fill=(80, 230, 255), font=f)
im.save(os.path.join(OUT, f'{name}_grid.png'))
print(f'{png} and {name}_grid.png ({RES}x{H}, {scale * 1000:.2f} mm/px)')
