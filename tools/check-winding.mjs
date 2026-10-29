// Triangle winding of the VTX meshes in a glTF: the share of triangles that run CLOCKWISE around their stored vertex normal, which is
// the sim's front face (all the author's triangles do; v8's new meshes went in counter-clockwise and only their back faces showed).
// Prints JSON: { author: share, meshes: { <node name>: share } } for the author's meshes and the nodes matching the regex.
//
// Usage: node check-winding.mjs <gltf> [node-name regex, default ^WT21_.*_hw$]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , path, pattern = '^WT21_.*_hw$'] = process.argv;
const g = JSON.parse(readFileSync(path, 'utf8'));
const bin = readFileSync(join(dirname(path), g.buffers[0].uri));
const re = new RegExp(pattern);
const view = (i) => {
  const a = g.accessors[i], bv = g.bufferViews[a.bufferView];
  return { a, base: (bv.byteOffset || 0) + (a.byteOffset || 0), stride: bv.byteStride || 0 };
};

function clockwiseShare(prim) {
  const P = view(prim.attributes.POSITION), N = view(prim.attributes.NORMAL), I = view(prim.indices);
  const pos = (k) => { const o = P.base + k * P.stride; return [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]; };
  const nor = (k) => { const o = N.base + k * N.stride; return [bin.readInt8(o), bin.readInt8(o + 1), bin.readInt8(o + 2)]; };
  const idx = (k) => (I.a.componentType === 5125 ? bin.readUInt32LE(I.base + k * 4) : bin.readUInt16LE(I.base + k * 2));
  let cw = 0, n = 0;
  for (let t = 0; t + 2 < I.a.count; t += 3) {
    const [a, b, c] = [idx(t), idx(t + 1), idx(t + 2)];
    const A = pos(a), B = pos(b), C = pos(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cr) < 1e-12) continue;   // degenerate
    const na = nor(a), nb = nor(b), nc = nor(c);
    const d = cr[0] * (na[0] + nb[0] + nc[0]) + cr[1] * (na[1] + nb[1] + nc[1]) + cr[2] * (na[2] + nb[2] + nc[2]);
    n++; if (d < 0) cw++;
  }
  return { cw, n };
}

const out = { author: 0, meshes: {} };
let aCw = 0, aN = 0;
for (const node of g.nodes) {
  if (node.mesh === undefined) continue;
  const prim = g.meshes[node.mesh].primitives[0];
  if (prim.extras?.ASOBO_primitive?.VertexType !== 'VTX') continue;
  const { cw, n } = clockwiseShare(prim);
  if (re.test(node.name)) out.meshes[node.name] = n ? cw / n : 0;
  else if (!/^(WT21_|F27WT21_|F27_WT21_)/.test(node.name)) { aCw += cw; aN += n; }
}
out.author = aN ? aCw / aN : 0;
console.log(JSON.stringify(out));
