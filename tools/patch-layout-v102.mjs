// One-off edit of wt21-layout.json for v10.2 (kept for the record): the F27 tablet (user: "o próximo passo seria adicionar um Tablet ...
// ter o nosso na forma que achar melhor"; SimBrief import asked for on the way). A 10.9" class tablet, landscape, on an arm from the
// captain's LEFT side wall, its screen facing the captain's eye:
//  * unit TAB1: 1280 x 800 touchscreen page (plugin-wt21 tablet\, F27WT21\Tablet\F27Tablet.html) on [VCockpit07], screen 0.2224 x 0.139 m
//    (16:10) in a 0.2465 x 0.1665 x 0.0068 m rounded body; `touch` puts the Collision tag on its screen material;
//  * where (tools\panelmap probes, 2026-10-23): the side wall above the side console is at x 0.963 (z 8.5) .. 0.946 (z 8.6) for
//    y 0.45..0.55, the side console top at y 0.15, the window sill at y ~0.6. Tablet centre (0.80, 0.50, 8.56), facing the eye
//    (0.5, 0.807, 8.4545); arm from the puck on its back to a base plate on the wall at (0.947, 0.50, 8.559), the plate's face 6 mm
//    inboard of the wall (wall normal (-0.9855, 0, -0.1695): the wall slants inboard going forward).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (L.units.some((u) => u.id === 'TAB1')) throw new Error('already patched (TAB1)');

const centre = [0.80, 0.50, 8.56], eye = [0.5, 0.807, 8.4545];
const d = eye.map((v, k) => v - centre[k]), len = Math.hypot(...d);
const r4 = (v) => Math.round(v * 10000) / 10000;
Object.assign(L.colors, { tabletCase: [40, 42, 46], tabletGlass: [7, 8, 10], tabletMount: [26, 27, 29] });
L.units.push({
  id: 'TAB1',
  node: 'WT21_TAB1_screen',
  material: '$gaugesF27tablet',
  vcockpit: 7,
  gauge: 'F27WT21/Tablet/F27Tablet.html',
  page: [1280, 800],
  screen: { center: [0, 0], size: [0.2224, 0.139] },
  plate: { center: [0, 0], size: [0.2465, 0.1665] },
  plateZ: 9,
  screenZ: 8.9994,
  backZ: 9.0068,
  touch: true,
  tablet: {
    radius: 0.011,
    puckRadius: 0.022,
    puckDepth: 0.008,
    arm: { to: [0.947, 0.5, 8.559], radius: 0.0065, base: [0.05, 0.07, 0.006], wallNormal: [-0.9855, 0, -0.1695] },
  },
  mount: { origin: centre, normal: d.map((v) => r4(v / len)), up: [0, 1, 0] },
  _comment: 'v10.2: the F27 tablet on an arm from the captain\'s left side wall, facing the captain (see tools\\patch-layout-v102.mjs).',
});
L._comment_v102 = 'v10.2: F27 tablet (TAB1, touchscreen, SimBrief OFP import and route to the FMS, ground services, summary).';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: TAB1 at ${centre.join(', ')} facing ${L.units.at(-1).mount.normal.join(', ')}`);
