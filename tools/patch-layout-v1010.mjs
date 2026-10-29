// One-off edit of wt21-layout.json for v10.10 (kept for the record). User after flying v10.9.1: "nos glass cockpit acho que tá
// faltando ações que tem nos botões do CJ4, como apertar/puxar; eu rodo o botão, aí ele mostra a opção mas não tem onde eu selecionar
// ela; tô descendo no modo FLC, ele mantém a velocidade do momento, mas não tem onde girar para selecionar essa velocidade".
//  * FCP: a SPD knob between FD and CRS 2 (CRS 2 moves to the edge), as on the CJ4's guidance panel: turning steps the speed FLC holds
//    (AP_SPD_VAR_INC/DEC, which WT21 shows in the PFD's speed box and bug); pushed it takes the speed of the moment (the CJ4's push is
//    IAS/MACH, which a 250-knot turboprop does not need).
//  * CRS 1 / CRS 2 pushed centre their course on the station (the radial + 180: the CDI centred, TO), like the CJ4's CRS push.
//  * MFD: MENU ADV and DATA are one dual knob, as on the CJ4's CCP and our DCP: the ring moves through the menu, the centre changes the
//    value and, pushed, selects. They were two knobs on opposite sides of the screen, so the select was not where the user looked.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
const fcp = L.controlSets.fcp, mfd = L.controlSets.mfd;
if (fcp.controls.some((c) => c.name === 'SPD')) throw new Error('already patched');
const byName = (cs, name) => {
  const c = cs.controls.find((x) => x.name === name);
  if (!c) throw new Error(`no control ${name}`);
  return c;
};
const r4 = (v) => Math.round(v * 10000) / 10000;

// FCP: CRS 2 to the right edge (6 mm margin), a 16 mm SPD knob between it and FD, centred on the knobs' row
const crs2 = byName(fcp, 'CRS2'), crs1 = byName(fcp, 'CRS1'), fd = byName(fcp, 'FD');
const knobW = crs2.rect[2] - crs2.rect[0];
crs2.rect = [r4(0.98 - knobW), crs2.rect[1], 0.98, crs2.rect[3]];
const spdW = 0.016 / fcp.size[0], spdH = 0.016 / fcp.size[1], rowMid = (crs2.rect[1] + crs2.rect[3]) / 2;
const spdX0 = r4((fd.rect[2] + crs2.rect[0]) / 2 - spdW / 2);
fcp.controls.splice(fcp.controls.indexOf(crs2), 0, {
  name: 'SPD', label: 'SPD', type: 'knob', rect: [spdX0, r4(rowMid - spdH / 2), r4(spdX0 + spdW), r4(rowMid + spdH / 2)], height: 0.012,
  cw: '(>K:AP_SPD_VAR_INC)', ccw: '(>K:AP_SPD_VAR_DEC)', push: '(A:AIRSPEED INDICATED, knots) near (>K:AP_SPD_VAR_SET)',
});
const centre = (n) => `(A:NAV HAS NAV:${n}, bool) if{ (A:NAV RADIAL:${n}, degrees) 180 + dnor near (>K:VOR${n}_SET) }`;
crs1.push = `(A:AUTOPILOT NAV SELECTED, number) 2 == if{ ${centre(2)} } els{ ${centre(1)} }`;
crs2.push = centre(2);
const label = (t) => fcp.labels.find((l) => l.text === t);
label('CRS 2').x = r4(((crs2.rect[0] + crs2.rect[2]) / 2) * fcp.size[0]);
fcp.labels.push({ text: 'SPD', x: r4(((spdX0 + spdX0 + spdW) / 2) * fcp.size[0]), y: label('CRS 2').y });

// MFD: MENU ADV (ring) + DATA (centre, push) on the knob beside the screen; the separate DATA knob goes
const menu = byName(mfd, 'MENU_ADV'), data = byName(mfd, 'DATA');
menu.concentric = 'outer';
mfd.controls.splice(mfd.controls.indexOf(data), 1);
mfd.controls.splice(mfd.controls.indexOf(menu) + 1, 0, { ...data, rect: menu.rect.slice(), concentric: 'inner' });

L._comment_v1010 = 'v10.10: FCP SPD knob (push = speed of the moment), CRS push centres the course, MFD MENU ADV / DATA dual knob; tablet pushback and charts with the aircraft.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: SPD knob at x ${spdX0}..${r4(spdX0 + spdW)}, CRS 2 at ${crs2.rect[0]}..0.98, MFD dual knob`);
