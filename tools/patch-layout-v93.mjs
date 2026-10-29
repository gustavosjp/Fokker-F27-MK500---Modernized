// One-off edit of wt21-layout.json for v9.3 (kept for the record). Test 10: "os switches que voltaram precisam ter o mesmo desenho e
// dizeres da outra versão": the moved AP servo switches get the ORIGINAL panel art, copied from the author's model (make-g1000-interior
// `copies`), all with the switches' offset (x -0.128, y +0.0128, z -0.010) so they sit on it as they did before:
//  * servo_face: the black plate with "INTERRUPTEURS / PA", "DIR.", "ROULIS", "PROF.", "TRIM" and its four screws is painted on the
//    pedestal top (x0_Struct_Ped, material int_VC30_Front, y 0.1337, x 0.0714..0.1814, z 8.7891..8.8904): a quad with the same material
//    and the face's own (affine) UV mapping.
//  * servo_parts: the hexagonal switch nuts (x0_Struct_Cadres) and the two light posts (x0_Struct_PlotsLum) inside that plate.
//  * SERVOPA becomes the plain dark block under the copied face (face 0.5 mm below it, no legends of its own).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (L.copies) throw new Error('already patched');

const off = [-0.128, 0.0128, -0.010];
const rect = [0.0714, 0.1814, 8.7891, 8.8904], faceY = 0.1337;
L.copies = [
  { id: 'servo_face', type: 'face', node: 'x0_Struct_Ped', material: 'int_VC30_Front', rect, y: faceY, offset: off },
  { id: 'servo_parts', type: 'triangles', nodes: ['x0_Struct_Cadres', 'x0_Struct_PlotsLum'], box: [0.078, rect[1], 0.130, 0.165, rect[2], rect[3]], offset: off },
];
const mv = L.move.find((m) => m.id === 'ap_servo_switches');
mv.to = [0.128 + off[0], 0.136 + off[1]];
mv.dz = off[2];
const W = +(rect[1] - rect[0]).toFixed(4), H = +(rect[3] - rect[2]).toFixed(4);
const top = +(faceY + off[1] - 0.0005).toFixed(4);
L.controlSets.servo_pa = { style: '3d', size: [W, H], face: 'module', color: [24, 24, 27], labels: [], controls: [] };
const p = L.panels.find((q) => q.id === 'SERVOPA');
Object.assign(p, {
  size: [W, H], backZ: +(9.0 + (top - 0.1337)).toFixed(4),
  mount: { origin: [+((rect[0] + rect[1]) / 2 + off[0]).toFixed(5), top, +((rect[2] + rect[3]) / 2 + off[2]).toFixed(5)], normal: [0, 1, 0], up: [0, 0, 1] },
  _comment: 'v9.3: dark block under the copied original servo-panel face (copies.servo_face), its face 0.5 mm below it.',
});
L._comment_v93 = 'v9.3: original servo-panel art copied with the switches (copies); WT21 runs the TAPIR-mode-free copy of the systems WASM.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: copies servo_face + servo_parts, switches to y ${mv.to[1]}, SERVOPA block ${W} x ${H} under the face`);
