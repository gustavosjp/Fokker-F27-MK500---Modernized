// One-off edit of wt21-layout.json for v10.3 (kept for the record). User after the first tablet test: "ao clicar em alguma borda
// movimentar ele, porque ele tá tapando alguns instrumentos". The tablet now folds away: its arm swings `swingDeg` about the vertical
// at the wall base (negative = aft) and the tablet turns flat against the side wall, screen inboard (make-g1000-interior.mjs).
// -95 deg puts the folded tablet 3 cm off the wall, centred about 14 cm aft of the base (z ~8.42), clear of the microphone and the
// window crank further forward; tools\panelmap\check_tablet_fold.mjs checks every in-between pose against the wall.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
const tab = L.units.find((u) => u.id === 'TAB1');
if (!tab || tab.tablet.arm.swingDeg !== undefined) throw new Error('no TAB1, or already patched');
tab.tablet.arm.swingDeg = -95;
L._comment_v103 = 'v10.3: tablet folds away (bezel click / Settings), SimBrief loading (real or instant), avionics on the author\'s instrument circuit 17.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log('layout patched: TAB1 folds', tab.tablet.arm.swingDeg, 'deg');
