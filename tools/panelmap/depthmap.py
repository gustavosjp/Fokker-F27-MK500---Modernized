"""Straight-on depth map of the main panel (z colour-coded) to find the recessed instrument pockets the visibility hiding leaves behind.
Usage: python depthmap.py <out.png> [x0 x1 y0 y1]   (world x/y in metres; image X is -x so the captain is on the left)"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

dump = 'C:/Projetos/f27-g1000/tools/panelmap/out/interior'
meta = json.load(open(dump + '.json'))
blob = open(dump + '.bin', 'rb').read()
nf = meta['vertexFloats']
V = np.frombuffer(blob, dtype=np.float32, count=nf).reshape(-1, 3)
I = np.frombuffer(blob, dtype=np.uint32, count=meta['indexCount'], offset=nf * 4)
out = sys.argv[1]
x0, x1, y0, y1 = (float(a) for a in sys.argv[2:6]) if len(sys.argv) >= 6 else (-0.85, 0.85, 0.08, 0.70)
S = 1000  # px per metre
W, H = int((x1 - x0) * S), int((y1 - y0) * S)
tris = []
for p in meta['prims']:
    if p['material'] in ('Collision', 'Occluder'):
        continue
    v = V[p['vOffset']:p['vOffset'] + p['vCount']]
    t = I[p['iOffset']:p['iOffset'] + p['iCount']].reshape(-1, 3)
    P = v[t]  # (n,3,3)
    zmin = P[:, :, 2].min(axis=1)
    zmax = P[:, :, 2].max(axis=1)
    inx = (P[:, :, 0].max(axis=1) > x0) & (P[:, :, 0].min(axis=1) < x1) & (P[:, :, 1].max(axis=1) > y0) & (P[:, :, 1].min(axis=1) < y1)
    keep = inx & (zmin > 9.00) & (zmax < 9.40)
    for tri in P[keep]:
        tris.append(tri)
print('triangles', len(tris))
tris.sort(key=lambda tr: -tr[:, 2].mean())   # far first
img = Image.new('RGB', (W, H), (255, 0, 255))
d = ImageDraw.Draw(img)
def col(z):
    # 9.00 (near, bright) .. 9.25 (far, dark)
    t = min(max((z - 9.150) / 0.065, 0), 1)
    g = int(255 * (1 - t))
    return (g, g, 255 - int(120 * t))
for tr in tris:
    pts = [((x0 - 0 - (-x)) * 0 + (x1 - (x)) * S, (y1 - y) * S) for x, y, z in tr]  # image X grows with -x ... mirrored: x=x1 at left
    d.polygon(pts, fill=col(tr[:, 2].mean()))
img.save(out)
print('saved', out, img.size)
