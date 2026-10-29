"""v10.3 previews of the folding tablet: the generated interior with the tablet in use (dump out/interior_v103) and folded against the
wall (out/interior_v103s, from make_fold_demo.mjs), from the captain's eye, the user's usual camera and the cockpit centre. The tablet
screen shows out/pages/tablet_v103.png (a capture of the app's browser preview). Writes out/fold_<view>.png, use on the left and folded
on the right.
Usage: python make_v103_views.py <hide json>
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
LAY = os.path.join(OUT, 'layouts')
BLENDER = r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
hidden = json.load(open(sys.argv[1], encoding='utf-8'))['all']
base = json.load(open(os.path.join(LAY, 'v10_pilot.json'), encoding='utf-8'))
pages = dict(base.get('gauge_images', {}))
pages['$gaugesF27tablet'] = os.path.join(OUT, 'pages', 'tablet_v103.png').replace(os.sep, '/')
base.update(hide_prefixes=hidden, gauge_images=pages)
eye = [0.5, 0.807, 8.4545]
views = {
    'pilot': dict(eye=eye, look_at=[0.80, 0.50, 8.56], fov_deg=62, roll_deg=0, res=[1200, 820], clip_start=0.05),
    'user': {k: v for k, v in json.load(open(os.path.join(LAY, 'v82_user.json'), encoding='utf-8')).items() if k in ('eye', 'look_at', 'fov_deg', 'roll_deg', 'clip_start')},
    'side': dict(eye=[0.25, 0.70, 8.70], look_at=[0.86, 0.50, 8.55], fov_deg=60, roll_deg=0, res=[1200, 820], clip_start=0.05),
}
views['user']['res'] = [1200, 820]
for name, v in views.items():
    shots = []
    for pose, dump in (('use', 'interior_v103'), ('stowed', 'interior_v103s')):
        j = dict(base)
        j.update(v)
        j['dump'] = os.path.join(OUT, dump).replace(os.sep, '/')
        path = os.path.join(LAY, f'v103_{name}_{pose}.json')
        json.dump(j, open(path, 'w', encoding='utf-8'))
        png = os.path.join(OUT, f'v103_{name}_{pose}.png')
        subprocess.run([BLENDER, '--background', '--python', os.path.join(HERE, 'render_preview.py'), '--', path, png], capture_output=True, text=True, check=True)
        shots.append((pose, Image.open(png).convert('RGB')))
    w, h = shots[0][1].size
    pair = Image.new('RGB', (w * 2 + 12, h + 44), (24, 26, 30))
    d = ImageDraw.Draw(pair)
    for i, (pose, im) in enumerate(shots):
        pair.paste(im, (i * (w + 12), 44))
        d.text((i * (w + 12) + 14, 12), {'use': 'em uso', 'stowed': 'recolhido (toque na borda)'}[pose], fill=(232, 237, 242))
    out = os.path.join(OUT, f'fold_{name}.png')
    pair.save(out)
    print(out)
