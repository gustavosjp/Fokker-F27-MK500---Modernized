"""v10.2 tablet previews (dump out/interior_v102): from the captain's eye looking at it, the user's usual camera, and from the cockpit
centre looking left at the arm. The tablet screen shows out/pages/tablet.png (a capture of the app's browser preview).
Usage: python make_tablet_views.py <hide json>
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
LAY = os.path.join(OUT, 'layouts')
BLENDER = r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
hidden = json.load(open(sys.argv[1], encoding='utf-8'))['all']
base = json.load(open(os.path.join(LAY, 'v10_pilot.json'), encoding='utf-8'))
pages = dict(base.get('gauge_images', {}))
pages['$gaugesF27tablet'] = os.path.join(OUT, 'pages', 'tablet.png').replace(os.sep, '/')
base.update(hide_prefixes=hidden, dump=os.path.join(OUT, 'interior_v102').replace(os.sep, '/'), gauge_images=pages)
eye = [0.5, 0.807, 8.4545]
views = {
    'tab_pilot': dict(eye=eye, look_at=[0.80, 0.50, 8.56], fov_deg=62, roll_deg=0, res=[1600, 1100], clip_start=0.05),
    'tab_user': {k: v for k, v in json.load(open(os.path.join(LAY, 'v82_user.json'), encoding='utf-8')).items() if k in ('eye', 'look_at', 'fov_deg', 'roll_deg', 'res', 'clip_start')},
    'tab_side': dict(eye=[0.25, 0.70, 8.70], look_at=[0.86, 0.50, 8.55], fov_deg=60, roll_deg=0, res=[1600, 1100], clip_start=0.05),
}
for name, v in views.items():
    j = dict(base)
    j.update(v)
    path = os.path.join(LAY, f'{name}.json')
    json.dump(j, open(path, 'w', encoding='utf-8'))
    png = os.path.join(OUT, f'{name}.png')
    subprocess.run([BLENDER, '--background', '--python', os.path.join(HERE, 'render_preview.py'), '--', path, png], capture_output=True, text=True, check=True)
    print(png)
