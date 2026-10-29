// Procedural 3D hardware for the WT21 cockpit (display frames, panel inserts, CJ4-style FCP/DCP modules, key caps, knobs), written as
// NEW meshes in the interior's own "optimized" vertex format, so no Blender export is needed:
//   36-byte interleaved vertex: POSITION float32 x3 @0 | TANGENT int8 x4 @12 (xyz*127, w=-127) | NORMAL int8 x4 @16 (xyz*127, w=127)
//   | TEXCOORD_0 half x2 @20 | TEXCOORD_1 half x2 @24 (= UV0) | COLOR_0 half x4 @28 (1.0 = 0x3C00); uint16/uint32 indices;
//   primitive extras ASOBO_primitive { PrimitiveCount: triangles, VertexType: "VTX", VertexVersion: 2 }  (all read from the author's meshes).
// Geometry is built in "panel space": X to the pilot's right, Y up, Z towards the pilot, origin on the module's front plane. A node whose
// translation is the module's world position holds it; local = (-X, Y, -Z) (a 180 deg turn about y, so triangle winding is kept).
// The builders below think counter-clockwise seen from outside; encode() writes every triangle reversed, because the sim's front face is
// CLOCKWISE (as in all the author's meshes). UVs point into one shared atlas (see Atlas and make-hw-atlas.py).

const L = (p) => [-p[0], p[1], -p[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class MeshBuilder {
  constructor() { this.v = []; this.idx = []; }
  /** Planar (or radially smoothed) quad p0..p3 CCW from outside; uv per corner; optional per-corner normals. */
  quad(p, uv, normals) {
    const n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const t = norm(sub(p[1], p[0]));
    const base = this.v.length;
    for (let k = 0; k < 4; k++) this.v.push({ p: p[k], n: normals ? normals[k] : n, t, uv: uv[k] });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Convex polygon as a triangle fan around its first point (CCW from outside). */
  fan(p, uv) {
    const n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const t = norm(sub(p[1], p[0]));
    const base = this.v.length;
    p.forEach((q, k) => this.v.push({ p: q, n, t, uv: uv[k] }));
    for (let k = 1; k < p.length - 1; k++) this.idx.push(base, base + k, base + k + 1);
  }
  get vertexCount() { return this.v.length; }
  get triangleCount() { return this.idx.length / 3; }
}

// ---------- UV helpers (atlas rect in pixels -> uv) ----------
export const uvRect = (atlas, r, inset = 0) => {
  const [x, y, w, h] = r;
  return { u0: (x + inset * w) / atlas.size, v0: (y + inset * h) / atlas.size, u1: (x + w - inset * w) / atlas.size, v1: (y + h - inset * h) / atlas.size };
};
const corners = (r) => [[r.u0, r.v1], [r.u1, r.v1], [r.u1, r.v0], [r.u0, r.v0]];   // bl, br, tr, tl (v grows downwards)

// ---------- primitives ----------
/** Side walls along a closed outline (2D points CCW seen from +Z) from zLow to zHigh. */
export function walls(mb, outline, zLow, zHigh, uv) {
  const c = corners(uv);
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k], b = outline[(k + 1) % outline.length];
    mb.quad([[a[0], a[1], zLow], [b[0], b[1], zLow], [b[0], b[1], zHigh], [a[0], a[1], zHigh]], c);
  }
}
const rectOutline = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];   // CCW from +Z

/** Flat rectangle facing +Z at z (a key's lamp bar). */
export function flatRect(mb, x0, y0, x1, y1, z, uv) {
  mb.quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], corners(uv));
}

/** Box: front face at zFront (uvFront mapped over it), four walls back to zBack (no back face). */
export function box(mb, x0, y0, x1, y1, zBack, zFront, uvFront, uvSide) {
  mb.quad([[x0, y0, zFront], [x1, y0, zFront], [x1, y1, zFront], [x0, y1, zFront]], corners(uvFront));
  walls(mb, rectOutline(x0, y0, x1, y1), zBack, zFront, uvSide);
}

