// Inventory of the F27 interior glTF: world-ish position and size of every node that carries a mesh near the instrument panel plane.
// World position = sum of ancestor translations (ancestor rotation/scale ignored: the panel nodes here only use translation/scale).
// Usage: node inventory.mjs <interior.gltf> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
const [, , gltfPath, outPath] = process.argv;
const bin = readFileSync(gltfPath.replace(/\.gltf$/i, '.bin'));
const j = JSON.parse(readFileSync(gltfPath, 'utf8'));
const parent = new Map();
j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
function world(i) { // translation and uniform-ish scale accumulated up the chain
  let t = [0, 0, 0], s = [1, 1, 1], cur = i;
  const chain = [];
  while (cur !== undefined) { chain.push(cur); cur = parent.get(cur); }
  chain.reverse();
  let pos = [0, 0, 0], sc = [1, 1, 1];
  for (const k of chain) {
    const n = j.nodes[k];
    const ts = n.translation || [0, 0, 0], ss = n.scale || [1, 1, 1];
    pos = [pos[0] + ts[0] * sc[0], pos[1] + ts[1] * sc[1], pos[2] + ts[2] * sc[2]];
    sc = [sc[0] * ss[0], sc[1] * ss[1], sc[2] * ss[2]];
  }
  return { pos, sc };
}
function meshBounds(mi) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of j.meshes[mi].primitives) {
    const a = j.accessors[p.attributes.POSITION];
    if (!a.min || !a.max) continue;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a.min[k]); mx[k] = Math.max(mx[k], a.max[k]); }
  }
  return isFinite(mn[0]) ? { mn, mx } : null;
}
const rows = [];
j.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  const b = meshBounds(n.mesh); if (!b) return;
  const { pos, sc } = world(i);
  const c = [(b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2, (b.mn[2] + b.mx[2]) / 2];
  const half = [(b.mx[0] - b.mn[0]) / 2 * Math.abs(sc[0]), (b.mx[1] - b.mn[1]) / 2 * Math.abs(sc[1]), (b.mx[2] - b.mn[2]) / 2 * Math.abs(sc[2])];
  const center = [pos[0] + c[0] * sc[0], pos[1] + c[1] * sc[1], pos[2] + c[2] * sc[2]];
  rows.push({ i, name: n.name, material: j.materials[j.meshes[n.mesh].primitives[0].material]?.name, center, half });
});
if (outPath) writeFileSync(outPath, JSON.stringify(rows));
console.log('nodes with mesh:', rows.length, '| extensionsRequired:', JSON.stringify(j.extensionsRequired));
// panel region
const panel = rows.filter((r) => r.center[2] > 8.9 && r.center[2] < 9.45 && Math.abs(r.center[0]) < 1.0 && r.center[1] > 0.0 && r.center[1] < 1.1);
console.log('nodes in the panel region:', panel.length);
// group by name prefix: x0_<GROUP>_<index> or first two tokens
const groups = new Map();
for (const r of panel) {
  const parts = r.name.split('_');
  const key = (parts[0] === 'x0' ? parts.slice(0, 3) : parts.slice(0, 2)).join('_');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const out = [];
for (const [k, arr] of groups) {
  const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  for (const r of arr) { mn[0] = Math.min(mn[0], r.center[0] - r.half[0]); mx[0] = Math.max(mx[0], r.center[0] + r.half[0]); mn[1] = Math.min(mn[1], r.center[1] - r.half[1]); mx[1] = Math.max(mx[1], r.center[1] + r.half[1]); }
  out.push({ group: k, n: arr.length, x: [+mn[0].toFixed(3), +mx[0].toFixed(3)], y: [+mn[1].toFixed(3), +mx[1].toFixed(3)], w: +(mx[0] - mn[0]).toFixed(3), h: +(mx[1] - mn[1]).toFixed(3), z: +(arr.reduce((s, r) => s + r.center[2], 0) / arr.length).toFixed(3) });
}
out.sort((a, b) => b.x[0] - a.x[0] || b.y[0] - a.y[0]);
for (const g of out) console.log(g.group.padEnd(26), 'n=' + String(g.n).padStart(3), ' x', g.x.join('..').padEnd(15), ' y', g.y.join('..').padEnd(13), ' size', g.w + 'x' + g.h, ' z', g.z);
