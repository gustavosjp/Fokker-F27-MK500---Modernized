"""v9 preview layouts: the v8.2 views plus pedestal views, with the CDU page drawn on its real (turned) screen quad from the dump
instead of a stand-in box, and the hide list of the current layout (old AP panel and servo switches since v9).

Usage: python make_v9_layouts.py   (after make_v82_layouts.py and make_pedestal_views.py)
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
LAY = os.path.join(OUT, 'layouts')
hide_json = os.path.join(os.environ.get('TEMP', OUT), 'f27-wt21-hide.json')
hidden = json.load(open(hide_json, encoding='utf-8'))['all']   # written by scaffold.ps1 (expand-hide.mjs)
cdu = os.path.join(OUT, 'pages', 'cdu.png').replace('\\', '/')
page = os.path.join(OUT, 'pages', 'page_portrait.png').replace('\\', '/')
# v9.1: every screen is an exact-size generated quad (no node scale), so the stand-in pages go on the real quads (no extra boxes)
pages = {'$gaugesF27wt21fmc': cdu, '$gaugesF27wt21pfd1': page, '$gaugesF27wt21pfd2': page, '$gaugesF27wt21mfd1': page}

views = {'user': 'v82_user', 'fcp': 'v82_fcp', 'dcp': 'v82_dcp', 'pilot': 'v82_pilot', 'ped_top': 'ped_top', 'ped_pilot': 'ped_pilot'}
for name, src in views.items():
    j = json.load(open(os.path.join(LAY, f'{src}.json'), encoding='utf-8'))
    j['screens'] = []
    j['gauge_images'] = pages
    j['hide_prefixes'] = hidden
    json.dump(j, open(os.path.join(LAY, f'v9_{name}.json'), 'w', encoding='utf-8'))
# a close look at the CDU from the captain's eye
j = json.load(open(os.path.join(LAY, 'v9_ped_pilot.json'), encoding='utf-8'))
j.update(eye=[0.5, 0.807, 8.4545], look_at=[0.137, 0.15, 8.80], fov_deg=32, res=[1600, 1200])
json.dump(j, open(os.path.join(LAY, 'v9_cdu.json'), 'w', encoding='utf-8'))
print('v9 preview layouts written')
