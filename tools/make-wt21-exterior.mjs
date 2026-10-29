// The WT21 variation's own copy of the exterior, with ground equipment the tablet puts in place and takes away:
// * v10.4 (user: "teria como modelar os calços para os pneus do trem de pouso? ... assim as escadas sairiam ao remover os calços"):
//   rubber wheel chocks (yellow sides, black rubber faces, a rope between the two of a pair), shown by L:F27WT21_Chocks; the stairs
//   follow them. The author's red wooden nose chocks (x0_SHOCKS, shown with his GPU) are hidden in this copy.
// * v10.5 (user: "serviços de solo com capas e pinos", after the Hawker 800XP tablet; F27 maintenance training manual 10.00 fig. 1,
//   protection covers and ground safety devices): pitot covers (L:F27WT21_PitotCovers), engine intake and jet pipe covers
//   (L:F27WT21_EngineCovers) and the landing gear ground locks' red streamers (L:F27WT21_GearPins); every one with a REMOVE BEFORE
//   FLIGHT streamer.
// * v10.6 (the maintenance manual's parking procedure, "Chocks must be placed fore and aft of main wheels"): chocks at the main wheels
//   only; the streamers wider and longer (about 6:1, like real ones), the gear pins' as long as the gear below them allows.
// * v10.7 (user, first test in the sim: "os calços não tão no solo, e as capas parecem mal posicionadas", with a photo of an F27 whose
//   intake cover sits "entre o vão da hélice"): the author's gear animations are 200 frames long (Asobo's convention, 100-200 the strut
//   compressing) but his templates play only GEAR ANIMATION POSITION, so parked the gear stands at frame 100 with the struts fully out.
//   His stairs and wooden chocks were made for the compressed gear (frame 200), and so were ours (read at the last key): they stood
//   0.28 m above the tyres' ground. Now the gear is read at frame 100; each main gear's chocks hang under its strut
//   (x0_GEAR_LeftSupportV3 / RightSupportV3, which carries the axle and does not spin) on its tyres' bottom, so they stay on the tyres
//   whatever the gear does; his stairs come down to the same ground (a node between x0_Services and them). The intake cover fills the
//   gap between the spinner and the nacelle lip, just proud of the lip's front (it sat 4 cm inside, dark behind the spinner, and only
//   its outer ring showed); the jet pipe cover is a cap on the scarfed mouth, fitted to its rim. The intake and the mouth are measured
//   here on the author's mesh, so they follow his model if he changes it.
// * The covers and streamers are on the airframe (scene roots). Meshes in their node's own space; everything seen from both sides is
//   two faces (the sim culls back faces). Each chock's inner face is a slope that keeps clear of its tyre (checked here and by
//   panelmap\check_chocks.mjs in the verify, which also checks that the chocks and the stairs stand on the tyres' ground).
// Also writes the chocks' texture (F27WT21_CHOCK.PNG.DDS: yellow upper half, black lower half, DXT1 + sidecar) into <texture dir>; the
// covers' texture (F27WT21_FLAGS.PNG.DDS) is painted by make-flags-atlas.py.
// Usage: node make-wt21-exterior.mjs <exterior.gltf> <exterior.xml> <out.gltf> <out.xml> <texture dir>
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as HW from './hw3d.mjs';

const [, , srcGltf, srcXml, outGltf, outXml, texDir] = process.argv;
if (!texDir) { console.error('usage: node make-wt21-exterior.mjs <exterior.gltf> <exterior.xml> <out.gltf> <out.xml> <texture dir>'); process.exit(2); }
const HERE = dirname(fileURLToPath(import.meta.url));
const CHOCK_DDS = 'F27WT21_CHOCK.PNG.DDS';
const FLAGS_DDS = 'F27WT21_FLAGS.PNG.DDS';
// Measured once on the author's airframe (left side, x > 0; the right side is the mirror): the pitot heads, low on the nose sides
const PITOT = { x: 0.754, y: -0.531, z0: 9.774, z1: 9.906 };
/** Where the left jet pipe's mouth is looked for (its rim is measured below): a box around it on the nacelle's outboard side. */
const PIPE_BOX = { x0: 3.98, x1: 4.5, y0: 0.3, y1: 1.2, z0: 0.25, z1: 1.6 };
/** The frame the gear stands at when parked: GEAR ANIMATION POSITION 100 % (v10.7, see above). */
const GEAR_DOWN_FRAME = 100;

// ---------- building blocks ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (...vs) => vs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
const scale3 = (v, f) => [v[0] * f, v[1] * f, v[2] * f];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => scale3(v, 1 / Math.hypot(...v));
const centroid = (ps) => ps.reduce((a, p) => [a[0] + p[0] / ps.length, a[1] + p[1] / ps.length, a[2] + p[2] / ps.length], [0, 0, 0]);
const rectUv = (r) => [[r.u0, r.v1], [r.u1, r.v1], [r.u1, r.v0], [r.u0, r.v0]];
/** The right side's copy of a left-side point or direction. */
const mirror = (p, s) => [s * p[0], p[1], p[2]];

