"""Draws the control panels of the WT21 cockpit (bezel keys around the PFDs and the MFD, the CJ4-style FCP) from the controlSets of
wt21-layout.json and writes them as DXT1 DDS textures with mipmaps plus the MSFS ".json" sidecar, the same form as the author's textures.
The same rectangles become the invisible click zones (make-g1000-interior.mjs) and the XML interactions (scaffold.ps1), so what is drawn
is what is clickable.

Usage: python make-control-textures.py <wt21-layout.json> <texture dir for the DDS files> [png dir for previews]
Keys are lit by the cockpit light like any painted panel (no backlight yet); the lamps on the FCP keys are drawn unlit, because a static
texture cannot follow the autopilot state (the PFD's mode annunciation shows it).
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

layout = json.load(open(sys.argv[1], encoding='utf-8'))
tex_dir = sys.argv[2]
png_dir = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(tex_dir, exist_ok=True)
if png_dir:
    os.makedirs(png_dir, exist_ok=True)

PLATE = tuple(layout['plateRgb'])
KEY = (70, 71, 77)
KEY_EDGE = (18, 18, 20)
TEXT = (238, 238, 238)
LIGHT = (44, 62, 48)   # unlit mode lamp: the texture cannot show the AP state, the PFD's mode line does


def font(px):
    for name in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            pass
    return ImageFont.load_default()


def shade(c, d):
    return tuple(max(0, min(255, v + d)) for v in c)


def draw_set(cs):
    """Draws a control set at the panel's true aspect (so text is not distorted), then stretches it to the power-of-two texture.
    Painted relief: bevelled panel edge, recessed screen opening, raised keys (drop shadow, lit top edge, dark bottom edge) and knurled
    knobs, so the flat quads read as hardware under the cockpit light."""
    aw, ah = cs['aspect']
    tw, th = cs['texSize']
    ppm = 4200 if aw * 4200 <= 4096 and ah * 4200 <= 4096 else 4096 / max(aw, ah)   # pixels per metre while drawing
    W, H = int(round(aw * ppm)), int(round(ah * ppm))
    mm = ppm / 1000.0
    im = Image.new('RGB', (W, H), PLATE)
    d = ImageDraw.Draw(im)
    # bevelled outer edge: light top/left, dark bottom/right
    e = max(2, int(1.6 * mm))
    for k in range(e):
        d.line([(k, k), (W - 1 - k, k)], fill=shade(PLATE, 26 - k * 3))
        d.line([(k, k), (k, H - 1 - k)], fill=shade(PLATE, 20 - k * 3))
        d.line([(k, H - 1 - k), (W - 1 - k, H - 1 - k)], fill=shade(PLATE, -26 + k * 3))
        d.line([(W - 1 - k, k), (W - 1 - k, H - 1 - k)], fill=shade(PLATE, -20 + k * 3))
    if 'screen' in cs:   # recessed screen opening: dark frame, shadow inside the top/left, light lip at the bottom/right
        u0, v0, u1, v1 = cs['screen']
        m = int(3.5 * mm)
        x0, y0, x1, y1 = u0 * W - m, v0 * H - m, u1 * W + m, v1 * H + m
        d.rectangle([x0 - 2 * mm, y0 - 2 * mm, x1 + 2 * mm, y1 + 2 * mm], fill=shade(PLATE, -14))
        d.rectangle([x0, y0, x1, y1], fill=(8, 8, 10))
        d.line([(x0, y1 + 2 * mm), (x1 + 2 * mm, y1 + 2 * mm)], fill=shade(PLATE, 30), width=max(1, int(0.8 * mm)))
        d.line([(x1 + 2 * mm, y0), (x1 + 2 * mm, y1 + 2 * mm)], fill=shade(PLATE, 22), width=max(1, int(0.8 * mm)))
    for c in cs['controls']:
        u0, v0, u1, v1 = c['rect']
        x0, y0, x1, y1 = u0 * W, v0 * H, u1 * W, v1 * H
        if c['type'] == 'key':
            rad = int(2.2 * mm)
            sh = 0.9 * mm
            d.rounded_rectangle([x0 + sh, y0 + sh * 1.6, x1 + sh, y1 + sh * 1.6], radius=rad, fill=shade(PLATE, -24))   # drop shadow
            d.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=KEY, outline=KEY_EDGE, width=max(2, int(0.5 * mm)))
            # lit top half and darker lower edge: a cheap gradient
            steps = 6
            for k in range(steps):
                yy0 = y0 + 1.2 * mm + k * (y1 - y0) * 0.5 / steps
                d.rectangle([x0 + rad * 0.6, yy0, x1 - rad * 0.6, yy0 + (y1 - y0) * 0.5 / steps], fill=shade(KEY, 12 - 2 * k))
            d.line([(x0 + rad, y0 + 1), (x1 - rad, y0 + 1)], fill=shade(KEY, 40), width=max(1, int(0.5 * mm)))
            d.line([(x0 + rad, y1 - 1), (x1 - rad, y1 - 1)], fill=shade(KEY, -30), width=max(1, int(0.6 * mm)))
            if c.get('light'):
                lh = max(3, int(1.1 * mm))
                d.rounded_rectangle([x0 + (x1 - x0) * 0.25, y0 + 1.6 * mm, x1 - (x1 - x0) * 0.25, y0 + 1.6 * mm + lh], radius=lh // 2, fill=LIGHT)
            label = c['label']
            fs = int(min((y1 - y0) * 0.34, (x1 - x0) / max(3.2, 0.62 * len(label))))
            f = font(max(10, fs))
            tw_ = d.textlength(label, font=f)
            ty = (y0 + y1) / 2 - fs * 0.40 + (1.0 * mm if c.get('light') else 0)
            d.text(((x0 + x1 - tw_) / 2, ty), label, fill=TEXT, font=f)
        else:   # knob: shadow, knurled skirt, domed cap, pointer; label under it (or over it when there is no room)
            cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, min(x1 - x0, y1 - y0) / 2
            d.ellipse([cx - r + 1.2 * mm, cy - r + 1.8 * mm, cx + r + 1.2 * mm, cy + r + 1.8 * mm], fill=shade(PLATE, -26))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(22, 22, 25), outline=(120, 120, 126), width=max(2, int(0.6 * mm)))
            import math
            for k in range(36):   # knurling
                a_ = 2 * math.pi * k / 36
                d.line([(cx + math.cos(a_) * r * 0.80, cy + math.sin(a_) * r * 0.80), (cx + math.cos(a_) * r * 0.97, cy + math.sin(a_) * r * 0.97)],
                       fill=(70, 70, 76), width=max(1, int(0.4 * mm)))
            for k, rr in enumerate([0.70, 0.62, 0.54, 0.46, 0.38]):   # domed cap: lighter towards the top-left
                off = (0.70 - rr) * r * 0.25
                d.ellipse([cx - rr * r - off, cy - rr * r - off, cx + rr * r - off, cy + rr * r - off], fill=(44 + 7 * k, 44 + 7 * k, 50 + 7 * k))
            d.line([cx, cy - r * 0.66, cx, cy - r * 0.2], fill=(235, 235, 235), width=max(2, int(0.7 * mm)))
            f = font(max(10, int(4.0 * mm)))
            tw_ = d.textlength(c['label'], font=f)
            ty = y1 + 0.8 * mm
            if ty + 5 * mm > H:
                ty = y0 - 5.2 * mm
            d.text((cx - tw_ / 2, ty), c['label'], fill=TEXT, font=f)
    return im.resize((tw, th), Image.LANCZOS)


# ---------- DXT1 (BC1) encoder: per 4x4 block, endpoints = darkest/brightest pixel, 4-colour mode, nearest-colour indices ----------
def to565(c):
    c = np.clip(np.rint(c), 0, 255).astype(np.int32)
    return ((c[..., 0] >> 3) << 11) | ((c[..., 1] >> 2) << 5) | (c[..., 2] >> 3)


def from565(v):
    r = ((v >> 11) & 31) * 255 / 31
    g = ((v >> 5) & 63) * 255 / 63
    b = (v & 31) * 255 / 31
    return np.stack([r, g, b], -1)


def bc1(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w = a.shape[:2]
    ph, pw = (h + 3) // 4 * 4, (w + 3) // 4 * 4
    if (ph, pw) != (h, w):
        a = np.pad(a, ((0, ph - h), (0, pw - w), (0, 0)), mode='edge')
    blocks = a.reshape(ph // 4, 4, pw // 4, 4, 3).transpose(0, 2, 1, 3, 4).reshape(-1, 16, 3)
    lum = blocks @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hi = blocks[np.arange(len(blocks)), lum.argmax(1)]
    lo = blocks[np.arange(len(blocks)), lum.argmin(1)]
    c0, c1 = to565(hi), to565(lo)
    swap = c0 < c1
    c0, c1 = np.where(swap, c1, c0), np.where(swap, c0, c1)
    same = c0 == c1
    c0 = np.where(same & (c0 < 0xFFFF), c0 + 1, c0)   # keep 4-colour mode (c0 > c1) even for flat blocks
    p0, p1 = from565(c0), from565(c1)
    pal = np.stack([p0, p1, (2 * p0 + p1) / 3, (p0 + 2 * p1) / 3], 1)                 # (n, 4, 3)
    dist = ((blocks[:, :, None, :] - pal[:, None, :, :]) ** 2).sum(-1)                # (n, 16, 4)
    idx = dist.argmin(-1).astype(np.uint32)
    bits = (idx << (2 * np.arange(16, dtype=np.uint32))).sum(1).astype(np.uint32)
    out = np.zeros((len(blocks), 2), dtype=np.uint32)
    out[:, 0] = c0.astype(np.uint32) | (c1.astype(np.uint32) << 16)
    out[:, 1] = bits
    return out.tobytes()


def write_dds(img, path):
    w, h = img.size
    levels = []
    cur = img
    while True:
        levels.append(bc1(cur))
        if cur.size == (1, 1):
            break
        cur = cur.resize((max(1, cur.size[0] // 2), max(1, cur.size[1] // 2)), Image.BOX)
    hdr = bytearray(128)
    hdr[0:4] = b'DDS '
    def u32(off, v): hdr[off:off + 4] = int(v).to_bytes(4, 'little')
    u32(4, 124); u32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000)
    u32(12, h); u32(16, w); u32(20, len(levels[0])); u32(28, len(levels))
    u32(76, 32); u32(80, 0x4); hdr[84:88] = b'DXT1'
    u32(108, 0x1000 | 0x8 | 0x400000)
    with open(path, 'wb') as f:
        f.write(bytes(hdr))
        for lv in levels:
            f.write(lv)
    with open(path + '.json', 'w') as f:
        json.dump({'Version': 2, 'SourceFileDate': 133688302360000000, 'Flags': ['FL_BITMAP_COMPRESSION', 'FL_BITMAP_MIPMAP']}, f)


for name, cs in layout['controlSets'].items():
    im = draw_set(cs)
    write_dds(im, os.path.join(tex_dir, cs['texture']))
    if png_dir:
        im.save(os.path.join(png_dir, cs['texture'].replace('.PNG.DDS', '.png')))
    print(f"{name}: {cs['texture']} {cs['texSize'][0]}x{cs['texSize'][1]}, {len(cs['controls'])} controls")
