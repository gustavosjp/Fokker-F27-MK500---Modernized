// Combined world bounding box of the dumped primitives whose node names start with any of the given prefixes, plus one box per prefix.
// Usage: node bbox_of.mjs <dump prefix> prefix1 prefix2 ...
import { readFileSync } from 'node:fs';

const [, , dump, ...prefixes] = process.argv;
const meta = JSON.parse(readFileSync(`${dump}.json`, 'utf8'));
const blob = readFileSync(`${dump}.bin`);
const v = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const all = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
for (const pre of prefixes) {
  const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const p of meta.prims) {
    if (!(p.name || '').startsWith(pre)) continue;
    for (let k = p.vOffset; k < p.vOffset + p.vCount; k++) for (let a = 0; a < 3; a++) {
      const q = v[k * 3 + a];
      b[2 * a] = Math.min(b[2 * a], q); b[2 * a + 1] = Math.max(b[2 * a + 1], q);
      all[2 * a] = Math.min(all[2 * a], q); all[2 * a + 1] = Math.max(all[2 * a + 1], q);
    }
  }
  const f = (bb, i) => `${bb[i].toFixed(3)}..${bb[i + 1].toFixed(3)}`;
  console.log(`${pre.padEnd(22)} x ${f(b, 0)}  y ${f(b, 2)}  z ${f(b, 4)}`);
}
const f = (i) => `${all[i].toFixed(3)}..${all[i + 1].toFixed(3)}`;
console.log(`ALL                    x ${f(0)}  y ${f(2)}  z ${f(4)}`);
