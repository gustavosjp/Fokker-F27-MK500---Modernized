// Samples the texture coordinates of an author's mesh on a horizontal face (y ~ const, normal up) at given (x, z) points: finds the
// containing triangle in each primitive of the node and interpolates UV0 / UV1 barycentrically. Also prints the node transforms.
// Usage: node sample_face_uv.mjs <gltf> <node> <y> "x,z" ...
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , path, nodeName, yStr, ...pts] = process.argv;
const y0 = Number(yStr);
const g = JSON.parse(readFileSync(path, 'utf8'));
const bin = readFileSync(join(dirname(path), g.buffers[0].uri));
const ni = g.nodes.findIndex((n) => n.name === nodeName);
const node = g.nodes[ni];
const parent = g.nodes.findIndex((n) => (n.children || []).includes(ni));
console.log(`${nodeName}: T ${node.translation} R ${node.rotation} S ${node.scale} parent ${parent < 0 ? '-' : g.nodes[parent].name} root ${g.scenes[0].nodes.includes(ni)}`);
const half = (h) => { const s = h >> 15 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15); };
const acc = (i) => { const a = g.accessors[i], bv = g.bufferViews[a.bufferView]; return { a, base: (bv.byteOffset || 0) + (a.byteOffset || 0), stride: bv.byteStride || 0 }; };
const T = node.translation || [0, 0, 0];
const Q = node.rotation || [0, 0, 0, 1];
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const rot = (v) => { const r = qmul(qmul(Q, [v[0], v[1], v[2], 0]), [-Q[0], -Q[1], -Q[2], Q[3]]); return [r[0], r[1], r[2]]; };
for (const [pi, prim] of g.meshes[node.mesh].primitives.entries()) {
  const P = acc(prim.attributes.POSITION), U0 = acc(prim.attributes.TEXCOORD_0), U1 = prim.attributes.TEXCOORD_1 !== undefined ? acc(prim.attributes.TEXCOORD_1) : null, I = acc(prim.indices);
  const pos = (k) => { const o = P.base + k * P.stride; const r = rot([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]); return [r[0] + T[0], r[1] + T[1], r[2] + T[2]]; };
  const uv = (A, k) => { const o = A.base + k * A.stride; return A.a.componentType === 5126 ? [bin.readFloatLE(o), bin.readFloatLE(o + 4)] : [half(bin.readUInt16LE(o)), half(bin.readUInt16LE(o + 2))]; };
  const idx = (k) => (I.a.componentType === 5125 ? bin.readUInt32LE(I.base + k * 4) : bin.readUInt16LE(I.base + k * 2));
  for (const s of pts) {
    const [x, z] = s.split(',').map(Number);
    for (let t = 0; t + 2 < I.a.count; t += 3) {
      const ks = [idx(t), idx(t + 1), idx(t + 2)], A = pos(ks[0]), B = pos(ks[1]), C = pos(ks[2]);
      if ([A, B, C].some((p) => Math.abs(p[1] - y0) > 0.0015)) continue;
      const det = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      if (Math.abs(det) < 1e-14) continue;
      const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / det, l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const mix = (f) => [0, 1].map((d) => l1 * f(ks[0])[d] + l2 * f(ks[1])[d] + l3 * f(ks[2])[d]);
      const a = mix((k) => uv(U0, k)), b = U1 ? mix((k) => uv(U1, k)) : null;
      console.log(`  prim ${pi} (${g.materials[prim.material].name}) at ${s}: uv0 ${a.map((v) => v.toFixed(5))}${b ? ` uv1 ${b.map((v) => v.toFixed(5))}` : ''}  tri ${t / 3}`);
    }
  }
}
