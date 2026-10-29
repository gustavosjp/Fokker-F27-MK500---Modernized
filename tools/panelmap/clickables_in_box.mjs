// Lists the author's mouse-interactive parts (per the XML actually included by the WT21 model) whose dumped geometry overlaps a
// world box, telling apart hidden ones. Usage: node clickables_in_box.mjs <dump prefix> <base xml> <wt21 xml> x0 x1 y0 y1 z0 z1
import { readFileSync } from 'node:fs';

const [, , prefix, baseXmlPath, wtXmlPath, ...box] = process.argv;
const [x0, x1, y0, y1, z0, z1] = box.map(Number);
const meta = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
const blob = readFileSync(`${prefix}.bin`);
const v = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const xml = readFileSync(baseXmlPath, 'utf8');
const interactive = new Map();
for (const m of xml.matchAll(/<Component\b([^>]*)>([\s\S]*?)<\/Component>/g)) {
  const tpl = [...m[2].matchAll(/UseTemplate Name="([^"]+)"/g)].map((t) => t[1]);
  if (!tpl.some((t) => /^(BGT_(Knob|Switch|Btn|Button|Push|Lever|Selector)|ASOBO_GT_(Interaction|Push|Switch|Knob|Lever))/i.test(t))) continue;
  const n = /Node="([^"]+)"/.exec(m[1]);
  if (n) interactive.set(n[1], tpl.join('+'));
}
const hidden = new Set([...readFileSync(wtXmlPath, 'utf8').matchAll(/<Component ID="F27WT21Hide[^"]*" Node="([^"]+)"/g)].map((m) => m[1]));
const rows = [];
for (const p of meta.prims) {
  if (!interactive.has(p.name)) continue;
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let k = p.vOffset; k < p.vOffset + p.vCount; k++) {
    const x = v[k * 3], y = v[k * 3 + 1], z = v[k * 3 + 2];
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z);
  }
  if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1 || bz1 < z0 || bz0 > z1) continue;
  rows.push(`${p.name.padEnd(30)} ${hidden.has(p.name) ? 'hidden ' : 'VISIBLE'} x ${bx0.toFixed(3)}..${bx1.toFixed(3)} y ${by0.toFixed(3)}..${by1.toFixed(3)} z ${bz0.toFixed(3)}..${bz1.toFixed(3)}  ${interactive.get(p.name)}`);
}
console.log(rows.length ? rows.join('\n') : 'no interactive author part in the box');
