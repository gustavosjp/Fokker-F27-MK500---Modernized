// Surface height probe: for each (x, z) point, the highest dumped triangle under y = yMax that covers it, and its node name.
// Usage: node probe_height.mjs <dump prefix> yMax "x,z" "x,z" ... [--skip regex]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prefix = args.shift();
const yMax = Number(args.shift());
let skip = /^$/;
const si = args.indexOf('--skip');
if (si >= 0) { skip = new RegExp(args[si + 1]); args.splice(si, 2); }
const pts = args.map((s) => s.split(',').map(Number));
const meta = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const blob = readFileSync(`${prefix}.bin`);
const v = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const idx = new Uint32Array(blob.buffer, blob.byteOffset + meta.vertexFloats * 4, meta.indexCount);
const best = pts.map(() => ({ y: -Infinity, name: '' }));
for (const p of meta.prims) {
  if (['Collision', 'Occluder'].includes(p.material) || skip.test(p.name || '')) continue;
  for (let t = p.iOffset; t < p.iOffset + p.iCount; t += 3) {
    const a = (p.vOffset + idx[t]) * 3, b = (p.vOffset + idx[t + 1]) * 3, c = (p.vOffset + idx[t + 2]) * 3;
    const ax = v[a], az = v[a + 2], bx = v[b], bz = v[b + 2], cx = v[c], cz = v[c + 2];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    pts.forEach(([x, z], k) => {
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) return;
      const y = l1 * v[a + 1] + l2 * v[b + 1] + l3 * v[c + 1];
      if (y < yMax && y > best[k].y) best[k] = { y, name: p.name };
    });
  }
}
pts.forEach(([x, z], k) => console.log(`x ${x.toFixed(3)} z ${z.toFixed(3)}: y ${best[k].y.toFixed(4)}  ${best[k].name}`));
