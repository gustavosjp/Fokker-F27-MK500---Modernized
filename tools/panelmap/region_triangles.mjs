// Which dumped primitives have triangles inside a world box: per primitive, triangles fully inside, triangles crossing the box
// border, and the bounding box of the inside ones. Used to plan copying a piece of the author's panel art elsewhere.
// Usage: node region_triangles.mjs <dump prefix> x0 x1 y0 y1 z0 z1
import { readFileSync } from 'node:fs';

const [, , prefix, ...box] = process.argv;
const [x0, x1, y0, y1, z0, z1] = box.map(Number);
const meta = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const blob = readFileSync(`${prefix}.bin`);
const v = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const idx = new Uint32Array(blob.buffer, blob.byteOffset + meta.vertexFloats * 4, meta.indexCount);
const inside = (k) => v[k * 3] >= x0 && v[k * 3] <= x1 && v[k * 3 + 1] >= y0 && v[k * 3 + 1] <= y1 && v[k * 3 + 2] >= z0 && v[k * 3 + 2] <= z1;
for (const p of meta.prims) {
  let full = 0, cross = 0;
  const bb = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let t = p.iOffset; t < p.iOffset + p.iCount; t += 3) {
    const ks = [0, 1, 2].map((d) => p.vOffset + idx[t + d]);
    const n = ks.filter(inside).length;
    if (n === 3) {
      full++;
      for (const k of ks) for (let a = 0; a < 3; a++) { bb[2 * a] = Math.min(bb[2 * a], v[k * 3 + a]); bb[2 * a + 1] = Math.max(bb[2 * a + 1], v[k * 3 + a]); }
    } else if (n > 0) cross++;
  }
  if (full || cross) {
    const f = (i) => `${bb[i].toFixed(3)}..${bb[i + 1].toFixed(3)}`;
    console.log(`${(p.name || '').padEnd(26)} ${String(p.material).padEnd(26)} inside ${String(full).padStart(4)}  crossing ${String(cross).padStart(3)}  ${full ? `x ${f(0)} y ${f(2)} z ${f(4)}` : ''}`);
  }
}
