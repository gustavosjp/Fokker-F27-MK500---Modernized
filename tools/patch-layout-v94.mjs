// One-off edit of wt21-layout.json for v9.4 (kept for the record). Test 11: "esses dois primeiros botões têm duas formas, giram a parte
// de baixo e o centro é independente": the DCPs' first two knobs become real dual concentric knobs, as on the CJ4, with the WT21 events
// paired the way WT21 pairs them (GuiHEvent LOWER = MENU ADV, UPPER = DATA with push; radar RANGE / TILT with push):
//   knob 1: outer ring MENU ADV, centre DATA (push DATA_PUSH)
//   knob 2: outer ring RANGE, centre TILT (push TILT_PUSH)
//   knob 3 (was RANGE, now on knob 2): BARO, the side's altimeter setting (KOHLSMAN_INC/DEC with the index), push BAROMETRIC, which the
//          WT21 PFD turns into STD on / off (PFD.js handleBaroSetEvent)
// Legends: outer function under the knob, centre function above it.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
const cs = L.controlSets.dcp;
if (cs.controls.some((c) => c.name === 'TILT')) throw new Error('already patched');
const at = (n) => cs.controls.find((c) => c.name === n).rect;
const k1 = at('MENU_ADV'), k2 = at('DATA'), k3 = at('RANGE');
const h = (e) => `(>H:Generic_Upr_{i}_${e})`;
const knobs = [
  { name: 'MENU_ADV', label: 'MENU', type: 'knob', rect: k1, height: 0.012, cw: h('MENU_ADV_INC'), ccw: h('MENU_ADV_DEC'), concentric: 'outer' },
  { name: 'DATA', label: 'DATA', type: 'knob', rect: k1, height: 0.012, cw: h('DATA_INC'), ccw: h('DATA_DEC'), push: h('DATA_PUSH'), concentric: 'inner' },
  { name: 'RANGE', label: 'RANGE', type: 'knob', rect: k2, height: 0.012, cw: h('RANGE_INC'), ccw: h('RANGE_DEC'), concentric: 'outer' },
  { name: 'TILT', label: 'TILT', type: 'knob', rect: k2, height: 0.012, cw: h('TILT_INC'), ccw: h('TILT_DEC'), push: h('TILT_PUSH'), concentric: 'inner' },
  { name: 'BARO', label: 'BARO', type: 'knob', rect: k3, height: 0.012, cw: '{i} (>K:KOHLSMAN_INC)', ccw: '{i} (>K:KOHLSMAN_DEC)', push: '(>K:BAROMETRIC)' },
];
cs.controls = [...cs.controls.filter((c) => c.type !== 'knob'), ...knobs];
const W = cs.size[0], Hh = cs.size[1];
const cx = (r) => +(((r[0] + r[2]) / 2) * W).toFixed(4);
const above = +(r4((k1[1] * Hh) - 0.006)).toFixed(4);
function r4(v) { return Math.round(v * 10000) / 10000; }
cs.labels = [
  ...cs.labels.filter((l) => !['MENU ADV', 'DATA', 'RANGE'].includes(l.text)),
  { text: 'MENU ADV', x: cx(k1), y: 0.055 }, { text: 'DATA', x: cx(k1), y: above },
  { text: 'RANGE', x: cx(k2), y: 0.055 }, { text: 'TILT', x: cx(k2), y: above },
  { text: 'BARO', x: cx(k3), y: 0.055 }, { text: 'PUSH STD', x: cx(k3), y: above },
];
L._comment_v94 = 'v9.4: DCP dual knobs (MENU ADV/DATA, RANGE/TILT) and BARO; WT21 WASM copy also stops the TAPIR trim servos.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: DCP knobs ${knobs.map((k) => k.name + (k.concentric ? `(${k.concentric})` : '')).join(', ')}; labels above at y ${above}`);
