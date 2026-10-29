// Preview aid for the v10.3 folding tablet: a copy of the WT21 interior glTF in which the named animations stand at their LAST key (the
// tablet folded against the wall: L:F27TAB_Stowed = 1 plays the fold to its end), so a render can be compared with the rest pose. Works
// for translation (VEC3) and rotation (VEC4) channels. The .bin is copied next to it (dump_geometry.mjs reads <name>.bin).
// v10.7: `--frame N` stands them at frame N instead (24 frames a second, linear keys interpolated, past the end = the last key): the
// author's gear animations are 200 frames long, Asobo's convention (0-100 retraction, 100-200 the strut compressing), but his templates
// play only GEAR ANIMATION POSITION, 0-100, so parked on the ground the gear stands at frame 100, not at its last key.
// Usage: node make_fold_demo.mjs <wt21 gltf> <out dir> [--frame N] ANIM [ANIM ...]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const args = process.argv.slice(2);
const fi = args.indexOf('--frame');
const frame = fi >= 0 ? Number(args.splice(fi, 2)[1]) : null;
const [src, outDir, ...picked] = args;
if (frame !== null && !(frame >= 0)) throw new Error('--frame needs a number');
const g = JSON.parse(readFileSync(src, 'utf8'));
const bin = readFileSync(join(dirname(src), g.buffers[0].uri));
mkdirSync(outDir, { recursive: true });
/** The rows of an accessor (n floats each). */
const rows = (ai, n) => {
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], stride = bv.byteStride || 4 * n;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (__, k) => bin.readFloatLE(base + stride * i + 4 * k)));
};
/**
 * A channel's value at time t (s), held before the first key and after the last: linear between keys (rotations normalised), or the
 * cubic Hermite curve of CUBICSPLINE keys (their output rows are in-tangent, value, out-tangent per key; v10.7: the old "last key"
 * read the last row, an out-tangent, for those).
 */
function sample(times, out, t, rotation, interpolation) {
  const cubic = interpolation === 'CUBICSPLINE';
  const value = (i) => (cubic ? out[3 * i + 1] : out[i]);
  const norm = (v) => {
    if (!rotation) return v;
    const len = Math.hypot(...v);
    return v.map((x) => x / len);
  };
  if (t <= times[0]) return value(0);
  if (t >= times[times.length - 1]) return value(times.length - 1);
  const i = times.findIndex((x) => x > t) - 1;
  if (interpolation === 'STEP') return value(i);
  const d = times[i + 1] - times[i], s = (t - times[i]) / d, a = value(i), b = value(i + 1);
  if (cubic) {
    const m0 = out[3 * i + 2], m1 = out[3 * (i + 1)], s2 = s * s, s3 = s2 * s;
    return norm(a.map((p0, k) => (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * d * m0[k] + (-2 * s3 + 3 * s2) * b[k] + (s3 - s2) * d * m1[k]));
  }
  const b2 = rotation && a.reduce((acc, v, k) => acc + v * b[k], 0) < 0 ? b.map((v) => -v) : b;   // the short way round
  return norm(a.map((x, k) => x + (b2[k] - x) * s));
}
for (const name of picked) {
  const an = (g.animations || []).find((a) => a.name === name);
  if (!an) throw new Error(`no animation ${name}`);
  for (const ch of an.channels) {
    const s = an.samplers[ch.sampler], rot = ch.target.path === 'rotation';
    const times = rows(s.input, 1).map((r) => r[0]), values = rows(s.output, rot ? 4 : 3);
    const node = g.nodes[ch.target.node];
    const v = sample(times, values, frame === null ? Infinity : frame / 24, rot, s.interpolation);
    console.log(`${name} ${ch.target.path}: ${(node[ch.target.path] || []).map((x) => x.toFixed(4)).join(', ')} -> ${v.map((x) => x.toFixed(4)).join(', ')}`);
    node[ch.target.path] = v;
  }
}
const out = join(outDir, basename(src));
copyFileSync(join(dirname(src), g.buffers[0].uri), out.replace(/\.gltf$/i, '.bin'));
g.buffers[0].uri = basename(out).replace(/\.gltf$/i, '.bin');
writeFileSync(out, JSON.stringify(g));
console.log(`wrote ${out}`);
