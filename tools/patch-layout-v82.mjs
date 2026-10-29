// One-off edit of wt21-layout.json for v8.2 (kept for the record, like the earlier patch scripts):
//  * PFD1/PFD2/MFD1: portrait screens on 768x1024 pages, the WT21 display unit's own page (its PFD layout is centred on x = 384 px);
//    the landscape 1024x768 page stretched the picture sideways (test 8). Same 0.165 x 0.22 m area as before, turned upright.
//  * MFD1 screen lowered to clear the FCP; its side keys/knobs moved in next to the narrower frame.
//  * lamp expressions on the FCP mode keys (WT21 writes these standard autopilot variables), lit colour for the lamp bars.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
// rewriting must not change anything but this patch: the file is JSON.stringify(…, null, 2) apart from "0.0"/"1.0" written as such
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}

L.colors.lampOn = [120, 255, 150];
for (const u of L.units) {
  if (!['PFD1', 'PFD2', 'MFD1'].includes(u.id)) continue;
  u.page = [768, 1024];
  u.screen.size = [0.165, 0.22];
}
const mfd = L.units.find((u) => u.id === 'MFD1');
mfd.screen.center = [0, 0.355];
// side controls of the MFD insert: left column 0.08 to the right, right column 0.08 to the left (frame is 0.055 narrower)
for (const c of L.controlSets.mfd.controls) {
  const du = c.rect[0] < 0.5 ? 0.08 : -0.08;
  c.rect = [c.rect[0] + du, c.rect[1], c.rect[2] + du, c.rect[3]].map((v) => Math.round(v * 10000) / 10000);
}
const lampOf = {
  NAV: '(A:AUTOPILOT NAV1 LOCK, Bool)',
  HDG: '(A:AUTOPILOT HEADING LOCK, Bool)',
  APPR: '(A:AUTOPILOT APPROACH ACTIVE, Bool) (A:AUTOPILOT APPROACH HOLD, Bool) or',
  BC: '(A:AUTOPILOT BACKCOURSE HOLD, Bool)',
  FLC: '(A:AUTOPILOT FLIGHT LEVEL CHANGE, Bool)',
  VS: '(A:AUTOPILOT VERTICAL HOLD, Bool)',
  ALT: '(A:AUTOPILOT ALTITUDE LOCK, Bool)',
  AP: '(A:AUTOPILOT MASTER, Bool)',
  YD: '(A:AUTOPILOT YAW DAMPER, Bool)',
};
for (const c of L.controlSets.fcp.controls) {
  if (lampOf[c.name]) { c.lamp = lampOf[c.name]; c.light = true; }
}
L._comment_v82 = 'v8.2 (test 8): portrait 768x1024 pages and screens for PFD1/PFD2/MFD1; `lamp` = visibility expression of the key\'s lit lamp bar.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log('layout patched');
