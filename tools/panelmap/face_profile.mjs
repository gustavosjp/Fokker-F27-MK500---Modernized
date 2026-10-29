// Samples the z (depth, toward the pilot = smaller) of the main instrument panel face x0_Struct_PanelMain on a grid, by ray casting along +z
// against its world-space triangles from out/interior.* (see dump_geometry.mjs). Prints z for chosen x columns and y rows, and the local slope.
import { readFileSync } from 'node:fs';
const meta = JSON.parse(readFileSync('out/interior.json', 'utf8'));
const b = readFileSync('out/interior.bin');
const f = new Float32Array(b.buffer, b.byteOffset, meta.vertexFloats);
const idx = new Uint32Array(b.buffer, b.byteOffset + meta.vertexFloats * 4, meta.indexCount);
const tris = [];
for (const p of meta.prims) {
  if (p.name !== 'x0_Struct_PanelMain') continue;
  for (let t = 0; t < p.iCount; t += 3) {
    const v = [0, 1, 2].map((k) => { const vi = p.vOffset + idx[p.iOffset + t + k]; return [f[vi * 3], f[vi * 3 + 1], f[vi * 3 + 2]]; });
    tris.push(v);
  }
}
console.log('panel face triangles:', tris.length);
function zAt(x, y) {
  let best = null;
  for (const [a, bb, c] of tris) {
    const d = (bb[1] - c[1]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bb[1] - c[1]) * (x - c[0]) + (c[0] - bb[0]) * (y - c[1])) / d;
    const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    const z = l1 * a[2] + l2 * bb[2] + l3 * c[2];
    if (best === null || z < best) best = z;
  }
  return best;
}
const xs = [0.60, 0.45, 0.33, 0.15, 0.0, -0.15, -0.33, -0.45, -0.60];
const ys = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65];
console.log('z of the face (m); rows y, columns x =', xs.join(' '));
for (const y of ys) console.log('y=' + y.toFixed(2).padEnd(5), xs.map((x) => { const z = zAt(x, y); return z === null ? '  --  ' : z.toFixed(3); }).join('  '));
// slope: dz/dy at a few x
for (const x of [0.45, 0.0, -0.45]) { const a = zAt(x, 0.25), c = zAt(x, 0.50); if (a !== null && c !== null) console.log('x=' + x, 'dz/dy =', ((c - a) / 0.25).toFixed(3), '=> tilt', (Math.atan((c - a) / 0.25) * 180 / Math.PI).toFixed(1), 'deg'); }
// slope along x (panel wraps around?)
for (const y of [0.30, 0.45]) { const a = zAt(0.6, y), c = zAt(-0.6, y); if (a !== null && c !== null) console.log('y=' + y, 'z(x=+0.6)=', a.toFixed(3), 'z(x=-0.6)=', c.toFixed(3)); }
