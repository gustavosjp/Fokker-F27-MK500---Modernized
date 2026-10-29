"""Paints the hardware atlas of the WT21 cockpit (CJ4 style) from the atlas map written by make-g1000-interior.mjs and saves it as
F27WT21_HW.PNG.DDS (DXT1 + mips + sidecar). Cells: solid swatches (panel insert, module grey, frame, key sides, knob body), the knob
knurl strip, the knob top, the module faces (CJ4 grey with printed labels for the knobs and groups) and one key cap per key (black cap,
white legend, unlit lamp bar on the autopilot mode keys).

Usage: python make-hw-atlas.py <atlas map json> <wt21-layout.json> <texture dir> [png preview path]
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dds_bc1 import write_dds  # noqa: E402

import json  # noqa: E402

amap = json.load(open(sys.argv[1], encoding='utf-8'))
layout = json.load(open(sys.argv[2], encoding='utf-8'))
tex_dir = sys.argv[3]
png = sys.argv[4] if len(sys.argv) > 4 else None
COL = layout['colors']
TEXT = tuple(COL['text'])
S = amap['size']
im = Image.new('RGB', (S, S), (128, 128, 128))
d = ImageDraw.Draw(im)


def font(px, bold=True):
    for name in (('arialbd.ttf', 'Arial Bold.ttf') if bold else ('arial.ttf', 'Arial.ttf')) + ('DejaVuSans-Bold.ttf',):
        try:
            return ImageFont.truetype(name, max(8, int(px)))
        except OSError:
            pass
    return ImageFont.load_default()


def shade(c, k):
    return tuple(max(0, min(255, int(v + k))) for v in c)


def centered(text, cx, cy, f, fill):
    w = d.textlength(text, font=f)
    bb = d.textbbox((0, 0), text, font=f)
    d.text((cx - w / 2, cy - (bb[1] + bb[3]) / 2), text, fill=fill, font=f)


for c in amap['cells']:
    x, y, w, h = c['rect']
    kind = c['kind']
    col = tuple(c.get('color', (128, 128, 128)))
    if kind == 'swatch':
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=col)
    elif kind == 'knurl':   # vertical ridges around the knob's side
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=col)
        for k in range(0, w, 8):
            d.rectangle([x + k, y, x + k + 3, y + h - 1], fill=shade(col, 28))
    elif kind == 'knobTop':   # domed cap, lighter towards the top-left, white index line
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=col)
        cx, cy, r = x + w / 2, y + h / 2, w / 2
        for k in range(12):
            rr = r * (1 - k / 14)
            off = k * r * 0.012
            d.ellipse([cx - rr - off, cy - rr - off, cx + rr - off, cy + rr - off], fill=shade(col, 6 + k * 3))
        d.line([cx, cy - r * 0.92, cx, cy - r * 0.35], fill=(240, 240, 240), width=max(3, int(w * 0.05)))
    elif kind == 'face':   # module face: CJ4 grey, light top edge, dark bottom edge, printed labels
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=col)
        e = max(3, int(h * 0.02))
        d.rectangle([x, y, x + w - 1, y + e], fill=shade(col, 22))
        d.rectangle([x, y + h - 1 - e, x + w - 1, y + h - 1], fill=shade(col, -26))
        mw, mh = c['size']
        ppm = w / mw
        for lab in c.get('labels', []):
            f = font(0.0034 * ppm)
            centered(lab['text'], x + lab['x'] * ppm, y + lab['y'] * ppm, f, TEXT)
    elif kind == 'key':   # black cap, faint top highlight, white legend, optional unlit lamp bar
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=col)
        for k in range(h // 2):
            d.line([x, y + k, x + w - 1, y + k], fill=shade(col, 10 - 20 * k / h))
        top = y
        if c.get('light'):
            lamp = tuple(c.get('lamp', (44, 62, 48)))
            d.rectangle([x + w * 0.22, y + h * 0.10, x + w * 0.78, y + h * 0.20], fill=lamp)
            top = y + h * 0.16
        label = c['label']
        lines = label.split(' ') if (' ' in label and len(label) > 5) else [label]   # 'PFD MENU' -> two lines
        avail_h = (y + h - top) * 0.80
        # v10.9.1 (user: the CDU's legends "não estão legíveis"): a key without a lamp bar lets its legend grow to 0.6 of the cap
        size = min(avail_h / len(lines) * 0.95, h * (0.42 if c.get('light') else 0.6))
        while size > 8 and max(d.textlength(t, font=font(size)) for t in lines) > w * 0.84:
            size -= 1
        f = font(size)
        mid = (top + y + h) / 2
        for k, t in enumerate(lines):
            centered(t, x + w / 2, mid + (k - (len(lines) - 1) / 2) * size * 1.05, f, TEXT)

os.makedirs(tex_dir, exist_ok=True)
write_dds(im, os.path.join(tex_dir, 'F27WT21_HW.PNG.DDS'))
if png:
    im.save(png)
print(f"hardware atlas: {len(amap['cells'])} cells -> {os.path.join(tex_dir, 'F27WT21_HW.PNG.DDS')}")
