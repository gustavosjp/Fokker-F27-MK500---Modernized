"""v10 key press preview: the CDU keyboard from a low angle, at rest (dump out/interior_v10) and with some caps at the end of their press
animation (dump out/interior_v10press, from make_press_demo.mjs), stacked into out/v10_cdu_press.png.
Usage: python make_v10_press_views.py <hide json> <label of the pressed keys>
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
LAY = os.path.join(OUT, 'layouts')
BLENDER = r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
hidden = json.load(open(sys.argv[1], encoding='utf-8'))['all']
base = json.load(open(os.path.join(LAY, 'v9_cdu.json'), encoding='utf-8'))
base['hide_prefixes'] = hidden
base['gauge_images'] = {k: v for k, v in base['gauge_images'].items() if k != '$gaugesF27wt21pfd2'}
cam = dict(eye=[0.137, 0.205, 8.655], look_at=[0.137, 0.15, 8.775], fov_deg=34, roll_deg=0, res=[1600, 1000], clip_start=0.01)
pngs = []
for tag, dump in (('rest', 'interior_v10'), ('press', 'interior_v10press')):
    j = dict(base)
    j.update(cam)
    j['dump'] = os.path.join(OUT, dump).replace(os.sep, '/')
    path = os.path.join(LAY, f'v10_cdu_{tag}.json')
    json.dump(j, open(path, 'w', encoding='utf-8'))
    png = os.path.join(OUT, f'v10_cdu_{tag}.png')
    subprocess.run([BLENDER, '--background', '--python', os.path.join(HERE, 'render_preview.py'), '--', path, png], capture_output=True, text=True, check=True)
    pngs.append(png)
a, b = (Image.open(p).convert('RGB') for p in pngs)
w, h = a.size
im = Image.new('RGB', (w, 2 * h + 8), (20, 20, 20))
im.paste(a, (0, 0))
im.paste(b, (0, h + 8))
d = ImageDraw.Draw(im)
try:
    f = ImageFont.truetype('arial.ttf', 30)
except OSError:
    f = ImageFont.load_default()
d.text((16, 12), 'repouso', fill=(255, 230, 60), font=f)
d.text((16, h + 20), sys.argv[2], fill=(255, 230, 60), font=f)
im.save(os.path.join(OUT, 'v10_cdu_press.png'))
print('out/v10_cdu_press.png', im.size)
