// One-off edit of wt21-layout.json for v9.1 (test 9, kept for the record):
//  * CDU "reto" (user: "o FMC assim ficou bem feio, deixar reto"): flat on the pedestal's left block (face up, top forward), flush with
//    the block's side (x 0.192), 11 x 18.5 cm: x 0.082..0.192, z 8.705..8.89, face at y 0.150 (1.6 cm above the top, y 0.1337).
//    Clear of the rudder trim knob (centre x 0.0445, z 8.6735, r ~0.0455: CDU corner at 4.9 cm), of the throttle quadrant's aft face
//    (z >= 8.893), of the condition lever (y >= 0.189) and of the pitch trim wheel (x >= 0.201). Keys re-laid out for 110 x 185 mm.
//  * The blanking plate CDUCOVER goes (the CDU now covers the whole old servo-switch panel).
//  * CRS 1 turns the course of the NAV the CDI uses (AUTOPILOT NAV SELECTED, set by WT21 when the nav source changes): PFD 1 on VOR2
//    showed no change when CRS 1 always turned VOR1.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (!L.controlSets.cover) throw new Error('expected the v9 layout');

const W = 110, H = 185;   // mm
const r4 = (v) => Math.round(v * 10000) / 10000;
const rect = (x0, y0, x1, y1) => [r4(x0 / W), r4(y0 / H), r4(x1 / W), r4(y1 / H)];
const ev = (b) => `(>H:WT21_FMC_{i}_BTN_${b})`;
const controls = [];
const key = (name, label, btn, x0, y0, x1, y1, extra = {}) =>
  controls.push({ name, label, type: 'key', rect: rect(x0, y0, x1, y1), height: 0.0025, click: ev(btn), ...extra });

// 72 mm screen at x 19..91, y 5..77 (4 mm bezel); line select keys 9 x 5 mm on the FMC's data lines (page y = 97.5 + 122 k px of 1024)
for (let k = 1; k <= 6; k++) {
  const yc = 5 + 72 * (97.5 + 122 * k) / 1024;
  key(`L${k}`, '', `L${k}`, 4, yc - 2.5, 13, yc + 2.5, { height: 0.002 });
  key(`R${k}`, '', `R${k}`, 97, yc - 2.5, 106, yc + 2.5, { height: 0.002 });
}
// page keys: two rows of six, 16 x 6 mm
const rows = [
  [['IDX', 'IDX', 'IDX'], ['FPLN', 'FPLN', 'FPLN'], ['LEGS', 'LEGS', 'LEGS'], ['DEPARR', 'DEP ARR', 'DEPARR'], ['PERF', 'PERF', 'PERF'], ['DSPL_MENU', 'DSPL MENU', 'DSPL_MENU']],
  [['MFD_ADV', 'MFD ADV', 'MFD_ADV'], ['MFD_DATA', 'MFD DATA', 'MFD_DATA'], ['TUN', 'TUN', 'TUN'], ['DIR', 'DIR', 'DIR'], ['MSG', 'MSG', 'MSG'], ['EXEC', 'EXEC', 'EXEC']],
];
rows.forEach((row, r) => row.forEach(([name, label, btn], i) => {
  const x0 = 2 + i * 18, y0 = 84 + r * 8;
  key(name, label, btn, x0, y0, x0 + 16, y0 + 6, name === 'MSG' ? { light: true, lamp: '(L:WT21_DISPLAY_MSG, number) -1 >' } : {});
}));
// keyboard: rows 10 mm tall every 13 mm from 101 mm; numeric pad (3 x 10 mm) on the left, letters (5 x 10.8 mm) on the right
const top = (r) => 101 + r * 13;
[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [['DOT', '.', 'DOT'], '0', ['PLUSMINUS', '+/-', 'PLUSMINUS']]].forEach((row, r) => row.forEach((k, i) => {
  const [name, label, btn] = Array.isArray(k) ? k : [k, k, k];
  const x0 = 3 + i * 12.5;
  key(name, label, btn, x0, top(r), x0 + 10, top(r) + 10);
}));
key('PREV', 'PREV PAGE', 'PREVPAGE', 3, top(4), 19.5, top(4) + 10);
key('NEXT', 'NEXT PAGE', 'NEXTPAGE', 21.5, top(4), 38, top(4) + 10);
const ax = (i) => 43 + i * 12.4;
'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').forEach((c, n) => { const r = Math.floor(n / 5), i = n % 5; key(c, c, c, ax(i), top(r), ax(i) + 10.8, top(r) + 10); });
key('Z', 'Z', 'Z', ax(0), top(5), ax(0) + 10.8, top(5) + 10);
key('SP', 'SP', 'SP', ax(1), top(5), ax(1) + 10.8, top(5) + 10);
key('DIV', '/', 'DIV', ax(2), top(5), ax(2) + 10.8, top(5) + 10);
key('CLR', 'CLR DEL', 'CLR', ax(3), top(5), ax(4) + 10.8, top(5) + 10);
L.controlSets.cdu = { style: '3d', size: [W / 1000, H / 1000], face: 'insert', controls };

const fmc = L.units.find((u) => u.id === 'FMC1');
Object.assign(fmc, {
  screen: { center: [0, r4((H / 2 - 5 - 36) / 1000)], size: [0.072, 0.072] },
  plate: { center: [0, 0], size: [W / 1000, H / 1000] },
  backZ: 9.10,
  mount: { origin: [0.137, 0.150, 8.7975], normal: [0, 1, 0], up: [0, 0, 1] },
  _comment: 'v9.1: CDU flat on the captain side of the pedestal (face up, top forward). Laid out like a panel unit (virtual face at plateZ, centre 0,0), then mount turns it to face `normal` with its top towards `up` and puts the face centre at `origin`.',
});
L.panels = L.panels.filter((p) => p.id !== 'CDUCOVER');
delete L.controlSets.cover;

const crs1 = L.controlSets.fcp.controls.find((c) => c.name === 'CRS1');
crs1.cw = '(A:AUTOPILOT NAV SELECTED, number) 2 == if{ (>K:VOR2_OBI_INC) } els{ (>K:VOR1_OBI_INC) }';
crs1.ccw = '(A:AUTOPILOT NAV SELECTED, number) 2 == if{ (>K:VOR2_OBI_DEC) } els{ (>K:VOR1_OBI_DEC) }';

L._comment_v91 = 'v9.1 (test 9): screens and click zones are exact-size generated meshes (no node scale); CDU flat; CRS 1 follows the selected NAV.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: cdu ${controls.length} controls, CDUCOVER removed, CRS1 follows AUTOPILOT NAV SELECTED`);
