// Extracts world-space triangles of every mesh node of an MSFS "optimized" interior glTF into two files Blender can load with numpy:
//   <out>.json  : [{name, material, vOffset, vCount, iOffset, iCount}]   (offsets in elements of the .bin arrays)
//   <out>.bin   : float32 positions (x,y,z in glTF space) followed by uint32 triangle indices (per-node, local to its own vertices)
//   <out>.uv.bin: float32 TEXCOORD_0 (u,v) per vertex, same order as the positions (0,0 when a primitive has none); the json gives each
//                 primitive's base-colour image (`tex`) and alpha mode, for the textured preview (render_preview.py "textured": true)
// MSFS "optimized" glTF stores TEXCOORD_0 as half floats in a SHORT (5122) accessor; they are decoded here.
// Why: Blender's glTF importer fails on this format (NORMAL/TANGENT stored as 4-component bytes, half-float colours), so the
// geometry is read straight from the buffer: POSITION is plain float32 VEC3, indices are uint16/uint32 SCALAR.
// Usage: node dump_geometry.mjs <interior.gltf> <outPrefix>
import { readFileSync, writeFileSync } from 'node:fs';
const [, , gltfPath, outPrefix] = process.argv;
const j = JSON.parse(readFileSync(gltfPath, 'utf8'));
const bin = readFileSync(gltfPath.replace(/\.gltf$/i, '.bin'));

const parent = new Map();
j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));

// column-major 4x4 helpers
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const r = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) r[c * 4 + rr] *= s[c];
  r[12] = t[0]; r[13] = t[1]; r[14] = t[2];
  return r;
}
const cache = new Map();
function worldMatrix(i) {
  if (cache.has(i)) return cache.get(i);
  const p = parent.get(i);
  const m = p === undefined ? trs(j.nodes[i]) : mul(worldMatrix(p), trs(j.nodes[i]));
  cache.set(i, m);
  return m;
}
function half(h) {   // IEEE 754 binary16 -> number (MSFS stores UVs this way in SHORT accessors)
  const sgn = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return sgn * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : sgn * Infinity;
  return sgn * Math.pow(2, e - 15) * (1 + f / 1024);
}
function readAccessor(ai) {
  const a = j.accessors[ai], bv = j.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1 }[a.componentType];
  const stride = bv.byteStride || size * n;
  const out = new Array(a.count * n);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
    const p = base + i * stride + k * size;
    out[i * n + k] = a.componentType === 5126 ? bin.readFloatLE(p) : a.componentType === 5125 ? bin.readUInt32LE(p) : a.componentType === 5123 ? bin.readUInt16LE(p) : a.componentType === 5122 ? half(bin.readUInt16LE(p)) : bin.readUInt8(p);
  }
  return out;
}

const meta = [];
const positions = [];
const uvs = [];
const imageOf = (ti) => { const t = j.textures?.[ti]; const src = t?.extensions?.MSFT_texture_dds?.source ?? t?.source; return src === undefined ? '' : j.images[src].uri; };
const indices = [];
j.nodes.forEach((node, i) => {
  if (node.mesh === undefined) return;
  const m = worldMatrix(i);
  for (const prim of j.meshes[node.mesh].primitives) {
    if (prim.mode !== undefined && prim.mode !== 4) continue;
    const p = readAccessor(prim.attributes.POSITION);
    const idx = prim.indices !== undefined ? readAccessor(prim.indices) : null;
    if (!idx) continue;
    const vOffset = positions.length / 3;
    for (let v = 0; v < p.length; v += 3) {
      const x = p[v], y = p[v + 1], z = p[v + 2];
      positions.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    }
    const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(prim.attributes.TEXCOORD_0) : null;
    for (let v = 0; v < p.length / 3; v++) uvs.push(uv ? uv[v * 2] : 0, uv ? uv[v * 2 + 1] : 0);
    const iOffset = indices.length;
    // Asobo "optimized" meshes: all primitives of a mesh share ONE index accessor, each primitive owning the slice
    // [StartIndex, StartIndex + 3 * PrimitiveCount) of it (found 2026-10-19; before that every material was drawn over the whole mesh)
    const ap = prim.extras?.ASOBO_primitive;
    const start = ap?.StartIndex ?? 0, count = ap?.PrimitiveCount !== undefined ? ap.PrimitiveCount * 3 : idx.length - start, base = ap?.BaseVertexIndex ?? 0;
    for (let k = start; k < start + count && k < idx.length; k++) indices.push(idx[k] + base);
    const mat = j.materials[prim.material] || {};
    const btex = mat.pbrMetallicRoughness?.baseColorTexture;
    meta.push({ node: i, name: node.name, material: mat.name ?? '', tex: btex ? imageOf(btex.index) : '', alpha: mat.alphaMode ?? 'OPAQUE', color: mat.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1], vOffset, vCount: p.length / 3, iOffset, iCount: indices.length - iOffset });
  }
});
const pf = new Float32Array(positions);
const iu = new Uint32Array(indices);
writeFileSync(outPrefix + '.bin', Buffer.concat([Buffer.from(pf.buffer), Buffer.from(iu.buffer)]));
writeFileSync(outPrefix + '.uv.bin', Buffer.from(new Float32Array(uvs).buffer));
writeFileSync(outPrefix + '.json', JSON.stringify({ vertexFloats: pf.length, indexCount: iu.length, prims: meta }));
console.log(`prims: ${meta.length}, vertices: ${pf.length / 3}, triangles: ${iu.length / 3}`);
