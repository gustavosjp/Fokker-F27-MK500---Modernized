// Survey of node scales in a glTF: how many nodes carry a scale, and how many of those are non-uniform (incl. z).
// Also prints the UV corners of a named quad (default AS530_screen) to know its texture orientation.
// Usage: node scale_survey.mjs <gltf> [quad node name]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , path, quadName = 'AS530_screen'] = process.argv;
const g = JSON.parse(readFileSync(path, 'utf8'));
let scaled = 0, nonUniform = 0;
const examples = [];
for (const n of g.nodes) {
  if (!n.scale) continue;
  scaled++;
  const [a, b, c] = n.scale.map(Math.abs);
  if (Math.max(a, b, c) / Math.min(a, b, c) > 1.01) {
    nonUniform++;
    if (examples.length < 12) examples.push(`${n.name} [${n.scale.map((v) => v.toFixed(3)).join(', ')}]`);
  }
}
console.log(`${g.nodes.length} nodes, ${scaled} with a scale, ${nonUniform} non-uniform`);
for (const e of examples) console.log('  ' + e);

const qn = g.nodes.find((n) => n.name === quadName);
if (qn) {
  const bin = readFileSync(join(dirname(path), g.buffers[0].uri));
  const prim = g.meshes[qn.mesh].primitives[0];
  const acc = (i) => { const a = g.accessors[i], bv = g.bufferViews[a.bufferView]; return { a, base: (bv.byteOffset || 0) + (a.byteOffset || 0), stride: bv.byteStride || 0 }; };
  const P = acc(prim.attributes.POSITION), T = acc(prim.attributes.TEXCOORD_0);
  const half = (h) => { const s = h >> 15 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15); };
  console.log(`${quadName}: node translation ${qn.translation} rotation ${qn.rotation} scale ${qn.scale}; TEXCOORD_0 componentType ${T.a.componentType}`);
  for (let k = 0; k < P.a.count; k++) {
    const o = P.base + k * P.stride, t = T.base + k * T.stride;
    const uv = T.a.componentType === 5126 ? [bin.readFloatLE(t), bin.readFloatLE(t + 4)] : [half(bin.readUInt16LE(t)), half(bin.readUInt16LE(t + 2))];
    console.log(`  v${k}: pos ${[0, 4, 8].map((d) => bin.readFloatLE(o + d).toFixed(4)).join(', ')}  uv ${uv.map((v) => v.toFixed(3)).join(', ')}`);
  }
}
