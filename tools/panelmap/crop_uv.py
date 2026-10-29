"""Crops a texture (PNG converted from the author's DDS) to a UV rectangle and enlarges it, to see a panel's art.
Usage: python crop_uv.py <png> u0 v0 u1 v1 <out png> [scale]
"""
import sys

from PIL import Image

png, u0, v0, u1, v1, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
k = int(sys.argv[7]) if len(sys.argv) > 7 else 3
im = Image.open(png).convert('RGB')
W, H = im.size
box = (int(min(u0, u1) * W), int(min(v0, v1) * H), int(max(u0, u1) * W), int(max(v0, v1) * H))
c = im.crop(box)
c.resize((c.width * k, c.height * k), Image.LANCZOS).save(out)
print(f'{png}: {W}x{H}, crop {box} -> {out}')
