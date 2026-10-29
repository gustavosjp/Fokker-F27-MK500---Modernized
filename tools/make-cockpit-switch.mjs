// v10.9 (user: "ter opção de escolha Classic vs Modernized dentro do Tablet"): makes the WT21 interior switchable between the author's
// cockpit (Classic) and ours (Modernized) by L:F27_COCKPIT_CLASSIC, which the tablet's Settings page sets.
// * Hidden nodes still take mouse clicks in the sim (test 8), so the side not in use is carried 25 m below the cockpit and shrunk to a
//   thousandth: carrier nodes with a 2-key translation + scale animation (frame 0 = Modernized, frame 100 = Classic; scaffold.ps1 plays
//   them with "(L:F27_COCKPIT_CLASSIC, Bool) 100 *"). No visibility code on a carrier: in the sim a parent's visibility overrides its
//   children's (test 15, v10.9: shown in Modernized, the carrier showed every autopilot key lamp under it, lit or not).
//   - the author's parts the WT21 cockpit replaces (the hide list): the tops of that set go under one carrier per parent (a root carrier
//     for the scene roots, one inserted under each other parent), in place in Classic and away in Modernized;
//   - our parts (every node the WT21 build added, but the tablet's, which stays in both): under a root carrier, away in Classic;
//   - the WT21's moved groups ("move" in wt21-layout.json: the AP servo switches, and since v10.9 the captain's instruments placed
//     around the screens, scaled): their carrier gets an animation from its move and scale (Modernized) back to where the author put
//     them, full size (Classic).
// * A carrier only inserts a node between a part and its parent, so the parts' own animations (needles, keys, knobs) keep working. Rest
//   poses are the Modernized ones (frame 0), so the offline checks of the WT21 cockpit keep seeing it as before.
// Usage: node make-cockpit-switch.mjs <wt21 interior gltf (rewritten in place, with its .bin)> <hide json> <out carriers json>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , gltfPath, hidePath, outPath] = process.argv;
if (!outPath) { console.error('usage: node make-cockpit-switch.mjs <wt21 interior gltf> <hide json> <out carriers json>'); process.exit(2); }
const g = JSON.parse(readFileSync(gltfPath, 'utf8'));
const binPath = join(dirname(gltfPath), g.buffers[0].uri);
const chunks = [readFileSync(binPath)];
let length = chunks[0].length;
/** Appends float data (4-byte aligned) as a new buffer view; returns its index. */
function floatView(values) {
  const pad = (4 - (length % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buf.length });
  chunks.push(buf); length += buf.length;
  return g.bufferViews.length - 1;
}
const KEYS = [0, 100 / 24];   // frame 0 (Modernized) and frame 100 (Classic)
/** A 2-key animation named like its node: translation `t0` at frame 0, `t1` at frame 100; with `s0`/`s1`, uniform scale too. */
function translationAnim(node, t0, t1, s0 = 1, s1 = 1) {
  g.accessors.push({ bufferView: floatView(KEYS), byteOffset: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [KEYS[0]], max: [KEYS[1]] });
  const input = g.accessors.length - 1;
  const channels = [], samplers = [];
  const channel = (path, values) => {
    g.accessors.push({ bufferView: floatView(values), byteOffset: 0, componentType: 5126, count: 2, type: 'VEC3' });
    channels.push({ sampler: samplers.length, target: { node, path } });
    samplers.push({ input, output: g.accessors.length - 1, interpolation: 'LINEAR' });
  };
  channel('translation', [...t0, ...t1]);
  if (s0 !== 1 || s1 !== 1) channel('scale', [s0, s0, s0, s1, s1, s1]);
  (g.animations ||= []).push({ name: g.nodes[node].name, channels, samplers });
}
const parentOf = new Map();
g.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const roots = g.scenes[0].nodes;
/** A new carrier holding `kids` (all of the same parent: `parent`, or the scene roots when null), in their place. */
function carrier(name, kids, parent) {
  const idx = g.nodes.length;
  g.nodes.push({ name, children: kids.slice(), extensions: { ASOBO_unique_id: { id: name } } });
  if (parent === null) {
    for (const k of kids) roots.splice(roots.indexOf(k), 1);
    roots.push(idx);
  } else {
    const p = g.nodes[parent];
    p.children = p.children.filter((c) => !kids.includes(c)).concat([idx]);
  }
  for (const k of kids) parentOf.set(k, idx);
  parentOf.set(idx, parent ?? undefined);
  return idx;
}
// far below the cockpit floor and shrunk to a speck: out of sight and out of the mouse's reach
const AWAY = [0, -25, 0];
const TINY = 0.001;
/** A node's rotation and scale up to the scene root, as a 3 x 3 matrix (rows). */
function worldLinear(i) {
  let m = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let p = i; p !== undefined; p = parentOf.get(p)) {
    const n = g.nodes[p], [x, y, z, w] = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]].map((row) => row.map((v, c) => v * s[c]));
    m = r.map((row) => [0, 1, 2].map((c) => row[0] * m[0][c] + row[1] * m[1][c] + row[2] * m[2][c]));
  }
  return m;
}
/** AWAY in the frame of the node `parent` (null: the scene). */
function awayIn(parent) {
  if (parent === null) return AWAY.slice();
  const [[a, b, c], [d, e, f], [gg, h, k]] = worldLinear(parent);
  const det = a * (e * k - f * h) - b * (d * k - f * gg) + c * (d * h - e * gg);
  const inv = [[e * k - f * h, c * h - b * k, b * f - c * e], [f * gg - d * k, a * k - c * gg, c * d - a * f], [d * h - e * gg, b * gg - a * h, a * e - b * d]];
  return inv.map((row) => (row[0] * AWAY[0] + row[1] * AWAY[1] + row[2] * AWAY[2]) / det);
}
const out = { classic: [], modern: [], moved: [] };

