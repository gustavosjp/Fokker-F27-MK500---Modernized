// Lists the author's parts inside each WT21 control area (FCP, DCPs, MFD keys) with their depth, whether they are hidden and whether
// the author's XML gives them a mouse interaction, so we can tell which old knobs/switches can still take clicks meant for our keys.
// The sim picks the nearest mouse-interactive mesh along the ray; our covers (WT21_*_hw) have no interaction and block nothing.
//
// Usage: node find_occluders.mjs <dump prefix> <wt21-layout.json> <author interior xml> <wt21 interior xml>
import { readFileSync } from 'node:fs';

const [, , dumpPrefix, layoutPath, authorXmlPath, wtXmlPath] = process.argv;
const meta = JSON.parse(readFileSync(`${dumpPrefix}.json`, 'utf8'));
const blob = readFileSync(`${dumpPrefix}.bin`);
const verts = new Float32Array(blob.buffer, blob.byteOffset, meta.vertexFloats);
const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
const authorXml = readFileSync(authorXmlPath, 'utf8');
const wtXml = readFileSync(wtXmlPath, 'utf8');

// nodes the author's XML makes interactive: a Component whose body uses an Interaction / mouse template, keyed by Node= or <NODE_ID>
const interactive = new Map();
for (const m of authorXml.matchAll(/<Component\b([^>]*)>([\s\S]*?)<\/Component>/g)) {
  const body = m[2];
  if (!/Interaction|MOUSE|_Switch_|_Knob_|Push_Button|Lever|Toggle/i.test(body)) continue;
  const nodes = new Set();
  const n1 = /Node="([^"]+)"/.exec(m[1]); if (n1) nodes.add(n1[1]);
  for (const k of body.matchAll(/<(?:NODE_ID|ANIM_NODE_ID|NODE_ID_[A-Z0-9_]+)>([^<]+)</g)) nodes.add(k[1].trim());
  const tpl = [...body.matchAll(/UseTemplate Name="([^"]+)"/g)].map((t) => t[1]).slice(0, 2).join('+');
  for (const n of nodes) if (!interactive.has(n)) interactive.set(n, tpl);
}
const hidden = new Set([...wtXml.matchAll(/<Component ID="F27WT21Hide[^"]*" Node="([^"]+)"/g)].map((m) => m[1]));
// hidden subtrees: a hidden node hides its children too; the dump has no hierarchy, so match by the hide list itself (expand-hide.mjs closes it)

const areas = [];
for (const p of layout.panels || []) areas.push({ id: p.id, cx: p.center[0], cy: p.center[1], w: p.size[0], h: p.size[1], zFront: p.z });
for (const u of layout.units) if (u.controls) areas.push({ id: u.id, cx: u.plate.center[0], cy: u.plate.center[1], w: u.plate.size[0], h: u.plate.size[1], zFront: u.plateZ ?? layout.plateZ });

for (const a of areas) {
  const x0 = a.cx - a.w / 2, x1 = a.cx + a.w / 2, y0 = a.cy - a.h / 2, y1 = a.cy + a.h / 2;
  const rows = [];
  for (const p of meta.prims) {
    const name = p.name || '';
    if (/^(WT21_|F27WT21_|F27_WT21_)/.test(name)) continue;
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (let k = p.vOffset; k < p.vOffset + p.vCount; k++) {
      const x = verts[k * 3], y = verts[k * 3 + 1], z = verts[k * 3 + 2];
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
    }
    const ox = Math.min(x1, bx1) - Math.max(x0, bx0), oy = Math.min(y1, by1) - Math.max(y0, by0);
    if (ox <= 0 || oy <= 0) continue;
    if (bz0 > 9.3 || bz1 < 8.9) continue;
    const inter = interactive.get(name);
    if (!inter && p.material !== 'Collision') continue;   // only what can take a click
    rows.push({ name, mat: p.material, zFront: bz0, inFront: bz0 < a.zFront, hidden: hidden.has(name), inter: inter || '(collision mesh)', x: [bx0, bx1].map((v) => v.toFixed(3)).join('..'), y: [by0, by1].map((v) => v.toFixed(3)).join('..') });
  }
  console.log(`\n== ${a.id}: x ${x0.toFixed(3)}..${x1.toFixed(3)}  y ${y0.toFixed(3)}..${y1.toFixed(3)}  module front z ${a.zFront}`);
  rows.sort((r, s) => r.zFront - s.zFront);
  for (const r of rows) console.log(`  ${r.name.padEnd(34)} z ${r.zFront.toFixed(4)} ${r.inFront ? 'IN FRONT' : 'behind  '} ${r.hidden ? 'hidden ' : 'visible'}  x ${r.x}  y ${r.y}  ${r.inter}`);
}