// ---------- the parked aircraft: gear at frame 100, the stairs out ----------
const gltf = JSON.parse(readFileSync(srcGltf, 'utf8'));
const posedAnims = gltf.animations.map((a) => a.name).filter((n) => /^x0_GEAR_|^x0_STAIRS_/.test(n));
const tmp = mkdtempSync(join(tmpdir(), 'f27-ext-'));
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(HERE, 'panelmap', script), ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${script} failed: ${r.stderr}`);
};
// (the stairs' animations are 100 frames long: frame 100 is their end, out)
run('make_fold_demo.mjs', srcGltf, tmp, '--frame', String(GEAR_DOWN_FRAME), ...posedAnims);
const posed = JSON.parse(readFileSync(join(tmp, basename(srcGltf)), 'utf8'));
run('dump_geometry.mjs', join(tmp, basename(srcGltf)), join(tmp, 'down'));
const meta = JSON.parse(readFileSync(join(tmp, 'down.json'), 'utf8'));
const raw = readFileSync(join(tmp, 'down.bin'));
const pos = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + meta.vertexFloats * 4));
const idx = new Uint32Array(raw.buffer.slice(raw.byteOffset + meta.vertexFloats * 4, raw.byteOffset + meta.vertexFloats * 4 + meta.indexCount * 4));
rmSync(tmp, { recursive: true, force: true });
/** Posed vertices of every mesh whose name passes `test`. */
const vertsWhere = (test) => {
  const out = [];
  for (const p of meta.prims.filter((q) => test(q.name))) {
    for (let k = 0; k < p.vCount; k++) out.push([pos[3 * (p.vOffset + k)], pos[3 * (p.vOffset + k) + 1], pos[3 * (p.vOffset + k) + 2]]);
  }
  if (!out.length) throw new Error(`no mesh for ${test}`);
  return out;
};
const verts = (name) => vertsWhere((n) => n === name);
/** The two wheels of a gear leg's tyre mesh, sorted by x: twin wheels sit symmetrically about the leg's middle, so split there
 *  (x gaps do not work: a tyre's own tread and sidewall vertices leave gaps as wide as the one between the wheels). */
function wheels(name) {
  const v = verts(name), xs = v.map((p) => p[0]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  return [v.filter((p) => p[0] < mid), v.filter((p) => p[0] > mid)].map((w) => {
    const ax = (k, f) => f(...w.map((p) => p[k]));
    const [y0, y1, z0, z1] = [ax(1, Math.min), ax(1, Math.max), ax(2, Math.min), ax(2, Math.max)];
    return { x0: ax(0, Math.min), x1: ax(0, Math.max), r: (y1 - y0) / 2, zc: (z0 + z1) / 2, yc: (y0 + y1) / 2 };
  });
}
const nose = wheels('GEAR_Center_Tire_Still'), left = wheels('GEAR_Left_Tire_Still'), right = wheels('GEAR_Right_Tire_Still');
for (const [leg, ws] of [['nose', nose], ['left', left], ['right', right]]) {
  if (ws[1].x0 - ws[0].x1 < 0.02) throw new Error(`${leg} gear: no gap between its two wheels`);
}
/** Where a gear leg's tyres touch the ground, and their top. */
const tyreBottom = (ws) => Math.min(...ws.map((w) => w.yc - w.r));
const tyreTop = (ws) => Math.max(...ws.map((w) => w.yc + w.r));
const ground = tyreBottom(left);
if (Math.abs(tyreBottom(right) - ground) > 0.01) throw new Error('the two main gear legs do not stand on the same ground');
console.log(`gear down (frame ${GEAR_DOWN_FRAME}): main tyres (r ${left[0].r.toFixed(3)}, z ${left[0].zc.toFixed(3)}) on y ${ground.toFixed(3)}, nose tyres on y ${tyreBottom(nose).toFixed(3)}`);
/** Where a gear leg's ground-lock streamer hangs: just outside the leg's outer face (sign +1: the +x side) in a band of heights. */
function legSide(prefix, y0, y1, sign) {
  const v = vertsWhere((n) => n.startsWith(prefix)).filter((p) => p[1] >= y0 && p[1] <= y1);
  if (!v.length) throw new Error(`${prefix}: nothing between y ${y0} and ${y1}`);
  const x = sign > 0 ? Math.max(...v.map((p) => p[0])) : Math.min(...v.map((p) => p[0]));
  return [x + sign * 0.012, (y0 + y1) / 2, v.reduce((a, p) => a + p[2], 0) / v.length];
}

// ---------- node frames of the parked model ----------
const parentOf = new Map();
gltf.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const nodeIndex = (name) => {
  const i = gltf.nodes.findIndex((n) => n.name === name);
  if (i < 0) throw new Error(`${name} not found`);
  return i;
};
/** A node's local matrix (column-major) from its translation, rotation and scale. */
function localMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const mul4 = (a, b) => Array.from({ length: 16 }, (_, k) => [0, 1, 2, 3].reduce((s, j) => s + a[j * 4 + (k % 4)] * b[Math.floor(k / 4) * 4 + j], 0));
/** A node's world matrix in the parked model (its animated channels as the sim plays them parked). */
function worldMatrix(i) {
  let m = localMatrix(posed.nodes[i]);
  for (let p = parentOf.get(i); p !== undefined; p = parentOf.get(p)) m = mul4(localMatrix(posed.nodes[p]), m);
  return m;
}
/** Turns a model-space point into hw3d panel space in a node's own frame (encode() turns it back with L = (-x, y, -z)). */
function inNode(i) {
  const m = worldMatrix(i), t = [m[12], m[13], m[14]];
  const [[a, b, c], [d, e, f], [g, h, k]] = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  const inv = [[e * k - f * h, c * h - b * k, b * f - c * e], [f * g - d * k, a * k - c * g, c * d - a * f], [d * h - e * g, b * g - a * h, a * e - b * d]]
    .map((r) => r.map((v) => v / det));
  return (p) => {
    const l = inv.map((r) => dot(r, sub(p, t)));
    return [-l[0], l[1], -l[2]];
  };
}
const atRoot = ([x, y, z]) => [-x, y, -z];
/** A mesh being built for one node: `conv` turns a model-space point into hw3d panel space in that node's frame. */
class Part {
  constructor(conv) { this.mb = new HW.MeshBuilder(); this.conv = conv; }
  /** A planar face (model-space points, their uvs), wound counter-clockwise seen from the side `out` points to. */
  face(ps, out, uvs) {
    const n = cross(sub(ps[1], ps[0]), sub(ps[2], ps[0]));
    const flip = dot(n, out) < 0;
    const p = (flip ? ps.slice().reverse() : ps).map(this.conv), u = flip ? uvs.slice().reverse() : uvs;
    if (p.length === 4) this.mb.quad(p, u);
    else this.mb.fan(p, u);
  }
}

// ---------- the chocks (v10.4; v10.7 under the main gear struts, on the tyres' ground) ----------
const YELLOW = { u0: 0.1, v0: 0.1, u1: 0.9, v1: 0.4 }, BLACK = { u0: 0.1, v0: 0.6, u1: 0.9, v1: 0.9 };
// A chock seen from the side, along the aircraft (d = distance from the tyre's contact point, y = height): inner slope (P0 -> P1)
// facing the tyre, short top, outer ramp; two of them per main wheel, a rope on the outer side.
/** Profile for a tyre of radius r: height 0.28 r, the inner slope's top 1 cm off the tyre and its foot at 55 % of that. */
function profile(r) {
  const h = 0.28 * r, d1 = Math.sqrt(r * r - (r - h) * (r - h)) + 0.01, d0 = 0.55 * d1, d2 = d1 + 0.045, d3 = d2 + 0.1;
  // clearance: the inner slope must stay outside the tyre circle (centre (0, r) in this plane)
  for (let k = 0; k <= 20; k++) {
    const t = k / 20, d = d0 + (d1 - d0) * t, y = h * t;
    if (Math.hypot(d, y - r) < r + 0.002) throw new Error(`chock slope touches the tyre at d ${d.toFixed(3)} y ${y.toFixed(3)}`);
  }
  return { h, pts: [[d0, 0], [d1, h], [d2, h], [d3, 0]] };
}
/** One chock across x0..x1 on the ground at `gy`, on the +z (dir 1) or -z (dir -1) side of a tyre touching it at zc. */
function chock(part, gy, x0, x1, zc, dir, prof) {
  const P = prof.pts.map(([d, y]) => [zc + dir * d, gy + y]);
  const at = (x, [z, y]) => [x, y, z];
  const inside = centroid([...P.map((q) => at(x0, q)), ...P.map((q) => at(x1, q))]);
  const add = (ps, uv) => part.face(ps, sub(centroid(ps), inside), rectUv(uv));
  for (let k = 0; k < 3; k++) {   // inner slope (rubber), top (yellow), outer ramp (rubber)
    const a = P[k], b = P[k + 1];
    add([at(x0, a), at(x0, b), at(x1, b), at(x1, a)], k === 1 ? YELLOW : BLACK);
  }
  add(P.map((q) => at(x0, q)), YELLOW);   // the two sides
  add(P.map((q) => at(x1, q)), YELLOW);
}
/** The rope between a pair, lying on the ground beside the tyre (at x), from one chock's top edge to the other's. */
function rope(part, gy, x, zc, prof) {
  const z0 = zc - prof.pts[2][0], z1 = zc + prof.pts[2][0], w = 0.006, h = 0.012;
  const inside = [x, gy + h / 2, zc];
  const c = [[x - w, gy, z0], [x + w, gy, z0], [x + w, gy + h, z0], [x - w, gy + h, z0]];
  const e = c.map(([px, py]) => [px, py, z1]);
  for (const ps of [[c[3], c[2], e[2], e[3]], [c[1], e[1], e[2], c[2]], [c[0], c[3], e[3], e[0]]]) {   // top, sides
    part.face(ps, sub(centroid(ps), inside), rectUv(YELLOW));
  }
}
const MARGIN = 0.025;
/** A chock pair in front of and behind each wheel of a main gear leg (`ws` sorted by x) on its tyres' ground, the rope on the
 *  `outerSign` side. */
function gearLeg(part, ws, outerSign) {
  const prof = profile(ws[0].r), gy = tyreBottom(ws);
  for (const w of ws) {
    const x0 = w.x0 - MARGIN, x1 = w.x1 + MARGIN;
    chock(part, gy, x0, x1, w.zc, 1, prof);
    chock(part, gy, x0, x1, w.zc, -1, prof);
    rope(part, gy, outerSign > 0 ? x1 + 0.03 : x0 - 0.03, w.zc, prof);
  }
  return prof;
}
const strutL = nodeIndex('x0_GEAR_LeftSupportV3'), strutR = nodeIndex('x0_GEAR_RightSupportV3');
for (const [strut, tyre] of [[strutL, 'GEAR_Left_Tire_Still'], [strutR, 'GEAR_Right_Tire_Still']]) {   // the strut carries the tyres
  let i = gltf.nodes.findIndex((n) => n.name === tyre);
  while (i !== undefined && i !== strut) i = parentOf.get(i);
  if (i !== strut) throw new Error(`${tyre} does not hang under ${gltf.nodes[strut].name}`);
}
const chocksL = new Part(inNode(strutL)), chocksR = new Part(inNode(strutR));
const pm = gearLeg(chocksL, left, 1);
gearLeg(chocksR, right, -1);
console.log(`chocks: mains only, ${pm.h.toFixed(3)} m high, under the struts; ${chocksL.mb.vertexCount + chocksR.mb.vertexCount} vertices`);

// ---------- the author's stairs, down to the tyres' ground (v10.7) ----------
const stairsDrop = Math.min(...vertsWhere((n) => /^x0_STAIRS_(Fwd|Aft)$/.test(n)).map((p) => p[1])) - ground;
if (stairsDrop < -0.01 || stairsDrop > 0.5) throw new Error(`the author's stairs stand ${stairsDrop.toFixed(3)} m above the tyres' ground`);
console.log(`the author's stairs stood ${stairsDrop.toFixed(3)} m above the tyres' ground: brought down`);

// ---------- the engine intake and the jet pipe mouth, measured on the author's mesh (left engine; the right one is its mirror) ----------
// intake: the spinner's rear ring (its axis and radius) and the nacelle lip in front of the duct
const spinner = verts('ENGINE_Propeller_Still_1');
const spinZ = Math.min(...spinner.map((p) => p[2]));
const spinRing = spinner.filter((p) => p[2] < spinZ + 0.01);
const [axX, axY] = centroid(spinRing);
const radius = (p) => Math.hypot(p[0] - axX, p[1] - axY);
const spinR = Math.max(...spinRing.map(radius));
const lipVerts = verts('x0_FUSELAGE_Hublots').filter((p) => radius(p) > spinR + 0.03 && radius(p) < spinR + 0.2 && Math.abs(p[2] - spinZ) < 0.3);
const lipZ = Math.max(...lipVerts.map((p) => p[2]));
const lipIn = Math.min(...lipVerts.filter((p) => p[2] > lipZ - 0.012).map(radius));
const INTAKE = { x: axX, y: axY, z: lipZ + 0.005, r0: spinR + 0.003, r1: lipIn + 0.03 };
if (!(INTAKE.r1 - INTAKE.r0 > 0.04 && INTAKE.r1 - INTAKE.r0 < 0.2)) throw new Error(`intake: no gap between the spinner (r ${spinR.toFixed(3)}) and the lip (r ${lipIn.toFixed(3)})`);
console.log(`intake: spinner r ${spinR.toFixed(3)} (its back at z ${spinZ.toFixed(3)}), lip front at z ${lipZ.toFixed(3)}, inner r ${lipIn.toFixed(3)}`);
// jet pipe: its scarfed mouth's rim = the sharp folds where the pipe's outer and inner walls meet (faces welded by position)
const B = PIPE_BOX;
const inBox = (v) => v[0] > B.x0 && v[0] < B.x1 && v[1] > B.y0 && v[1] < B.y1 && v[2] > B.z0 && v[2] < B.z1;
const tris = [];
for (const p of meta.prims.filter((q) => q.name === 'x0_FUSELAGE_Hublots')) {
  for (let t = 0; t < p.iCount; t += 3) {
    const vs = [0, 1, 2].map((k) => { const i = p.vOffset + idx[p.iOffset + t + k]; return [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; });
    const n = cross(sub(vs[1], vs[0]), sub(vs[2], vs[0]));
    if (vs.every(inBox) && Math.hypot(...n) > 1e-9) tris.push({ vs, n: unit(n) });
  }
}
const key = (v) => v.map((c) => Math.round(c * 1000)).join(',');
const edgeFaces = new Map();
tris.forEach((t, ti) => [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
  const ka = key(t.vs[a]), kb = key(t.vs[b]), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  if (!edgeFaces.has(k)) edgeFaces.set(k, []);
  edgeFaces.get(k).push(ti);
}));
const rimPts = new Map();
for (const [k, fs] of edgeFaces) {
  if (fs.length === 2 && dot(tris[fs[0]].n, tris[fs[1]].n) < -0.5) {
    for (const s of k.split('|')) rimPts.set(s, s.split(',').map((c) => Number(c) / 1000));
  }
}
const rim = [...rimPts.values()];
if (rim.length < 20) throw new Error(`jet pipe mouth: only ${rim.length} rim points in ${JSON.stringify(PIPE_BOX)}`);
/** The principal directions of a point set, the widest first (power iteration with deflation). */
function principal(ps) {
  const c = centroid(ps);
  let M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => ps.reduce((s, q) => s + (q[i] - c[i]) * (q[j] - c[j]), 0) / ps.length));
  const axes = [];
  for (let e = 0; e < 2; e++) {
    let v = [0.3, 0.2, 1];
    for (let it = 0; it < 300; it++) v = unit(M.map((r) => dot(r, v)));
    const lam = dot(M.map((r) => dot(r, v)), v);
    axes.push(v);
    M = M.map((r, i) => r.map((x, j) => x - lam * v[i] * v[j]));
  }
  return { c, u: axes[0], v: axes[1] };
}
const pc = principal(rim);
let U = pc.u[2] < 0 ? scale3(pc.u, -1) : pc.u;   // along the pipe, forward
let W = unit(cross(U, pc.v));
if (W[0] < 0) W = scale3(W, -1);   // out of the mouth: outboard
const V = cross(W, U);
U = cross(V, W);
const proj = rim.map((p) => { const d = sub(p, pc.c); return [dot(d, U), dot(d, V), dot(d, W)]; });
const span = (k) => [Math.min(...proj.map((q) => q[k])), Math.max(...proj.map((q) => q[k]))];
const [[u0, u1], [v0, v1], [, w1]] = [span(0), span(1), span(2)];
const MOUTH = { c: add3(pc.c, scale3(U, (u0 + u1) / 2), scale3(V, (v0 + v1) / 2)), U, V, W, a: (u1 - u0) / 2 + 0.03, b: (v1 - v0) / 2 + 0.03, w0: w1 + 0.01 };
if (!(W[0] > 0.7 && MOUTH.a > 0.25 && MOUTH.a < 0.6 && MOUTH.b > 0.12 && MOUTH.b < 0.35)) {
  throw new Error(`jet pipe mouth not as expected: facing ${W.map((x) => x.toFixed(2))}, ${(2 * MOUTH.a).toFixed(2)} x ${(2 * MOUTH.b).toFixed(2)} m`);
}
console.log(`jet pipe mouth: ${rim.length} rim points, ${(2 * MOUTH.a).toFixed(2)} x ${(2 * MOUTH.b).toFixed(2)} m, facing ${W.map((x) => x.toFixed(2)).join(' ')}`);

// ---------- covers and streamers (v10.5; v10.7 fitted to the intake gap and the jet pipe mouth) ----------
// F27WT21_FLAGS.PNG.DDS (make-flags-atlas.py): cover fabric, the streamer with its text along u, the plug face
const COVER = { u0: 0.02, v0: 0.03, u1: 0.98, v1: 0.28 }, STREAMER = { u0: 0, v0: 0.375, u1: 1, v1: 0.625 };
/** A REMOVE BEFORE FLIGHT streamer hanging from `top`, `len` down, `w` wide along z, readable from +x and -x (one face each). */
function streamer(part, [x, y, z], len, w) {
  const a = [x, y, z - w / 2], b = [x, y, z + w / 2], c = [x, y - len, z + w / 2], d = [x, y - len, z - w / 2];
  const S = STREAMER;
  // the text runs down the streamer (u), its letters' tops to the reader's right: -z seen from +x, +z seen from -x
  part.face([a, b, c, d], [1, 0, 0], [[S.u0, S.v0], [S.u0, S.v1], [S.u1, S.v1], [S.u1, S.v0]]);
  part.face([a, b, c, d], [-1, 0, 0], [[S.u0, S.v1], [S.u0, S.v0], [S.u1, S.v0], [S.u1, S.v1]]);
}
/** Ring of quads around an axis along z (an ellipse of semi-axes ax, ay), from z0 to z1, facing outwards. */
function bandZ(part, cx, cy, ax, ay, z0, z1, seg, uv) {
  for (let k = 0; k < seg; k++) {
    const t0 = (2 * Math.PI * k) / seg, t1 = (2 * Math.PI * (k + 1)) / seg;
    const p = (t, z) => [cx + ax * Math.cos(t), cy + ay * Math.sin(t), z];
    const uu0 = uv.u0 + ((uv.u1 - uv.u0) * k) / seg, uu1 = uv.u0 + ((uv.u1 - uv.u0) * (k + 1)) / seg;
    const tm = (t0 + t1) / 2;
    part.face([p(t0, z0), p(t1, z0), p(t1, z1), p(t0, z1)], [Math.cos(tm), Math.sin(tm), 0], [[uu0, uv.v1], [uu1, uv.v1], [uu1, uv.v0], [uu0, uv.v0]]);
  }
}
/** Flat ring (or, with r0 = 0, an elliptic disc) across z at z, facing `dir` (+1: +z, -1: -z). */
function discZ(part, cx, cy, ax, ay, r0, z, dir, seg, uv) {
  for (let k = 0; k < seg; k++) {
    const t0 = (2 * Math.PI * k) / seg, t1 = (2 * Math.PI * (k + 1)) / seg;
    const p = (t, f) => [cx + f * ax * Math.cos(t), cy + f * ay * Math.sin(t), z];
    const uu0 = uv.u0 + ((uv.u1 - uv.u0) * k) / seg, uu1 = uv.u0 + ((uv.u1 - uv.u0) * (k + 1)) / seg;
    if (r0 > 0) part.face([p(t0, r0), p(t1, r0), p(t1, 1), p(t0, 1)], [0, 0, dir], [[uu0, uv.v1], [uu1, uv.v1], [uu1, uv.v0], [uu0, uv.v0]]);
    else part.face([[cx, cy, z], p(t0, 1), p(t1, 1)], [0, 0, dir], [[(uu0 + uu1) / 2, uv.v1], [uu0, uv.v0], [uu1, uv.v0]]);
  }
}
/** The jet pipe's cover on side s: a shallow cap over the mouth (its rim's ellipse, a little larger) and a short skirt back over the
 *  lip; returns the lowest point of its edge, where the streamer hangs. */
function pipeCover(part, s, seg = 28) {
  const M = MOUTH, DOME = 0.035, SKIRT = 0.18, rings = [1, 0.72, 0.4, 0];
  const at = (t, f, w) => mirror(add3(M.c, scale3(M.U, f * M.a * Math.cos(t)), scale3(M.V, f * M.b * Math.sin(t)), scale3(M.W, w)), s);
  const capW = (f) => M.w0 + DOME * (1 - f * f);
  const out = mirror(M.W, s);
  let low = null;
  for (let k = 0; k < seg; k++) {
    const t0 = (2 * Math.PI * k) / seg, t1 = (2 * Math.PI * (k + 1)) / seg;
    const uu0 = COVER.u0 + ((COVER.u1 - COVER.u0) * k) / seg, uu1 = COVER.u0 + ((COVER.u1 - COVER.u0) * (k + 1)) / seg;
    for (let r = 0; r + 1 < rings.length; r++) {   // the cap, ring by ring towards its middle
      const fa = rings[r], fb = rings[r + 1], va = COVER.v0 + (COVER.v1 - COVER.v0) * (1 - fa) * 0.5, vb = COVER.v0 + (COVER.v1 - COVER.v0) * (1 - fb) * 0.5;
      if (fb > 0) part.face([at(t0, fa, capW(fa)), at(t1, fa, capW(fa)), at(t1, fb, capW(fb)), at(t0, fb, capW(fb))], out, [[uu0, va], [uu1, va], [uu1, vb], [uu0, vb]]);
      else part.face([at(t0, fa, capW(fa)), at(t1, fa, capW(fa)), at(0, 0, capW(0))], out, [[uu0, va], [uu1, va], [(uu0 + uu1) / 2, vb]]);
    }
    const tm = (t0 + t1) / 2;   // the skirt, facing out of the ellipse
    const side = mirror(unit(add3(scale3(M.U, Math.cos(tm) / M.a), scale3(M.V, Math.sin(tm) / M.b))), s);
    part.face([at(t0, 1, M.w0), at(t1, 1, M.w0), at(t1, 1, M.w0 - SKIRT), at(t0, 1, M.w0 - SKIRT)], side, [[uu0, COVER.v0], [uu1, COVER.v0], [uu1, COVER.v1], [uu0, COVER.v1]]);
    const e = at(t0, 1, M.w0);
    if (!low || e[1] < low[1]) low = e;
  }
  return low;
}
const pitots = new Part(atRoot), engines = new Part(atRoot), pins = new Part(atRoot);
for (const s of [1, -1]) {
  // pitot cover: a sleeve over the head with a closed front, its streamer hanging under it
  const x = s * PITOT.x, r = 0.038, zf = PITOT.z1 + 0.012;
  bandZ(pitots, x, PITOT.y, r, r, PITOT.z0 + 0.02, zf, 12, COVER);
  discZ(pitots, x, PITOT.y, r, r, 0, zf, 1, 12, COVER);
  streamer(pitots, [x, PITOT.y - r, (PITOT.z0 + PITOT.z1) / 2], 0.42, 0.07);
  // intake cover: a ring in the gap between the spinner and the lip, just in front of the lip; its streamer from the bottom, in front
  const ix = s * INTAKE.x;
  discZ(engines, ix, INTAKE.y, INTAKE.r1, INTAKE.r1, INTAKE.r0 / INTAKE.r1, INTAKE.z, 1, 36, COVER);
  streamer(engines, [ix, INTAKE.y - INTAKE.r1 + 0.012, INTAKE.z + 0.006 + 0.04], 0.54, 0.08);
  // jet pipe cover: a cap on the mouth, the streamer from its lowest edge, just outboard of it
  const low = pipeCover(engines, s);
  streamer(engines, [low[0] + s * 0.012, low[1] + 0.005, low[2]], 0.48, 0.08);
}
// gear ground locks: their red streamers, outside each leg above the tyres, as long as what lies beneath allows
const tyres = [...nose, ...left, ...right], gearVerts = vertsWhere((n) => /GEAR/i.test(n));
/** How far down (at most `len`) a streamer `w` wide hanging from `top` on the `sign` side of its leg goes before it comes within 4 cm
 *  of a tyre top or of a gear part sticking out under it. */
function reach([x, y, z], w, len, sign) {
  for (const t of tyres) {
    if (x < t.x0 || x > t.x1) continue;
    const dz = Math.max(0, Math.abs(z - t.zc) - w / 2);
    if (dz < t.r) len = Math.min(len, y - (t.yc + Math.sqrt(t.r * t.r - dz * dz)) - 0.04);
  }
  for (const p of gearVerts) {   // only what reaches out to the streamer's plane: the leg it hangs beside stays behind it
    if (sign * (p[0] - x) < -0.006 || sign * (p[0] - x) > 0.03 || Math.abs(p[2] - z) > w / 2 || p[1] > y - 0.01) continue;
    len = Math.min(len, y - p[1] - 0.04);
  }
  return len;
}
const pinLens = [];
// the bands sit at the same heights above the tyres as when they were chosen (v10.5, on the old pose)
for (const [prefix, y0, y1, sign] of [['x0_GEAR_Central', tyreTop(nose) + 0.08, tyreTop(nose) + 0.33, 1],
  ['x0_GEAR_Left', tyreTop(left) + 0.26, tyreTop(left) + 0.56, 1], ['x0_GEAR_Right', tyreTop(right) + 0.26, tyreTop(right) + 0.56, -1]]) {
  const top = legSide(prefix, y0, y1, sign), len = reach(top, 0.07, 0.42, sign);
  if (len < 0.15) throw new Error(`${prefix}: no room for its ground-lock streamer (${len.toFixed(3)} m)`);
  streamer(pins, top, len, 0.07);
  pinLens.push(len.toFixed(2));
}
console.log(`covers: pitots ${pitots.mb.vertexCount}, engines ${engines.mb.vertexCount}, gear pins ${pins.mb.vertexCount} vertices (streamers ${pinLens.join(' / ')} m)`);

// ---------- glTF: materials, meshes, nodes; own .bin ----------
const baseBin = readFileSync(join(dirname(srcGltf), gltf.buffers[0].uri));
const chunks = [baseBin], state = { length: baseBin.length };
/** A textured material on a new image (the author's form: plain PBR, base colour from a DDS found through texture.cfg). */
function material(name, dds, roughness) {
  gltf.images.push({ uri: dds, name: dds.replace(/\.PNG\.DDS$/i, '').toLowerCase(), extras: 'ASOBO_image_converted_meta' });
  gltf.textures.push({ extensions: { MSFT_texture_dds: { source: gltf.images.length - 1 } } });
  gltf.materials.push({ name, pbrMetallicRoughness: { baseColorTexture: { index: gltf.textures.length - 1 }, metallicFactor: 0, roughnessFactor: roughness } });
  return gltf.materials.length - 1;
}
const chockMat = material('F27_WT21_chock', CHOCK_DDS, 0.85), flagsMat = material('F27_WT21_flags', FLAGS_DDS, 0.9);
/** Adds a node holding a part's mesh, under `parent` (a node index) or as a scene root. */
function addNode(name, part, mat, parent) {
  const r = HW.addMesh(gltf, chunks, state, name, mat, part.mb);
  gltf.nodes.push({ mesh: r.mesh, extensions: { ASOBO_unique_id: { id: name } }, name });
  const node = gltf.nodes.length - 1;
  if (parent === null) gltf.scenes[0].nodes.push(node);
  else (gltf.nodes[parent].children ||= []).push(node);
}
addNode('F27WT21_CHOCKS_L', chocksL, chockMat, strutL);
addNode('F27WT21_CHOCKS_R', chocksR, chockMat, strutR);
addNode('F27WT21_PITOTCOVERS', pitots, flagsMat, null);
addNode('F27WT21_ENGINECOVERS', engines, flagsMat, null);
addNode('F27WT21_GEARPINS', pins, flagsMat, null);
// the author's stairs: a node between x0_Services and them, as much lower as they stood above the tyres' ground (in the services
// node's own units: it has a uniform scale and no rest rotation; its animation only turns it a little against the pitch)
const services = nodeIndex('x0_Services'), sv = gltf.nodes[services];
if (sv.rotation && Math.abs(sv.rotation[3]) < 0.999999) throw new Error('x0_Services has a rest rotation: the stairs drop assumes none');
const stairs = (sv.children || []).filter((c) => /^x0_STAIRS_(Fwd|Aft)$/.test(gltf.nodes[c].name));
if (stairs.length !== 2) throw new Error('the author\'s two stairs are not under x0_Services');
gltf.nodes.push({ name: 'F27WT21_STAIRS_DROP', translation: [0, -stairsDrop / (sv.scale || [1, 1, 1])[1], 0], children: stairs, extensions: { ASOBO_unique_id: { id: 'F27WT21_STAIRS_DROP' } } });
sv.children = sv.children.filter((c) => !stairs.includes(c)).concat([gltf.nodes.length - 1]);
const outBin = outGltf.replace(/\.gltf$/i, '.bin');
gltf.buffers[0] = { byteLength: state.length, uri: basename(outBin) };
writeFileSync(outBin, Buffer.concat(chunks));
writeFileSync(outGltf, JSON.stringify(gltf));
console.log(`wrote ${outGltf} (+ ${basename(outBin)}, ${state.length} bytes): chocks under the main gear struts, covers and gear pins on the airframe, the stairs lower`);

// ---------- behaviours: the author's, on this glTF, his chocks hidden, ours on their L:vars ----------
let xml = readFileSync(srcXml, 'utf8');
const lod = `ModelFile="${basename(srcGltf)}"`;
if (!xml.includes(lod)) throw new Error(`${lod} not in ${srcXml}`);
xml = xml.replace(lod, `ModelFile="${basename(outGltf)}"`);
const shocks = /(<Component ID="F27bgtShocksExt" Node="x0_SHOCKS">[\s\S]*?<VISIBILITY_CODE>)([\s\S]*?)(<\/VISIBILITY_CODE>)/;
if (!shocks.test(xml)) throw new Error('the author\'s chocks component (F27bgtShocksExt) was not found');
xml = xml.replace(shocks, '$1\n\t\t\t\t\t0\n\t\t\t\t$3');
const visible = (id, node, variable) => `
		<Component ID="${id}" Node="${node}">
			<UseTemplate Name="ASOBO_GT_Visibility">
				<VISIBILITY_CODE>(${variable}, Bool)</VISIBILITY_CODE>
			</UseTemplate>
		</Component>`;
// (the author's file has "\t</Behaviors>": this text takes the place of the closing tag, after that tab)
const ours = `\t<!-- WT21 only (tools\\make-wt21-exterior.mjs), put in place and taken away by the tablet. v10.4: rubber wheel chocks (v10.6: at
		     the main wheels only; v10.7: under the gear struts, on the tyres' ground), the stairs follow them (the author's red wooden
		     nose chocks, x0_SHOCKS, shown with his GPU, are hidden above). v10.5: pitot covers, engine intake and exhaust covers, the
		     gear ground locks' streamers. -->${
  visible('F27WT21ChocksL', 'F27WT21_CHOCKS_L', 'L:F27WT21_Chocks')}${
  visible('F27WT21ChocksR', 'F27WT21_CHOCKS_R', 'L:F27WT21_Chocks')}${
  visible('F27WT21PitotCovers', 'F27WT21_PITOTCOVERS', 'L:F27WT21_PitotCovers')}${
  visible('F27WT21EngineCovers', 'F27WT21_ENGINECOVERS', 'L:F27WT21_EngineCovers')}${
  visible('F27WT21GearPins', 'F27WT21_GEARPINS', 'L:F27WT21_GearPins')}
	</Behaviors>`;
if (xml.split('</Behaviors>').length !== 2) throw new Error('expected one </Behaviors>');
xml = xml.replace('</Behaviors>', ours);
writeFileSync(outXml, xml);
console.log(`wrote ${outXml}`);

// ---------- chocks texture: 64 x 64 DXT1, yellow upper half, black lower half, full mip chain, MSFS sidecar ----------
const rgb565 = (r8, g8, b8) => ((r8 >> 3) << 11) | ((g8 >> 2) << 5) | (b8 >> 3);
const C0 = rgb565(231, 180, 22), C1 = rgb565(30, 30, 30);   // C0 > C1: four-colour mode, index 0 = C0, 1 = C1
const SIZE = 64, mips = [];
for (let s = SIZE; s >= 1; s = Math.floor(s / 2)) mips.push(s);
const blocks = [];
for (const s of mips) {
  const nb = Math.max(1, Math.ceil(s / 4));
  for (let by = 0; by < nb; by++) {
    for (let bx = 0; bx < nb; bx++) {
      const b = Buffer.alloc(8);
      b.writeUInt16LE(C0, 0);
      b.writeUInt16LE(C1, 2);
      let bits = 0;
      for (let ty = 0; ty < 4; ty++) {
        const y = by * 4 + ty, black = (y + 0.5) / s >= 0.5 ? 1 : 0;
        for (let tx = 0; tx < 4; tx++) bits |= black << (2 * (4 * ty + tx));
      }
      b.writeUInt32LE(bits >>> 0, 4);
      blocks.push(b);
    }
  }
}
const header = Buffer.alloc(128);
header.write('DDS ', 0, 'ascii');
header.writeUInt32LE(124, 4);
header.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000, 8);
header.writeUInt32LE(SIZE, 12);
header.writeUInt32LE(SIZE, 16);
header.writeUInt32LE((SIZE / 4) ** 2 * 8, 20);
header.writeUInt32LE(mips.length, 28);
header.writeUInt32LE(32, 76);
header.writeUInt32LE(0x4, 80);
header.write('DXT1', 84, 'ascii');
header.writeUInt32LE(0x1000 | 0x8 | 0x400000, 108);
const ddsPath = join(texDir, CHOCK_DDS);
writeFileSync(ddsPath, Buffer.concat([header, ...blocks]));
writeFileSync(ddsPath + '.json', JSON.stringify({ Version: 2, SourceFileDate: 133688302360000000, Flags: ['FL_BITMAP_COMPRESSION', 'FL_BITMAP_MIPMAP'] }));
console.log(`wrote ${ddsPath} (64x64 DXT1, ${mips.length} mips)`);
