"""Paints the hardware atlas of the WT21 cockpit (CJ4 style) from the atlas map written by make-g1000-interior.mjs and saves it as
F27WT21_HW.PNG.DDS (DXT1 + mips + sidecar). Cells: solid swatches (panel insert, module grey, frame, key sides, knob body), the knob
knurl strip, the knob top, the module faces (CJ4 grey with printed labels for the knobs and groups) and one key cap per key (black cap,
white legend, unlit lamp bar on the autopilot mode keys).

v11.5 (comment on flightsim.to: "texturas um pouco melhores no Pro Line"): painted at twice the map's size (4096, so the legends stay
sharp up close), with paint grain and soft edge shading on the faces, bevelled caps, glass lamp lenses, shaded knurl ridges and a
machined knob top; plus F27WT21_HW_COMP.PNG.DDS, the occlusion/roughness/metallic map in the author's form (R occlusion, G roughness,
B metallic; FL_BITMAP_METAL_ROUGH_AO_DATA), so matte paint, semi-gloss caps and glass lenses catch the cockpit light differently.
The noise is seeded: the same layout always paints the same atlas.

Usage: python make-hw-atlas.py <atlas map json> <wt21-layout.json> <texture dir> [png preview path]
"""
import functools
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dds_bc1 import write_dds  # noqa: E402

amap = json.load(open(sys.argv[1], encoding='utf-8'))
layout = json.load(open(sys.argv[2], encoding='utf-8'))
tex_dir = sys.argv[3]
png = sys.argv[4] if len(sys.argv) > 4 else None
COL = layout['colors']
TEXT = np.array(COL['text'], dtype=np.float32)
SS = 2                      # painted at twice the map's size; the UVs are fractions of the atlas, so they stay valid
S = amap['size'] * SS
rng = np.random.default_rng(27)

alb = np.full((S, S, 3), 128, dtype=np.float32)
ao = np.ones((S, S), dtype=np.float32)
rough = np.full((S, S), 0.7, dtype=np.float32)
text_mask = Image.new('L', (S, S), 0)          # every printed legend/label, then laid over the albedo and the roughness
td = ImageDraw.Draw(text_mask)

# roughness of the plain swatches (the geometry maps whole faces onto them, so they stay flat colours)
SWATCH_ROUGH = {'panel': 0.65, 'module': 0.78, 'frame': 0.6, 'keySide': 0.45, 'knob': 0.45, 'recess': 0.9, 'lampOn': 0.2,
                'tabletCase': 0.55, 'tabletGlass': 0.25, 'tabletMount': 0.5}


@functools.lru_cache(maxsize=None)
def font(px):
    for name in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, max(8, int(px)))
        except OSError:
            pass
    return ImageFont.load_default()


def grain(h, w, blur=1):
    """Unit-variance noise, softened by a few box passes so it reads as paint texture rather than pixel noise."""
    n = rng.standard_normal((h, w)).astype(np.float32)
    for _ in range(blur):
        p = np.pad(n, 1, mode='edge')
        n = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 2 * p[1:-1, 1:-1]) / 6
    return n / max(1e-6, n.std())


