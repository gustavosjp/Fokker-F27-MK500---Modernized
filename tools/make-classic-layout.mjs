// v10.8 (user: a Classic variation, "no modo Clássico, a única coisa nossa que entra é o Tablet"): the WT21 layout reduced to its
// tablet unit, for make-g1000-interior.mjs (F27_WT21_LAYOUT) and controls-xml.mjs. No screens but the tablet's, no panels, nothing of the
// author's cockpit hidden or moved; the control sets and colours stay as they are, because they alone decide the shared 3D hardware
// atlas (F27WT21_HW.PNG.DDS): the same cells at the same places as for the WT21, which scaffold.ps1 checks.
// Usage: node make-classic-layout.mjs <wt21-layout.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , srcPath, outPath] = process.argv;
if (!outPath) { console.error('usage: node make-classic-layout.mjs <wt21-layout.json> <out.json>'); process.exit(2); }
const layout = JSON.parse(readFileSync(srcPath, 'utf8'));
const units = layout.units.filter((u) => u.tablet);
if (units.length !== 1) throw new Error(`expected one tablet unit in ${srcPath}, found ${units.length}`);
const classic = { ...layout, units, panels: [], move: [], copies: [], hide: {}, keepVisible: {} };
writeFileSync(outPath, JSON.stringify(classic, null, 1));
console.log(`classic layout: ${units.map((u) => u.id).join(', ')} only -> ${outPath}`);
