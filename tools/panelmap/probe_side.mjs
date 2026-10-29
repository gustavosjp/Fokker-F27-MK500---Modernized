// Side-face probe: for each (y, z) point, the outermost (largest x, below xMax) dumped triangle covering it, and its node name.
// Usage: node probe_side.mjs <dump prefix> xMax "y,z" ... [--skip regex]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prefix = args.shift();
const xMax = Number(args.shift());
let skip = /^$/;
const si = args.indexOf('--skip');
if (si >= 0) { skip = new RegExp(args[si + 1]); args.splice(si, 2); }
const pts = args.map((s) => s.split(',').map(Number));
const meta = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const blob = readFileSync(`${prefix}.bin`);
const v = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const idx = new Uint32Array(blob.buffer, blob.byteOffset + meta.vertexFloats * 4, meta.indexCount);
const best = pts.map(() => ({ x: -Infinity, name: '' }));
for (const p of meta.prims) {
  if (['Collision', 'Occluder'].includes(p.material) || skip.test(p.name || '')) continue;
  for (let t = p.iOffset; t < p.iOffset + p.iCount; t += 3) {
    const a = (p.vOffset + idx[t]) * 3, b = (p.vOffset + idx[t + 1]) * 3, c = (p.vOffset + idx[t + 2]) * 3;
    const ay = v[a + 1], az = v[a + 2], by = v[b + 1], bz = v[b + 2], cy = v[c + 1], cz = v[c + 2];
    const det = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    pts.forEach(([y, z], k) => {
      const l1 = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / det, l2 = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) return;
      const x = l1 * v[a] + l2 * v[b] + l3 * v[c];
      if (x < xMax && x > best[k].x) best[k] = { x, name: p.name };
    });
  }
}
pts.forEach(([y, z], k) => console.log(`y ${y.toFixed(3)} z ${z.toFixed(3)}: x ${best[k].x.toFixed(4)}  ${best[k].name}`));
