// Lists the dumped primitives whose bounding box overlaps a world-space box (glTF space: +x = aircraft left, y up, z forward).
// Usage: node list_region.mjs <dump prefix> x0 x1 y0 y1 z0 z1 [name regex]
import { readFileSync } from 'node:fs';

const [, , prefix, ...rest] = process.argv;
const [x0, x1, y0, y1, z0, z1] = rest.slice(0, 6).map(Number);
const re = new RegExp(rest[6] || '.');
const meta = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const blob = readFileSync(`${prefix}.bin`);
const v = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const rows = [];
for (const p of meta.prims) {
  if (!re.test(p.name || '')) continue;
  const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let k = p.vOffset; k < p.vOffset + p.vCount; k++) {
    for (let a = 0; a < 3; a++) { const q = v[k * 3 + a]; if (q < b[2 * a]) b[2 * a] = q; if (q > b[2 * a + 1]) b[2 * a + 1] = q; }
  }
  if (b[1] < x0 || b[0] > x1 || b[3] < y0 || b[2] > y1 || b[5] < z0 || b[4] > z1) continue;
  rows.push({ name: p.name, mat: p.material, b, tris: p.iCount / 3 });
}
rows.sort((a, b) => a.b[4] - b.b[4]);
for (const r of rows) {
  const f = (i) => `${r.b[i].toFixed(3)}..${r.b[i + 1].toFixed(3)}`;
  console.log(`${(r.name || '').padEnd(34)} x ${f(0).padEnd(14)} y ${f(2).padEnd(14)} z ${f(4).padEnd(14)} ${String(r.tris).padStart(6)} tris  ${r.mat}`);
}
console.log(`${rows.length} primitives`);
