// Union bounding boxes (world space, from out/interior.*) of node-name prefix groups, to size bezels and choose what to hide.
import { readFileSync } from 'node:fs';
const meta = JSON.parse(readFileSync('out/interior.json', 'utf8'));
const b = readFileSync('out/interior.bin');
const f = new Float32Array(b.buffer, b.byteOffset, meta.vertexFloats);
function box(prefixes) {
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], n = 0; const names = new Set();
  for (const p of meta.prims) {
    if (!prefixes.some((q) => p.name === q || p.name.startsWith(q + '_') || p.name.startsWith(q + '.'))) continue;
    n++; names.add(p.name);
    for (let v = p.vOffset; v < p.vOffset + p.vCount; v++) for (let k = 0; k < 3; k++) { const x = f[v * 3 + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
  }
  return n ? { n, names: [...names].length, x: [mn[0], mx[0]].map((v) => +v.toFixed(3)), y: [mn[1], mx[1]].map((v) => +v.toFixed(3)), z: [mn[2], mx[2]].map((v) => +v.toFixed(3)) } : null;
}
const groups = {
  'cpt IAS': ['x0_IAS_01'], 'cpt VOR': ['x0_VOR_01'], 'cpt ADI': ['x0_ADI_01'], 'cpt HSI': ['x0_HSI_01'], 'cpt ALTI': ['x0_ALTI_01'], 'cpt RALT': ['x0_RALT_01'],
  'cpt VSI': ['x0_VSI_01'], 'cpt Cadre_ias': ['x0_Cadre_ias01'], 'cpt StructCadres.003': ['x0_Struct_Cadres.003'],
  'fo IAS': ['x0_IAS_02'], 'fo VOR': ['x0_VOR_02'], 'fo ADI': ['x0_ADI_02'], 'fo HSI': ['x0_HSI_02'], 'fo ALTI': ['x0_ALTI_02'], 'fo RALT': ['x0_RALT_02'],
  'fo VSI': ['x0_VSI_02'], 'fo Cadre_ias': ['x0_Cadre_ias02'],
  'standby horizon': ['x0_HorizSec'], 'clock': ['x0_Clock_01'], 'clock2': ['x0_Clock_02'],
};
for (const [k, v] of Object.entries(groups)) { const r = box(v); console.log(k.padEnd(20), r ? `x ${r.x.join('..')}  y ${r.y.join('..')}  z ${r.z.join('..')}  (${r.n} prims)` : '--'); }
const cpt = box(['x0_IAS_01', 'x0_VOR_01', 'x0_ADI_01', 'x0_HSI_01', 'x0_ALTI_01', 'x0_RALT_01', 'x0_Cadre_ias01', 'x0_Struct_Cadres.003']);
const fo = box(['x0_IAS_02', 'x0_VOR_02', 'x0_ADI_02', 'x0_HSI_02', 'x0_ALTI_02', 'x0_RALT_02', 'x0_Cadre_ias02']);
console.log('UNION captain flight group:', JSON.stringify(cpt));
console.log('UNION copilot flight group:', JSON.stringify(fo));
// any other node names starting with the 02 side that exist, to find frames/structs of the copilot block
const near = new Set(meta.prims.map((p) => p.name).filter((n) => /Struct_Cadres|Cadre_/.test(n)));
console.log('cadre-like names:', [...near].join(', '));
