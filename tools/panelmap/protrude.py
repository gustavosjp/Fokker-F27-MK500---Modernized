"""Lists visible (not hidden, not helper) primitives inside each plate rectangle whose front is nearer to the pilot than the plate,
i.e. things that would poke through a plate placed at <plateZ>. Usage: python protrude.py <wt21-layout.json> <hide.json> <plateZ>"""
import json, sys
import numpy as np
dump = 'C:/Projetos/f27-g1000/tools/panelmap/out/interior'
meta = json.load(open(dump + '.json')); blob = open(dump + '.bin', 'rb').read()
nf = meta['vertexFloats']
V = np.frombuffer(blob, dtype=np.float32, count=nf).reshape(-1, 3)
I = np.frombuffer(blob, dtype=np.uint32, count=meta['indexCount'], offset=nf * 4)
L = json.load(open(sys.argv[1])); hide = set(json.load(open(sys.argv[2]))['all']); pz = float(sys.argv[3])
skip = {'Collision', 'Occluder'}
for u in L['units']:
    if u['id'] == 'FMC1': continue
    cx, cy = u['plate']['center']; w, h = u['plate']['size']
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    hits = {}
    for p in meta['prims']:
        if p['material'] in skip or p['name'] in hide: continue
        v = V[p['vOffset']:p['vOffset'] + p['vCount']]; t = I[p['iOffset']:p['iOffset'] + p['iCount']].reshape(-1, 3)
        P = v[t]
        inside = (P[:, :, 0].max(1) > x0) & (P[:, :, 0].min(1) < x1) & (P[:, :, 1].max(1) > y0) & (P[:, :, 1].min(1) < y1)
        front = (P[:, :, 2].min(1) < pz) & (P[:, :, 2].max(1) > 9.10)
        m = inside & front
        if m.any():
            zz = P[m][:, :, 2].min()
            hits[p['name']] = min(hits.get(p['name'], 9e9), zz)
    print('==', u['id'], 'plate x %.3f..%.3f y %.3f..%.3f' % (x0, x1, y0, y1))
    for n, z in sorted(hits.items(), key=lambda kv: kv[1]): print('   %-30s front z %.4f' % (n, z))
