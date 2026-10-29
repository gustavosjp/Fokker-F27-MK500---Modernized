// Key press animations of the WT21 glTF (v10): for every animation named WT21_*_key_*, its 2-key translation must start at the cap
// node's own translation and end 0.8..1.6 mm away along the node's local +z (into its panel, turned with a mounted unit).
// Prints JSON: { keys: n, bad: [names], travelMm: [min, max] }.
// Usage: node check-key-press.mjs <gltf>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , path] = process.argv;
const g = JSON.parse(readFileSync(path, 'utf8'));
const bin = readFileSync(join(dirname(path), g.buffers[0].uri));
const floats = (ai) => {
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], n = a.count * { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: n }, (_, k) => bin.readFloatLE(base + 4 * k));
};
const qRotate = (q, v) => {   // v' = q v q*
  const [x, y, z, w] = q, [a, b, c] = v;
  const ix = w * a + y * c - z * b, iy = w * b + z * a - x * c, iz = w * c + x * b - y * a, iw = -x * a - y * b - z * c;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
const bad = [];
let keys = 0, lo = Infinity, hi = -Infinity;
for (const an of g.animations || []) {
  if (!/^WT21_.+_key_/.test(an.name)) continue;
  keys++;
  const ch = an.channels[0], s = an.samplers[ch.sampler], node = g.nodes[ch.target.node];
  const t = floats(s.input), p = floats(s.output);
  const rest = p.slice(0, 3), pressed = p.slice(3, 6), d = pressed.map((v, k) => v - rest[k]), len = Math.hypot(...d);
  const axis = qRotate(node.rotation || [0, 0, 0, 1], [0, 0, 1]);
  const along = len > 0 ? (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / len : 0;
  lo = Math.min(lo, len * 1000); hi = Math.max(hi, len * 1000);
  const ok = an.channels.length === 1 && ch.target.path === 'translation' && node.name === an.name && t.length === 2 && t[0] === 0 &&
    Math.abs(t[1] - 100 / 24) < 1e-5 && rest.every((v, k) => Math.abs(v - node.translation[k]) < 1e-6) && len >= 0.0008 && len <= 0.0016 && along > 0.9999;
  if (!ok) bad.push(an.name);
}
console.log(JSON.stringify({ keys, bad, travelMm: [+lo.toFixed(2), +hi.toFixed(2)] }));
