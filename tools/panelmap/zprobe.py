"""Front-most surface z (looking along +z) at sample points of the panel, ignoring hidden nodes and anything nearer than z=9.0.
Usage: python zprobe.py <hide.json> x y0 y1 step"""
import json, sys
import numpy as np
dump = 'C:/Projetos/f27-g1000/tools/panelmap/out/interior'
meta = json.load(open(dump + '.json')); blob = open(dump + '.bin', 'rb').read()
nf = meta['vertexFloats']
V = np.frombuffer(blob, dtype=np.float32, count=nf).reshape(-1, 3)
I = np.frombuffer(blob, dtype=np.uint32, count=meta['indexCount'], offset=nf * 4)
hide = set(json.load(open(sys.argv[1]))['all'])
x = float(sys.argv[2]); y0, y1, st = (float(a) for a in sys.argv[3:6])
tris = []; names = []
for p in meta['prims']:
    if p['material'] in ('Collision', 'Occluder') or p['name'] in hide: continue
    v = V[p['vOffset']:p['vOffset'] + p['vCount']]; t = I[p['iOffset']:p['iOffset'] + p['iCount']].reshape(-1, 3)
    P = v[t]
    m = (P[:, :, 0].min(1) <= x) & (P[:, :, 0].max(1) >= x) & (P[:, :, 2].min(1) > 9.0) & (P[:, :, 2].max(1) < 9.4)
    for tr in P[m]: tris.append(tr); names.append(p['name'])
tris = np.array(tris)
for y in np.arange(y0, y1 + 1e-9, st):
    best = (9e9, '')
    for tr, nm in zip(tris, names):
        a, b, c = tr[:, :2]
        d = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
        if abs(d) < 1e-12: continue
        l1 = ((b[1]-c[1])*(x-c[0]) + (c[0]-b[0])*(y-c[1])) / d
        l2 = ((c[1]-a[1])*(x-c[0]) + (a[0]-c[0])*(y-c[1])) / d
        l3 = 1 - l1 - l2
        if min(l1, l2, l3) < -1e-6: continue
        z = l1*tr[0, 2] + l2*tr[1, 2] + l3*tr[2, 2]
        if z < best[0]: best = (z, nm)
    print(f'y={y:.3f}  z={best[0]:.4f}  {best[1]}')
