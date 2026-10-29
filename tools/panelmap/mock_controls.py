"""MOCK-UP images for the controls still to be built (preview only, nothing here goes into the package):
a CJ4-style autopilot panel (FCP) where the radio/CRS box is, and bezel keys around the PFDs (DCP functions) and the MFD (CCP functions).
Usage: python mock_controls.py <outDir>"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
try:
    F = ImageFont.truetype('arialbd.ttf', 26); FS = ImageFont.truetype('arialbd.ttf', 20)
except OSError:
    F = FS = ImageFont.load_default()
PLATE = (36, 36, 40); KEY = (58, 58, 64); TXT = (235, 235, 235)

def key(d, x0, y0, x1, y1, label, light=False, font=None):
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=KEY, outline=(15, 15, 18), width=3)
    if light: d.rectangle([x0 + (x1 - x0) * 0.3, y0 + 8, x1 - (x1 - x0) * 0.3, y0 + 14], fill=(90, 255, 90))
    f = font or F
    w = d.textlength(label, font=f)
    d.text(((x0 + x1 - w) / 2, (y0 + y1) / 2 - 12), label, fill=TXT, font=f)

def knob(d, cx, cy, r, label):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(20, 20, 22), outline=(120, 120, 125), width=4)
    d.ellipse([cx - r * 0.6, cy - r * 0.6, cx + r * 0.6, cy + r * 0.6], fill=(45, 45, 50))
    w = d.textlength(label, font=FS); d.text((cx - w / 2, cy + r + 4), label, fill=TXT, font=FS)

# FCP 0.30 x 0.055 m
W, H = 1200, 220
im = Image.new('RGB', (W, H), PLATE); d = ImageDraw.Draw(im)
knob(d, 70, 85, 50, 'CRS 1')
for i, l in enumerate(['NAV', 'HDG', 'APPR', 'BC']): key(d, 140 + i * 82, 40, 212 + i * 82, 130, l, light=True)
knob(d, 520, 85, 50, 'HDG')
for i, l in enumerate(['VNAV', 'FLC', 'VS', 'ALT']): key(d, 590 + i * 82, 40, 662 + i * 82, 130, l, light=True)
knob(d, 950, 85, 45, 'ALT')
key(d, 1010, 40, 1080, 85, 'AP', light=True); key(d, 1010, 92, 1080, 137, 'YD', light=True)
knob(d, 1135, 85, 45, 'CRS 2')
d.rectangle([0, 0, W - 1, H - 1], outline=(10, 10, 12), width=6)
im.save(os.path.join(out, 'fcp.png'))

def bezel(W, H, scr, left, right, knobs, name):
    im = Image.new('RGB', (W, H), PLATE); d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = scr
    d.rectangle([x0 - 6, y0 - 6, x1 + 6, y1 + 6], fill=(12, 12, 14))
    n = len(left); h = (y1 - y0) / n
    for i, l in enumerate(left): key(d, 22, y0 + i * h + 8, x0 - 22, y0 + (i + 1) * h - 8, l, font=FS)
    n = len(right); h = (y1 - y0) / n
    for i, l in enumerate(right): key(d, x1 + 22, y0 + i * h + 8, W - 22, y0 + (i + 1) * h - 8, l, font=FS)
    for (cx, cy, r, l) in knobs: knob(d, cx, cy, r, l)
    im.save(os.path.join(out, name))

# PFD plate 0.326 x 0.256 m -> 1304 x 1024 px, screen 212..1092 x 182..842 ; u=0 is the pilot's left
bezel(1304, 1024, (212, 182, 1092, 842), ['PFD MENU', 'REFS', 'NAV', 'FRMT', 'TFC'], ['ESC', 'ET', 'TERR WX', 'BRG', 'MKR'],
      [(150, 930, 60, 'MENU/DATA'), (1154, 930, 60, 'RANGE')], 'pfd_bezel.png')
# MFD plate 0.30 x 0.35 m -> 1200 x 1400 px, screen 160..1040 x 150..810
bezel(1200, 1400, (160, 150, 1040, 810), ['UPR MENU', 'LWR MENU', 'ENG', 'SYS', 'CKLST'], ['CAS', 'CHART', 'NAV DATA', 'TFC', 'TERR WX'],
      [(330, 850, 34, ''), (600, 850, 34, ''), (870, 850, 34, '')], 'mfd_bezel.png')
print('mock-ups written to', out)
