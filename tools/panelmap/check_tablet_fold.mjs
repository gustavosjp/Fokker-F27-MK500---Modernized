// v10.3: the tablet's fold, pose by pose. Plays the swing and joint rotation animations of a tablet unit (slerp, as the sim does
// between the two keys) and checks that every corner of the tablet body stays inboard of the side wall by a margin. The wall is the
// probed surface at y 0.45..0.55 (tools\panelmap\probe_side.mjs, 2026-10-23): x = 0.9635 + 0.172 (8.5 - z), the most inboard part
// of the wall there (it steps outboard above and below). Prints JSON { poses, worstMarginMm, worstPose, stowedCentre, mostInboardX } (the captain seat starts at x 0.69).
// Usage: node check_tablet_fold.mjs <wt21 gltf> <unit id> <layout json>
import { readFileSync } from 'node:fs';

const [, , path, id, layoutPath] = process.argv;
const g = JSON.parse(readFileSync(path, 'utf8'));
const L = JSON.parse(readFileSync(layoutPath, 'utf8'));
const u = L.units.find((x) => x.id === id);
const bin = readFileSync(new URL(g.buffers[0].uri, `file:///${path.replace(/\\/g, '/')}`));
const floats = (ai) => {
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], n = a.count * { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: n }, (_, k) => bin.readFloatLE(base + 4 * k));
};
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qRot = (q, v) => { const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [r[0], r[1], r[2]]; };
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) { const r = a.map((v, k) => v + t * (bb[k] - v)); const l = Math.hypot(...r); return r.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, k) => (Math.sin((1 - t) * th) * v + Math.sin(t * th) * bb[k]) / s);
};
const node = (name) => g.nodes.findIndex((n) => n.name === name);
const anim = (name) => { const a = g.animations.find((x) => x.name === name); const v = floats(a.samplers[0].output); return [v.slice(0, 4), v.slice(4, 8)]; };
const swing = g.nodes[node(`F27_WT21_${id}_swing`)], joint = g.nodes[node(`F27_WT21_${id}_joint`)], hw = g.nodes[node(`WT21_${id}_hw`)];
const [s0, s1] = anim(`F27_WT21_${id}_swing`), [j0, j1] = anim(`F27_WT21_${id}_joint`);
const [W, H] = u.plate.size, T = (u.backZ ?? L.plateZ) - (u.plateZ ?? L.plateZ);
const corners = [];
for (const x of [-W / 2, W / 2]) for (const y of [-H / 2, H / 2]) for (const z of [0, T]) corners.push([x, y, z]);   // hw local (z = into its back)
const wallX = (z) => 0.9635 + 0.172 * (8.5 - z);
let worst = Infinity, worstPose = -1, stowedCentre = null, minX = Infinity;
for (let k = 0; k <= 20; k++) {
  const t = k / 20, qs = slerp(s0, s1, t), qj = slerp(j0, j1, t);
  const toWorld = (p) => {
    const inJoint = qRot(hw.rotation, p).map((v, i) => v + hw.translation[i]);
    const inSwing = qRot(qj, inJoint).map((v, i) => v + joint.translation[i]);
    return qRot(qs, inSwing).map((v, i) => v + swing.translation[i]);
  };
  for (const c of corners) {
    const w = toWorld(c);
    const margin = wallX(w[2]) - w[0];
    minX = Math.min(minX, w[0]);
    if (margin < worst) { worst = margin; worstPose = t; }
  }
  if (k === 20) stowedCentre = toWorld([0, 0, 0]).map((v) => +v.toFixed(3));
}
console.log(JSON.stringify({ poses: 21, worstMarginMm: +(worst * 1000).toFixed(1), worstPose, stowedCentre, mostInboardX: +minX.toFixed(3) }));
