"""Preview layouts for the v10 PROPOSAL (sandbox model dumped to out/interior_v10): the user's usual camera (v82_user's eye), the
captain's eye, and the copilot side, with the stand-in pages on the real screen quads.
Usage: python make_v10_views.py <hide json of the proposal>
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
LAY = os.path.join(OUT, 'layouts')
hidden = json.load(open(sys.argv[1], encoding='utf-8'))['all']
pages = {'$gaugesF27wt21fmc': os.path.join(OUT, 'pages', 'cdu.png').replace('\\', '/'),
         '$gaugesF27wt21pfd1': os.path.join(OUT, 'pages', 'page_portrait.png').replace('\\', '/'),
         '$gaugesF27wt21mfd1': os.path.join(OUT, 'pages', 'page_portrait.png').replace('\\', '/')}
base = json.load(open(os.path.join(LAY, 'v82_user.json'), encoding='utf-8'))
base.update(dump=os.path.join(OUT, 'interior_v10').replace('\\', '/'), hide_prefixes=hidden, screens=[], gauge_images=pages)
views = {
    'v10_user': {},
    'v10_pilot': dict(eye=[0.5, 0.807, 8.4545], look_at=[0.33, 0.36, 9.17], fov_deg=62, roll_deg=0, res=[1800, 1100], clip_start=0.05),
    'v10_copilot': dict(eye=[0.0, 0.85, 8.35], look_at=[-0.35, 0.36, 9.17], fov_deg=55, roll_deg=0, res=[1600, 1000], clip_start=0.3),
}
for name, v in views.items():
    j = dict(base)
    j.update(v)
    json.dump(j, open(os.path.join(LAY, f'{name}.json'), 'w', encoding='utf-8'))
print('v10 proposal views written')