// the author's parts the WT21 cockpit replaces: in place in Classic (frame 100), away in Modernized (frame 0)
const hidden = new Set(JSON.parse(readFileSync(hidePath, 'utf8')).all.map((name) => {
  const i = g.nodes.findIndex((n) => n.name === name);
  if (i < 0) throw new Error(`hidden node ${name} not in ${gltfPath}`);
  return i;
}));
const tops = [...hidden].filter((i) => !(parentOf.has(i) && hidden.has(parentOf.get(i))));
const byParent = new Map();
for (const i of tops) {
  const p = parentOf.has(i) ? parentOf.get(i) : null;
  if (!byParent.has(p)) byParent.set(p, []);
  byParent.get(p).push(i);
}
let k = 0;
for (const [p, kids] of byParent) {
  const name = p === null ? 'F27SW_classic' : `F27SW_classic_${++k}`;
  const away = awayIn(p);
  const c = carrier(name, kids, p);
  g.nodes[c].translation = away;
  g.nodes[c].scale = [TINY, TINY, TINY];
  translationAnim(c, away, [0, 0, 0], TINY, 1);
  out.classic.push(name);
}

// our parts (but the tablet): in place in Modernized, away in Classic
const authorCount = JSON.parse(readFileSync(gltfPath.replace(/_wt21\.gltf$/i, '.gltf'), 'utf8')).nodes.length;
const ours = (n) => /^(WT21_|F27WT21_|F27_WT21_)/.test(n.name || '');
const tablet = (n) => /^(WT21_TAB1|F27WT21_TAB1|F27_WT21_TAB1)/.test(n.name || '');
const movers = new Set(g.nodes.map((n, i) => [n, i]).filter(([n]) => /^F27_WT21_move_[^_]+(_[^_]+)*$/.test(n.name || '') && !/_box_/.test(n.name || '') && n.children && n.children.some((c) => c < authorCount)).map(([, i]) => i));
const modernKids = roots.filter((i) => i >= authorCount && ours(g.nodes[i]) && !tablet(g.nodes[i]) && !movers.has(i));
const mc = carrier('F27SW_modern', modernKids, null);
translationAnim(mc, [0, 0, 0], AWAY, 1, TINY);
out.modern.push('F27SW_modern');

// the moved author groups: their move in Modernized, back home (and full size: v10.9's instruments are scaled) in Classic
for (const i of movers) {
  const n = g.nodes[i], s = n.scale || [1, 1, 1];
  if (s.some((v) => Math.abs(v - s[0]) > 1e-6)) throw new Error(`${n.name}: only a uniform scale is animated`);
  translationAnim(i, n.translation || [0, 0, 0], [0, 0, 0], s[0], 1);
  out.moved.push(n.name);
}

g.buffers[0].byteLength = length;
writeFileSync(binPath, Buffer.concat(chunks));
writeFileSync(gltfPath, JSON.stringify(g));
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`cockpit switch: ${tops.length} of the author's parts under ${out.classic.length} carrier(s), ${modernKids.length} of ours under F27SW_modern, ` +
  `${out.moved.length} moved group(s) animated back home; the tablet stays`);
