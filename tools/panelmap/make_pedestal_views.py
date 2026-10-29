"""Preview layouts looking at the centre pedestal (v9 planning): straight down from above, and from the captain's eye.
Takes the hide list and screens of out/layouts/v82_user.json, swaps the camera.
Usage: python make_pedestal_views.py [suffix]   -> out/layouts/ped_top<suffix>.json, ped_pilot<suffix>.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.join(HERE, 'out', 'layouts')
suffix = sys.argv[1] if len(sys.argv) > 1 else ''
base = json.load(open(os.path.join(L, 'v82_user.json'), encoding='utf-8'))
views = {
    'ped_top': dict(eye=[0.0, 1.10, 8.735], look_at=[0.0, 0.14, 8.74], ortho=True, ortho_scale=0.62, clip_start=0.55, roll_deg=0, res=[1400, 1400]),
    'ped_pilot': dict(eye=[0.5, 0.807, 8.4545], look_at=[0.0, 0.15, 8.75], fov_deg=50, clip_start=0.05, roll_deg=0, res=[1600, 1200]),
}
for name, v in views.items():
    j = dict(base)
    for k in ('ortho', 'ortho_scale'):
        j.pop(k, None)
    j.update(v)
    json.dump(j, open(os.path.join(L, f'{name}{suffix}.json'), 'w', encoding='utf-8'))
print('pedestal views written')