def edge_falloff(h, w, ramp, radius=0.0):
    """0 on the border of a (rounded) rectangle, rising to 1 at `ramp` pixels inside it."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    dx = np.maximum(radius - np.minimum(x, w - x), 0)
    dy = np.maximum(radius - np.minimum(y, h - y), 0)
    inside = np.minimum(np.minimum(x, w - x), np.minimum(y, h - y))
    d = np.where((dx > 0) & (dy > 0), radius - np.hypot(dx, dy), inside)
    t = np.clip(d / max(1.0, ramp), 0, 1)
    return t * t * (3 - 2 * t)


def vgrad(h, w, top, bottom):
    return np.linspace(top, bottom, h, dtype=np.float32)[:, None] * np.ones((1, w), dtype=np.float32)


def centered(text, cx, cy, f):
    w = td.textlength(text, font=f)
    bb = td.textbbox((0, 0), text, font=f)
    td.text((cx - w / 2, cy - (bb[1] + bb[3]) / 2), text, fill=255, font=f)


def paint_face(x, y, w, h, col, c):
    """Module face: matte CJ4 grey with paint grain, a light top bevel, a dark bottom edge and soft shading into the corners."""
    g = grain(h, w)
    f = edge_falloff(h, w, 10 * SS)
    base = col[None, None, :] + (vgrad(h, w, 5, -5) + 1.8 * g)[..., None]
    base *= (0.9 + 0.1 * f)[..., None]
    e = max(3, int(h * 0.02))
    base[:e] += 22
    base[h - e:] -= 26
    alb[y:y + h, x:x + w] = base
    ao[y:y + h, x:x + w] = 0.8 + 0.2 * f
    rough[y:y + h, x:x + w] = 0.78 + 0.03 * g
    mw, _ = c['size']
    ppm = w / mw
    for lab in c.get('labels', []):
        centered(lab['text'], x + lab['x'] * ppm, y + lab['y'] * ppm, font(0.0034 * ppm))


def paint_key(x, y, w, h, col, c):
    """Key cap: black semi-gloss plastic with a rounded bevel (lit along the top, shaded along the sides and bottom), a glass lamp lens
    on the autopilot mode keys and a white legend."""
    m = min(w, h)
    g = grain(h, w)
    f = edge_falloff(h, w, 0.08 * m, radius=0.12 * m)
    edge = 1 - f
    yy = np.arange(h, dtype=np.float32)[:, None] / h
    top = np.clip(1 - yy / 0.25, 0, 1)
    base = col[None, None, :] + (vgrad(h, w, 8, -4) + 1.2 * g + edge * (20 * top - 24 * (1 - top)))[..., None]
    alb[y:y + h, x:x + w] = base
    ao[y:y + h, x:x + w] = 0.78 + 0.22 * f
    rough[y:y + h, x:x + w] = 0.42 + 0.03 * g + 0.1 * edge
    legend_top = y
    if c.get('light'):
        lamp = np.array(c.get('lamp', (44, 62, 48)), dtype=np.float32)
        lx0, lx1 = int(x + w * 0.22), int(x + w * 0.78)
        ly0, ly1 = int(y + h * 0.10), int(y + h * 0.20)
        lw, lh = lx1 - lx0, ly1 - ly0
        lens = lamp[None, None, :] + vgrad(lh, lw, 10, -6)[..., None]
        fr = max(1, SS)
        lens[:fr] -= 18
        lens[-fr:] -= 18
        lens[:, :fr] -= 18
        lens[:, -fr:] -= 18
        lens[fr:fr + max(1, lh // 6), fr:-fr] += 26       # reflection along the top of the lens
        alb[ly0:ly1, lx0:lx1] = lens
        rough[ly0:ly1, lx0:lx1] = 0.15
        ao[ly0:ly1, lx0:lx1] = 1
        legend_top = y + h * 0.16
    label = c['label']
    lines = label.split(' ') if (' ' in label and len(label) > 5) else [label]   # 'PFD MENU' -> two lines
    avail_h = (y + h - legend_top) * 0.80
    # v10.9.1 (user: the CDU's legends "não estão legíveis"): a key without a lamp bar lets its legend grow to 0.6 of the cap
    size = min(avail_h / len(lines) * 0.95, h * (0.42 if c.get('light') else 0.6))
    while size > 8 and max(td.textlength(t, font=font(size)) for t in lines) > w * 0.84:
        size -= 1
    mid = (legend_top + y + h) / 2
    for k, t in enumerate(lines):
        centered(t, x + w / 2, mid + (k - (len(lines) - 1) / 2) * size * 1.05, font(size))


def paint_knurl(x, y, w, h, col):
    """Knob side: rounded ridges (lit crest, shaded groove) rather than flat stripes, a little lighter towards the top edge."""
    px = np.arange(w, dtype=np.float32)[None, :] * np.ones((h, 1), dtype=np.float32)
    prof = np.cos(2 * np.pi * px / (8 * SS))
    alb[y:y + h, x:x + w] = col[None, None, :] + (16 * prof + vgrad(h, w, 8, -8))[..., None]
    ao[y:y + h, x:x + w] = 0.85 + 0.15 * (0.5 + 0.5 * prof)
    rough[y:y + h, x:x + w] = 0.5 - 0.08 * prof


def paint_knob_top(x, y, w, h, col):
    """Knob cap: domed (lighter towards the top-left), fine machining rings, a shaded rim and a white index line; drawn 4x and averaged
    down so the circle and the line are anti-aliased."""
    k = 4
    Y, X = (np.mgrid[0:h * k, 0:w * k].astype(np.float32) + 0.5) / k
    cx, cy, r = w / 2, h / 2, w / 2 * 0.98
    rr = np.hypot(X - cx, Y - cy) / r
    inside = rr < 1
    light = np.clip(1 - 0.55 * ((X - cx + 0.35 * r) ** 2 + (Y - cy + 0.35 * r) ** 2) / r ** 2, 0, 1)
    rings = np.sin(rr * 2 * np.pi * 38)
    rim = np.clip((rr - 0.9) / 0.1, 0, 1)
    shade = np.where(inside, 34 * light + 3 * rings - 12 * rim, 0)
    line = inside & (np.abs(X - cx) < 0.025 * r) & (Y > cy - 0.92 * r) & (Y < cy - 0.35 * r)
    a = np.where(line[..., None], np.float32(240), col[None, None, :] + shade[..., None])
    rg = np.where(line, 0.6, np.where(inside, 0.35 + 0.08 * rings, 0.45))
    o = np.where(inside, 1 - 0.15 * rim, 1.0)
    down = lambda v: v.reshape(h, k, w, k, *v.shape[2:]).mean(axis=(1, 3))
    alb[y:y + h, x:x + w] = down(a)
    rough[y:y + h, x:x + w] = down(rg)
    ao[y:y + h, x:x + w] = down(o)


for c in amap['cells']:
    x, y, w, h = (v * SS for v in c['rect'])
    kind = c['kind']
    col = np.array(c.get('color', (128, 128, 128)), dtype=np.float32)
    if kind == 'swatch':
        alb[y:y + h, x:x + w] = col
        name = c['name'].split(':', 1)[1]
        rough[y:y + h, x:x + w] = SWATCH_ROUGH.get(name, 0.7)
        if name == 'recess':
            ao[y:y + h, x:x + w] = 0.6
    elif kind == 'knurl':
        paint_knurl(x, y, w, h, col)
    elif kind == 'knobTop':
        paint_knob_top(x, y, w, h, col)
    elif kind == 'face':
        paint_face(x, y, w, h, col, c)
    elif kind == 'key':
        paint_key(x, y, w, h, col, c)

# printed legends and labels: white ink, a little rougher than the cap it sits on
m = np.asarray(text_mask, dtype=np.float32) / 255
alb = alb * (1 - m[..., None]) + TEXT[None, None, :] * m[..., None]
rough = rough * (1 - m) + 0.55 * m

im = Image.fromarray(np.clip(np.rint(alb), 0, 255).astype(np.uint8), 'RGB')
comp_px = np.stack([ao, rough, np.zeros_like(ao)], -1)
comp = Image.fromarray(np.clip(np.rint(comp_px * 255), 0, 255).astype(np.uint8), 'RGB').resize((S // 2, S // 2), Image.BOX)

os.makedirs(tex_dir, exist_ok=True)
write_dds(im, os.path.join(tex_dir, 'F27WT21_HW.PNG.DDS'))
write_dds(comp, os.path.join(tex_dir, 'F27WT21_HW_COMP.PNG.DDS'),
          ('FL_BITMAP_COMPRESSION', 'FL_BITMAP_MIPMAP', 'FL_BITMAP_NO_GAMMA_CORRECTION', 'FL_BITMAP_METAL_ROUGH_AO_DATA'))
if png:
    im.save(png)
    comp.save(os.path.splitext(png)[0] + '_COMP.png')
print(f"hardware atlas: {len(amap['cells'])} cells, {S}x{S} + COMP {S // 2}x{S // 2} -> {tex_dir}")
