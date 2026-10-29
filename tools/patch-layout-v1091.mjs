// One-off edit of wt21-layout.json for v10.9.1 (kept for the record), after test 15 (v10.9 in the sim):
//  * "esses botões de rodar são pra quê? parecem não fazer nada" (the MFD's knobs): the WT21 MFD's menus take the knob events without
//    "Push_" (Generic_Lwr_<i>_MENU_ADV_INC / _DEC, DATA_INC / _DEC / _PUSH: MfdUprMenuViewService, MfdLwrMenuViewService); with it they
//    are CCP events nothing listens to. WT21 has no CCP map zoom either (CCP_ZOOM_INC has no listener): the ZOOM knob now turns the
//    DCP's RANGE (Generic_Upr_<i>_RANGE_INC / _DEC), the map range the MFD's map follows too.
//  * "essas teclas precisa melhorar, não estão legíveis" (the CDU): the function keys had 2.8 mm tall caps with two-line legends (letters
//    about 1 mm); their two rows now fill the room between the screen's frame and the keypad (5.8 mm caps), PREV PAGE / NEXT PAGE /
//    CLR DEL read PREV / NEXT / CLR/DEL on one line, and the CDU's legends are painted at 16 px/mm instead of 10 (legendPpm,
//    make-g1000-interior.mjs; make-hw-atlas.py lets a one-line legend without a lamp grow taller).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
const cdu = L.controlSets.cdu;
if (cdu.legendPpm) throw new Error('already patched');
const byName = (set, name) => {
  const c = L.controlSets[set].controls.find((x) => x.name === name);
  if (!c) throw new Error(`${set}: no control ${name}`);
  return c;
};

// MFD knobs
const menu = byName('mfd', 'MENU_ADV'), data = byName('mfd', 'DATA'), zoom = byName('mfd', 'ZOOM');
menu.cw = '(>H:Generic_Lwr_{i}_MENU_ADV_INC)';
menu.ccw = '(>H:Generic_Lwr_{i}_MENU_ADV_DEC)';
data.cw = '(>H:Generic_Lwr_{i}_DATA_INC)';
data.ccw = '(>H:Generic_Lwr_{i}_DATA_DEC)';
data.push = '(>H:Generic_Lwr_{i}_DATA_PUSH)';
zoom.cw = '(>H:Generic_Upr_{i}_RANGE_INC)';
zoom.ccw = '(>H:Generic_Upr_{i}_RANGE_DEC)';

// CDU: the function rows between the screen frame (bottom at 0.4378 of the face) and the keypad (top at 0.554), 8 mm keys, 2.2 mm apart
const rows = [[0.4416, 0.4848], [0.4967, 0.5399]];
[['IDX', 'FPLN', 'LEGS', 'DEPARR', 'PERF', 'DSPL_MENU'], ['MFD_ADV', 'MFD_DATA', 'TUN', 'DIR', 'MSG', 'EXEC']].forEach((names, r) => {
  for (const n of names) {
    const c = byName('cdu', n);
    c.rect = [c.rect[0], rows[r][0], c.rect[2], rows[r][1]];
  }
});
byName('cdu', 'PREV').label = 'PREV';
byName('cdu', 'NEXT').label = 'NEXT';
byName('cdu', 'CLR').label = 'CLR/DEL';
cdu.legendPpm = 16000;
L._comment_v1091 = 'v10.9.1: MFD knobs send the events WT21 listens to (menus without Push_, ZOOM = the DCP range); CDU function keys taller, one-line page keys, legends at 16 px/mm.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log('layout patched: MFD knob events, CDU function keys 8 mm, legends at 16 px/mm');
