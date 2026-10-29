"""v8.2 preview layouts: the v8 camera views (out/layouts/v8_*.json) with the screen pictures re-placed from tools/wt21-layout.json
(portrait PFD/MFD since v8.2) and a portrait 768x1024 stand-in page. The hardware itself comes from the dump of the generated glTF.

Usage: python make_v82_layouts.py
"""
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
layout = json.load(open(os.path.join(HERE, '..', 'wt21-layout.json'), encoding='utf-8'))

# stand-in portrait page: attitude block (sky/ground) on top, HSI arc below, tapes on the sides, like the WT21 PFD at 768x1024
page = os.path.join(OUT, 'pages', 'page_portrait.png')
im = Image.new('RGB', (768, 1024), (0, 0, 0))
d = ImageDraw.Draw(im)
d.rectangle([179, 60, 593, 260], fill=(20, 90, 200))
d.rectangle([179, 260, 593, 410], fill=(150, 80, 20))
d.rectangle([60, 60, 160, 410], fill=(40, 40, 48))
d.rectangle([612, 60, 712, 410], fill=(40, 40, 48))
d.ellipse([154, 520, 614, 980], outline=(235, 235, 235), width=5)
d.line([384, 540, 384, 960], fill=(60, 220, 60), width=6)
im.save(page)

units = {u['id']: u for u in layout['units']}
for view in ('user', 'fcp', 'dcp', 'pilot'):
    j = json.load(open(os.path.join(OUT, 'layouts', f'v8_{view}.json'), encoding='utf-8'))
    for s in j['screens']:
        u = units[s['name'].replace('WT21_', '').replace('_screen_img', '')]
        z = (u.get('screenZ') or layout['screenZ']) - 0.0003
        s['center'] = [u['screen']['center'][0], u['screen']['center'][1], z]
        s['size'] = u['screen']['size']
        if u['page'] == [768, 1024]:
            s['image'] = page.replace('\\', '/')
    json.dump(j, open(os.path.join(OUT, 'layouts', f'v82_{view}.json'), 'w', encoding='utf-8'))
print('v8.2 preview layouts written')
