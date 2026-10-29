"""Views of the captain's LEFT side (side console, side wall, window frame) from the captain's eye, to find a place for the tablet.
Uses the dump out/interior_v10 (the current WT21 model) and its hide list.
Usage: python make_left_views.py <hide json>
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
base.update(hide_prefixes=hidden, dump=os.path.join(OUT, 'interior_v10').replace(os.sep, '/'))
eye = [0.5, 0.807, 8.4545]
views = {
    'left_side': dict(eye=eye, look_at=[0.95, 0.45, 8.55], fov_deg=75, roll_deg=0, res=[1600, 1100], clip_start=0.05),
    'left_down': dict(eye=eye, look_at=[0.80, 0.20, 8.45], fov_deg=75, roll_deg=0, res=[1600, 1100], clip_start=0.05),
    'left_fwd': dict(eye=eye, look_at=[0.85, 0.45, 8.95], fov_deg=70, roll_deg=0, res=[1600, 1100], clip_start=0.05),
}
for name, v in views.items():
    j = dict(base)
    j.update(v)
    path = os.path.join(LAY, f'{name}.json')
    json.dump(j, open(path, 'w', encoding='utf-8'))
    png = os.path.join(OUT, f'{name}.png')
    subprocess.run([BLENDER, '--background', '--python', os.path.join(HERE, 'render_preview.py'), '--', path, png], capture_output=True, text=True, check=True)
    print(png)
