// Builds the render_preview.py layout JSONs from tools/wt21-layout.json (so the preview always matches what the package builds).
// Usage: node make_preview_layout.mjs <wt21-layout.json> <hide.json from expand-hide.mjs> <outDir>
// Writes <outDir>/final_front.json (ortho, straight on), final_pilot.json (captain's eye), final_pilot_before.json (same view, nothing changed),
// final_gps.json (close look at the GPS 530 spot from the captain's eye).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [, , layoutPath, hidePath, outDir] = process.argv;
if (!layoutPath || !hidePath || !outDir) { console.error('usage: node make_preview_layout.mjs <layout.json> <hide.json> <outDir>'); process.exit(2); }
const L = JSON.parse(readFileSync(layoutPath, 'utf8'));
const H = JSON.parse(readFileSync(hidePath, 'utf8'));
mkdirSync(outDir, { recursive: true });

// plate = the dark textured quad behind each screen (drawn as a thin box), screen = the WT21 page (synthetic image when textured)
const plateRgb = L.plateRgb.map((c) => c / 255);
const ctrlPng = (set) => `C:/Projetos/f27-g1000/tools/panelmap/out/ctrl/${L.controlSets[set].texture.replace('.PNG.DDS', '.png')}`;   // from make-control-textures.py
// plates/panels are closed boxes from their front face back to the panel (as built); moved groups with a 'box' get four thin walls
const face = L.panelFaceZ ?? 9.17;
const boxOf = (front, back) => ({ z: (front + back) / 2, depth: Math.max(back - front, 0.0005) });
const bezels = [
  ...L.units.map((u) => { const b = boxOf(u.plateZ ?? L.plateZ, u.backZ ?? face); return { name: `${u.id}_plate`, center: [u.plate.center[0], u.plate.center[1], b.z], size: u.plate.size, color: plateRgb, depth: b.depth, ...(u.controls ? { image: ctrlPng(u.controls) } : {}) }; }),
  ...(L.panels || []).map((p) => { const b = boxOf(p.z, p.backZ ?? face); return { name: p.node, center: [p.center[0], p.center[1], b.z], size: p.size, color: plateRgb, depth: b.depth, image: ctrlPng(p.controls) }; }),
];
for (const m of L.move || []) {
  if (!m.box) continue;
  const [x0, y0, x1, y1] = m.box, s = m.scale;
  const cx = m.to[0] + s * ((x0 + x1) / 2 - m.from[0]), cy = m.to[1] + s * ((y0 + y1) / 2 - m.from[1]), w = s * (x1 - x0), h = s * (y1 - y0);
  const b = boxOf(9.163 + (m.dz ?? 0), face), t = 0.0008;
  bezels.push({ name: `${m.id}_wt`, center: [cx, cy + h / 2, b.z], size: [w, t], color: plateRgb, depth: b.depth });
  bezels.push({ name: `${m.id}_wb`, center: [cx, cy - h / 2, b.z], size: [w, t], color: plateRgb, depth: b.depth });
  bezels.push({ name: `${m.id}_wl`, center: [cx + w / 2, cy, b.z], size: [t, h], color: plateRgb, depth: b.depth });
  bezels.push({ name: `${m.id}_wr`, center: [cx - w / 2, cy, b.z], size: [t, h], color: plateRgb, depth: b.depth });
}
const screens = L.units.map((u) => ({ name: u.node, center: [u.screen.center[0], u.screen.center[1], u.screenZ ?? L.screenZ], size: u.screen.size, color: [0.1, 0.3, 0.75],
  image: `C:/Projetos/f27-g1000/tools/panelmap/out/pages/${u.page[0] === u.page[1] ? 'cdu' : 'page'}.png` }));
const base = { dump: 'C:/Projetos/f27-g1000/tools/panelmap/out/interior', hilite_prefixes: [], moves: L.move || [] };
const eye = [0.5, 0.807, 8.4545];

const views = {
  final_front: { ...base, eye: [0, 0.4, 7], look_at: [0, 0.4, 9.17], fov_deg: 62, res: [1900, 760], ortho: true, ortho_scale: 1.9, clip_start: 2, hide_prefixes: ['x0_Struct_PanelMain', ...H.all], bezels, screens },
  final_pilot: { ...base, eye, look_at: [0.0, 0.5, 9.17], fov_deg: 85, res: [1900, 900], hide_prefixes: H.all, bezels, screens },
  final_pilot_before: { ...base, eye, look_at: [0.0, 0.5, 9.17], fov_deg: 85, res: [1900, 900], hide_prefixes: [], bezels: [], screens: [] },
  final_gps: { ...base, eye, look_at: [0.0, 0.76, 9.1], fov_deg: 35, res: [1400, 900], hide_prefixes: H.all, bezels, screens },
  final_gps_before: { ...base, eye, look_at: [0.0, 0.76, 9.1], fov_deg: 35, res: [1400, 900], hide_prefixes: [], bezels: [], screens: [] },
};
const TEX_SKIP = ['Occluder', 'Collision', 'int_Glass_Gauge', 'int_Glass_ApBtn', 'int_Glass_Visor', 'WINDSHIELD', 'WINDSHIELD.001', 'FROST_blast_i', 'FROST_melt_i', 'ext_Prop_disc_i'];
for (const camFile of process.argv.slice(5)) {   // extra args: *_camera.json files from solve_camera.py -> textured views from those cameras
  const cam = JSON.parse(readFileSync(camFile, 'utf8'));
  const tag = camFile.replace(/^.*[\/]/, '').replace('_camera.json', '');
  const common = { ...base, textured: true, skip_materials: TEX_SKIP, eye: cam.eye, look_at: cam.look_at, fov_deg: cam.fov_deg, roll_deg: cam.roll_deg, res: cam.res, clip_start: 0.05 };
  views[`tex_${tag}`] = { ...common, hide_prefixes: H.all, bezels, screens };
  views[`tex_${tag}_before`] = { ...common, hide_prefixes: [], bezels: [], screens: [] };
}
for (const [name, v] of Object.entries(views)) writeFileSync(`${outDir}/${name}.json`, JSON.stringify(v, null, 1));
console.log('wrote', Object.keys(views).join(', '));
