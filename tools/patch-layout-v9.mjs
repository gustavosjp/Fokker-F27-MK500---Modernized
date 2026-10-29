// One-off edit of wt21-layout.json for v9 (kept for the record): the CDU moves from the GPS 530 housing on the glareshield to the
// captain's side of the pedestal (user's choice "C", 2026-10-19), with its own CJ4-style keys; the old autopilot panel and its servo
// switches on the pedestal go (user: "os switches do AP ... podem sair, não faz sentido mais ter eles").
//  * FMC1: a framed unit (12.5 x 19.5 cm grey body, 8 cm square screen, 4 mm bezel) laid out like a panel unit, then mounted
//    (make-g1000-interior.mjs `mount`) over the pedestal's left block: face tilted 30 deg towards the captain, top of the CDU forward.
//    Face plane 0.5 x + 0.866 y = 0.215 clears the block's top corner (x 0.192, y 0.134) and the condition lever (x <= 0.104); it
//    runs z 8.66..8.86, clear of the pitch trim wheel (z >= 8.868 at x 0.20..0.23).
//  * cdu control set: 12 line select keys aligned with the FMC's data lines (page y = 97.5 + 122 k px of 1024), two rows of page
//    keys, numeric pad + PREV/NEXT on the left, A..Z, SP, /, CLR on the right; WT21 FMC H events `WT21_FMC_{i}_BTN_*`.
//  * hide group old_ap_pedestal: x0_AP_*, x0_Btn_AP_*, x0_Warn_BtnAP_* (31 nodes).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (L.controlSets.cdu) throw new Error('already patched');

const W = 125, H = 195;   // mm
const r4 = (v) => Math.round(v * 10000) / 10000;
const rect = (x0, y0, x1, y1) => [r4(x0 / W), r4(y0 / H), r4(x1 / W), r4(y1 / H)];
const ev = (b) => `(>H:WT21_FMC_{i}_BTN_${b})`;
const controls = [];
const key = (name, label, btn, x0, y0, x1, y1, extra = {}) =>
  controls.push({ name, label, type: 'key', rect: rect(x0, y0, x1, y1), height: 0.0025, click: ev(btn), ...extra });

// line select keys: 9 x 6 mm, centred on the data lines of the 80 mm screen (top at 6 mm)
for (let k = 1; k <= 6; k++) {
  const yc = 6 + 80 * (97.5 + 122 * k) / 1024;
  key(`L${k}`, '', `L${k}`, 6.5, yc - 3, 15.5, yc + 3, { height: 0.002 });
  key(`R${k}`, '', `R${k}`, 109.5, yc - 3, 118.5, yc + 3, { height: 0.002 });
}
// page keys: two rows of six, 17.5 x 7 mm
const rows = [
  [['IDX', 'IDX', 'IDX'], ['FPLN', 'FPLN', 'FPLN'], ['LEGS', 'LEGS', 'LEGS'], ['DEPARR', 'DEP ARR', 'DEPARR'], ['PERF', 'PERF', 'PERF'], ['DSPL_MENU', 'DSPL MENU', 'DSPL_MENU']],
  [['MFD_ADV', 'MFD ADV', 'MFD_ADV'], ['MFD_DATA', 'MFD DATA', 'MFD_DATA'], ['TUN', 'TUN', 'TUN'], ['DIR', 'DIR', 'DIR'], ['MSG', 'MSG', 'MSG'], ['EXEC', 'EXEC', 'EXEC']],
];
rows.forEach((row, r) => row.forEach(([name, label, btn], i) => {
  const x0 = 5 + i * 19.5, y0 = 91 + r * 10;
  key(name, label, btn, x0, y0, x0 + 17.5, y0 + 7, name === 'MSG' ? { light: true, lamp: '(L:WT21_DISPLAY_MSG, number) -1 >' } : {});
}));
// keyboard: rows 9 mm tall every 12 mm from 112 mm; numeric pad (3 x 11 mm) on the left, letters (5 x 12 mm) on the right
const top = (r) => 112 + r * 12;
[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [['DOT', '.', 'DOT'], '0', ['PLUSMINUS', '+/-', 'PLUSMINUS']]].forEach((row, r) => row.forEach((k, i) => {
  const [name, label, btn] = Array.isArray(k) ? k : [k, k, k];
  const x0 = 5 + i * 14;
  key(name, label, btn, x0, top(r), x0 + 11, top(r) + 9);
}));
key('PREV', 'PREV PAGE', 'PREVPAGE', 5, top(4), 23, top(4) + 9);
key('NEXT', 'NEXT PAGE', 'NEXTPAGE', 26, top(4), 44, top(4) + 9);
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');
letters.forEach((c, n) => { const r = Math.floor(n / 5), i = n % 5, x0 = 49 + i * 15; key(c, c, c, x0, top(r), x0 + 12, top(r) + 9); });
key('Z', 'Z', 'Z', 49, top(5), 61, top(5) + 9);
key('SP', 'SP', 'SP', 64, top(5), 76, top(5) + 9);
key('DIV', '/', 'DIV', 79, top(5), 91, top(5) + 9);
key('CLR', 'CLR DEL', 'CLR', 94, top(5), 121, top(5) + 9);

L.controlSets.cdu = { style: '3d', size: [W / 1000, H / 1000], face: 'insert', controls };

const fmc = L.units.find((u) => u.id === 'FMC1');
Object.assign(fmc, {
  screen: { center: [0, r4((H / 2 - 6 - 40) / 1000)], size: [0.08, 0.08] },
  plate: { center: [0, 0], size: [W / 1000, H / 1000] },
  plateZ: 9.0,
  screenZ: 8.9984,
  backZ: 9.06,
  frame: { border: 0.004, depth: 0.003, recess: 0.0015, chamfer: 0.001 },
  body: 'module',
  controls: 'cdu',
  index: 1,
  mount: { origin: [0.161, 0.1553, 8.76], normal: [0.5, 0.866, 0], up: [0, 0, 1] },
  _comment: 'v9: CDU on the captain side of the pedestal. Laid out like a panel unit (virtual face at plateZ, centre 0,0), then mount turns it to face `normal` with its top towards `up` and puts the face centre at `origin`.',
});
L.hide.old_ap_pedestal = ['x0_AP_', 'x0_Btn_AP_', 'x0_Warn_BtnAP_'];
L._comment_v9 = 'v9: CDU (FMC1) mounted on the pedestal with its keys; old AP panel and servo switches hidden; GPS 530 housing kept hidden by the MFD plugin.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: cdu ${controls.length} controls`);
