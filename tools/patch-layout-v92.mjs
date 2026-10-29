// One-off edit of wt21-layout.json for v9.2 (kept for the record). User: "os switches que estavam onde tá o FMC não foram pra parte
// onde tinha o AP, precisa corrigir isso": the AP servo switches DIR / ROULIS / PROF / TRIM (x0_AP_Sw_Rud / _Roll / _Pitch / _Trim, under
// the CDU since v9) move to where the old autopilot panel was (centre of the pedestal top, x -0.072..0.072), instead of being hidden.
//  * hide group old_ap_pedestal: the same old-AP nodes minus these four (27 nodes).
//  * move ap_servo_switches: the four root nodes on one carrier, x -0.128, up 0.0085 (onto the plate), z -0.010.
//  * panel SERVOPA: black legend plate mounted flat (face up, top forward) at y 0.1465, x -0.072..0.072, z 8.772..8.880. It covers what
//    is left of the old AP panel (light posts, frame edges and screws up to y 0.145) and stops short of the quadrant part at z >= 8.885.
//    Legends as on the original panel: "INTERRUPTEURS / PA", DIR. / ROULIS / PROF. under the top row, TRIM under its switch.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (L.controlSets.servo_pa) throw new Error('already patched');

L.hide.old_ap_pedestal = ['x0_AP_Rotac_', 'x0_AP_n_Pitch', 'x0_AP_Sw_PA', 'x0_AP_Sw_LocAr', 'x0_AP_Sw_DV', 'x0_AP_SwCap_', 'x0_AP_Base', 'x0_Btn_AP_', 'x0_Warn_BtnAP_'];

const dx = -0.128, dy = 0.0085, dz = -0.010;
L.move.push({
  id: 'ap_servo_switches',
  nodes: ['x0_AP_Sw_Rud', 'x0_AP_Sw_Roll', 'x0_AP_Sw_Pitch', 'x0_AP_Sw_Trim'],
  from: [0.128, 0.136], to: [0.128 + dx, 0.136 + dy], scale: 1, dz,
  _comment: 'v9.2: AP servo switches from under the CDU to the old AP panel spot (on the SERVOPA plate).',
});

// plate: face coordinates from its top-left as seen from the seats (top = forward edge z 8.880, left = aircraft left edge x +0.072)
const W = 0.144, H = 0.108, top = 8.880, left = 0.072;
const fx = (x) => +(left - x).toFixed(4), fy = (z) => +(top - z).toFixed(4);
const row1 = 8.8681 + dz, trim = 8.8168 + dz;   // switch pivots after the move
L.controlSets.servo_pa = {
  style: '3d', size: [W, H], face: 'module', color: [24, 24, 27],
  labels: [
    { text: 'INTERRUPTEURS / PA', x: fx(0), y: fy(8.875) },
    { text: 'DIR.', x: fx(0.1629 + dx), y: fy(row1 - 0.025) },
    { text: 'ROULIS', x: fx(0.128 + dx), y: fy(row1 - 0.025) },
    { text: 'PROF.', x: fx(0.0928 + dx), y: fy(row1 - 0.025) },
    { text: 'TRIM', x: fx(0.128 + dx), y: fy(trim - 0.025) },
  ],
  controls: [],
};
L.panels.push({
  id: 'SERVOPA', center: [0, 0], size: [W, H], z: 9.0, backZ: 9.0128, controls: 'servo_pa', index: 1,
  mount: { origin: [0, 0.1465, +(top - H / 2).toFixed(4)], normal: [0, 1, 0], up: [0, 0, 1] },
  _comment: 'v9.2: legend plate for the AP servo switches, where the old autopilot panel was.',
});
L._comment_v92 = 'v9.2: AP servo switches moved (not hidden) to the old AP panel spot, on the SERVOPA legend plate.';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log('layout patched: servo switches moved, SERVOPA plate added');