/** Rounded-rectangle slab centred on 0,0 (the tablet's body): front face at zFront, back face at zBack, side walls, corner radius r. */
export function roundedSlab(mb, w, h, r, zBack, zFront, uvFront, uvBack, uvSide, seg = 6) {
  const pts = [];   // CCW from +Z, starting at the top-right corner arc
  for (const [cx, cy, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]]) {
    for (let k = 0; k <= seg; k++) {
      const a = ((a0 + (90 * k) / seg) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  walls(mb, pts, zBack, zFront, uvSide);
  const at = (uv) => ([x, y]) => [uv.u0 + (uv.u1 - uv.u0) * (x / w + 0.5), uv.v0 + (uv.v1 - uv.v0) * (0.5 - y / h)];
  mb.fan(pts.map(([x, y]) => [x, y, zFront]), pts.map(at(uvFront)));
  const back = pts.slice().reverse();
  mb.fan(back.map(([x, y]) => [x, y, zBack]), back.map(at(uvBack)));
}

/** Raised key: frustum from a w x h base at zBase to a cap inset by `chamfer` at zBase + height. */
export function keyCap(mb, cx, cy, w, h, zBase, height, chamfer, uvCap, uvSide) {
  const b = rectOutline(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  const t = rectOutline(cx - w / 2 + chamfer, cy - h / 2 + chamfer, cx + w / 2 - chamfer, cy + h / 2 - chamfer);
  const zt = zBase + height, c = corners(uvSide);
  for (let k = 0; k < 4; k++) {
    const a0 = b[k], a1 = b[(k + 1) % 4], t0 = t[k], t1 = t[(k + 1) % 4];
    mb.quad([[a0[0], a0[1], zBase], [a1[0], a1[1], zBase], [t1[0], t1[1], zt], [t0[0], t0[1], zt]], c);
  }
  mb.quad(t.map((q) => [q[0], q[1], zt]), corners(uvCap));
}

/** Cylinder of radius r from z0 to z1 (side smooth, knurl uv wraps around), optional top disk mapped into uvTop as a circle. */
export function cylinder(mb, cx, cy, r, z0, z1, seg, uvSide, uvTop) {
  const pts = [];
  for (let k = 0; k <= seg; k++) { const a = (2 * Math.PI * k) / seg; pts.push([Math.cos(a), Math.sin(a)]); }
  for (let k = 0; k < seg; k++) {
    const [ca, sa] = pts[k], [cb, sb] = pts[k + 1];
    const u0 = uvSide.u0 + (uvSide.u1 - uvSide.u0) * (k / seg), u1 = uvSide.u0 + (uvSide.u1 - uvSide.u0) * ((k + 1) / seg);
    mb.quad([[cx + r * ca, cy + r * sa, z0], [cx + r * cb, cy + r * sb, z0], [cx + r * cb, cy + r * sb, z1], [cx + r * ca, cy + r * sa, z1]],
      [[u0, uvSide.v1], [u1, uvSide.v1], [u1, uvSide.v0], [u0, uvSide.v0]],
      [[ca, sa, 0], [cb, sb, 0], [cb, sb, 0], [ca, sa, 0]]);
  }
  if (uvTop) {
    const uc = (uvTop.u0 + uvTop.u1) / 2, vc = (uvTop.v0 + uvTop.v1) / 2, ur = (uvTop.u1 - uvTop.u0) / 2, vr = (uvTop.v1 - uvTop.v0) / 2;
    const ring = pts.slice(0, seg);
    mb.fan(ring.map(([c, s]) => [cx + r * c, cy + r * s, z1]), ring.map(([c, s]) => [uc + ur * c, vc - vr * s]));
  }
}

/** Flat annulus (ring) facing +Z at z between radii r0 < r1. */
export function annulus(mb, cx, cy, r0, r1, z, seg, uv) {
  const c = corners(uv);
  for (let k = 0; k < seg; k++) {
    const a = (2 * Math.PI * k) / seg, b = (2 * Math.PI * (k + 1)) / seg;
    mb.quad([[cx + r0 * Math.cos(a), cy + r0 * Math.sin(a), z], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), z],
      [cx + r1 * Math.cos(b), cy + r1 * Math.sin(b), z], [cx + r0 * Math.cos(b), cy + r0 * Math.sin(b), z]], c);
  }
}

/** Display frame: outer W x H, opening w x h at (cx, cy); front at zFront with a chamfered outer edge, walls back to zBack, the
 *  opening's walls going in to zRecess (where the glass sits). */
export function frame(mb, cx, cy, W, H, w, h, zBack, zFront, zRecess, chamfer, uv) {
  const c = corners(uv);
  const O = rectOutline(cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2);
  const Oi = rectOutline(cx - W / 2 + chamfer, cy - H / 2 + chamfer, cx + W / 2 - chamfer, cy + H / 2 - chamfer);
  const I = rectOutline(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  for (let k = 0; k < 4; k++) {   // front ring between Oi and I
    const a0 = Oi[k], a1 = Oi[(k + 1) % 4], i0 = I[k], i1 = I[(k + 1) % 4];
    mb.quad([[a0[0], a0[1], zFront], [a1[0], a1[1], zFront], [i1[0], i1[1], zFront], [i0[0], i0[1], zFront]], c);
  }
  for (let k = 0; k < 4; k++) {   // chamfer from the outer edge (zFront - chamfer) up to Oi at zFront
    const a0 = O[k], a1 = O[(k + 1) % 4], t0 = Oi[k], t1 = Oi[(k + 1) % 4];
    mb.quad([[a0[0], a0[1], zFront - chamfer], [a1[0], a1[1], zFront - chamfer], [t1[0], t1[1], zFront], [t0[0], t0[1], zFront]], c);
  }
  walls(mb, O, zBack, zFront - chamfer, uv);
  walls(mb, [...I].reverse(), zRecess, zFront, uv);   // inner walls face into the opening
}

// ---------- encoding ----------
function toHalf(v) {
  const f = new Float32Array([v]), i = new Uint32Array(f.buffer)[0];
  const s = (i >> 16) & 0x8000, e = ((i >> 23) & 0xff) - 127 + 15, m = i & 0x7fffff;
  if (e <= 0) return s;
  if (e >= 31) return s | 0x7c00;
  return s | (e << 10) | Math.round(m / 8192);
}
const b8 = (x) => Math.max(-127, Math.min(127, Math.round(x * 127)));

export function encode(mb) {
  const n = mb.v.length;
  const vb = Buffer.alloc(n * 36);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  mb.v.forEach((v, k) => {
    const o = k * 36, p = L(v.p), nn = L(v.n), t = L(v.t);
    for (let a = 0; a < 3; a++) { vb.writeFloatLE(p[a], o + a * 4); min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
    vb.writeInt8(b8(t[0]), o + 12); vb.writeInt8(b8(t[1]), o + 13); vb.writeInt8(b8(t[2]), o + 14); vb.writeInt8(-127, o + 15);
    vb.writeInt8(b8(nn[0]), o + 16); vb.writeInt8(b8(nn[1]), o + 17); vb.writeInt8(b8(nn[2]), o + 18); vb.writeInt8(127, o + 19);
    const hu = toHalf(v.uv[0]), hv = toHalf(v.uv[1]);
    vb.writeUInt16LE(hu, o + 20); vb.writeUInt16LE(hv, o + 22); vb.writeUInt16LE(hu, o + 24); vb.writeUInt16LE(hv, o + 26);
    for (let a = 0; a < 4; a++) vb.writeUInt16LE(0x3c00, o + 28 + a * 2);
  });
  const big = n > 65535;
  const ib = Buffer.alloc(mb.idx.length * (big ? 4 : 2));
  // The sim draws a triangle only from the side where it runs CLOCKWISE (all 139,708 of the author's triangles do; v8 went in CCW and
  // only the back faces showed), so each CCW triangle (a, b, c) of the builder is written as (a, c, b).
  mb.idx.forEach((_, k) => {
    const x = mb.idx[k - (k % 3) + [0, 2, 1][k % 3]];
    big ? ib.writeUInt32LE(x, k * 4) : ib.writeUInt16LE(x, k * 2);
  });
  return { vb, ib, count: n, indexCount: mb.idx.length, indexType: big ? 5125 : 5123, min, max, triangles: mb.idx.length / 3 };
}

/** Appends an encoded mesh to the glTF (new bufferViews/accessors/mesh on buffer 0) and to the growing binary chunk list. */
export function addMesh(gltf, chunks, state, name, materialIndex, mb) {
  const e = encode(mb);
  const align = () => { const pad = (4 - (state.length % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); state.length += pad; } };
  align();
  const vView = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: state.length, byteLength: e.vb.length, byteStride: 36, target: 34962 });
  chunks.push(e.vb); state.length += e.vb.length;
  align();
  const iView = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: state.length, byteLength: e.ib.length, target: 34963 });
  chunks.push(e.ib); state.length += e.ib.length;
  const acc = (o) => { gltf.accessors.push(o); return gltf.accessors.length - 1; };
  const attributes = {
    POSITION: acc({ bufferView: vView, byteOffset: 0, componentType: 5126, count: e.count, type: 'VEC3', min: e.min, max: e.max }),
    TANGENT: acc({ bufferView: vView, byteOffset: 12, componentType: 5120, count: e.count, type: 'VEC4' }),
    NORMAL: acc({ bufferView: vView, byteOffset: 16, componentType: 5120, count: e.count, type: 'VEC4' }),
    TEXCOORD_0: acc({ bufferView: vView, byteOffset: 20, componentType: 5122, count: e.count, type: 'VEC2' }),
    TEXCOORD_1: acc({ bufferView: vView, byteOffset: 24, componentType: 5122, count: e.count, type: 'VEC2' }),
    COLOR_0: acc({ bufferView: vView, byteOffset: 28, componentType: 5123, count: e.count, type: 'VEC4' }),
  };
  const indices = acc({ bufferView: iView, byteOffset: 0, componentType: e.indexType, count: e.indexCount, type: 'SCALAR' });
  gltf.meshes.push({ name, primitives: [{ attributes, indices, material: materialIndex, mode: 4, extras: { ASOBO_primitive: { PrimitiveCount: e.triangles, VertexType: 'VTX', VertexVersion: 2 } } }] });
  return { mesh: gltf.meshes.length - 1, vertices: e.count, triangles: e.triangles };
}

// ---------- atlas (shelf packing; the painter draws what each cell describes) ----------
export class Atlas {
  constructor(size = 2048) { this.size = size; this.cells = {}; this.x = 0; this.y = 0; this.row = 0; }
  add(name, w, h, spec) {
    if (this.cells[name]) return this.cells[name].rect;
    if (this.x + w > this.size) { this.x = 0; this.y += this.row; this.row = 0; }
    if (this.y + h > this.size) throw new Error(`atlas full at ${name}`);
    const rect = [this.x, this.y, w, h];
    this.cells[name] = { name, rect, ...spec };
    this.x += w; this.row = Math.max(this.row, h);
    return rect;
  }
  toJSON() { return { size: this.size, cells: Object.values(this.cells) }; }
}
