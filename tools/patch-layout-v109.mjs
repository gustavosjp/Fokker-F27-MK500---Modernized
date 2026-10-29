// One-off edit of wt21-layout.json for v10.9 (kept for the record). User, after the Classic / Modernized renders: "esses instrumentos
// que foram removidos, cabem ao lado dos novos né, nesse espaço que ficou vazio, redistribua eles"; then, marking the first proposal
// (a standby column of airspeed, horizon and altimeter beside the PFD, the CLIMB above the MFD): "esses aí pode tirar", and about the
// old autopilot's annunciator strip: "aquilo é do piloto automático? se for não faz sentido" (it stays with the Classic cockpit).
// The captain's instruments the user kept come back beside the PFD, each group on a carrier node (make-g1000-interior.mjs "move"; in
// the Classic cockpit make-cockpit-switch.mjs animates them back home at full size):
//  * a column outboard of the PFD, on the PFD insert (widened to x 0.666, just short of the marker lights): radio altimeter (top),
//    RMI (centre, level with the PFD's attitude), OAT (bottom, which the MFD insert covered), 0.85 size for the framed two and 1.1 for
//    the frameless OAT dial, so all three are about 70 mm. The insert stands 2 cm proud of the panel, so they come forward with it
//    (dz: their faces just in front of the insert, the frames level with the PFD frame), walls from the fronts back to the panel;
//  * the speed-limits placard (VITESSES LIMITES), cut by the PFD insert, moves below it, and the insert reaches 1 cm lower: the
//    panel texture under the decal has the placard's last line painted in, which showed once the decal moved.
// Still hidden: the airspeed, standby horizon, altimeter and CLIMB (the PFD shows all of it), the ADI and HSI, the M/VRF speed card,
// the old AP annunciator strip and pedestal (the WT21 autopilot's modes are on the PFD); the GPS 530 housing joins them (switched
// with the cockpit instead of held off by its L var).
// Usage: node patch-layout-v109.mjs            patches tools/wt21-layout.json
//        node patch-layout-v109.mjs <out.json> writes the patched layout there instead (preview)
import { readFileSync, writeFileSync } from 'node:fs';

const r4 = (v) => Math.round(v * 10000) / 10000;

/** The v10.9 change, applied in place to a v10.8 layout object. */
export function toV109(L) {
  if (L.move.some((m) => m.id === 'ralt')) throw new Error('already patched');
  const back = ['x0_VOR_01', 'x0_RALT_01', 'x0_Cadre_Ralt01', 'Cadre_CI601_01'];
  const cpt = L.hide.captain_flight_group;
  for (const n of back) if (!cpt.includes(n)) throw new Error(`${n} is not hidden`);
  L.hide.captain_flight_group = cpt.filter((n) => !back.includes(n));
  // the GPS 530 housing joins its screen and keys: carried away in Modernized like them, so the MFD plugin no longer has to hold the
  // author's L:GPS_isVisible at 0 (which the Classic cockpit needs to be his again)
  if (L.hide.gps530.includes('x0_GPS_base0')) throw new Error('GPS housing already hidden');
  L.hide.gps530.push('x0_GPS_base0');

  // the PFD insert reaches the marker lights (the column stands on it) and 1 cm lower (over the painted VLE 168 KNOTS line)
  const pfd = L.units.find((u) => u.id === 'PFD1');
  const x0 = r4(pfd.plate.center[0] - pfd.plate.size[0] / 2), x1 = 0.666;
  const yLo = r4(pfd.plate.center[1] - pfd.plate.size[1] / 2), yHi = r4(pfd.plate.center[1] + pfd.plate.size[1] / 2), yBottom = 0.2155;
  pfd.plate = { center: [r4((x0 + x1) / 2), r4((yBottom + yHi) / 2)], size: [r4(x1 - x0), r4(yHi - yBottom)] };

  // column: between the PFD frame (x 0.588) and the insert's edge, three 0.85 frames (71.4 mm) evenly spaced over the screens' band
  const s = 0.85, frame = 0.084 * s, gap = (yHi - yLo - 3 * frame) / 4;
  const colX = r4((0.588 + x1) / 2), colY = [2, 1, 0].map((k) => r4(yLo + gap * (k + 1) + frame * (k + 0.5)));
  const dz = -0.026;   // faces (dials at z 9.168-9.169) in front of the insert (z 9.1495), frames level with the PFD frame
  L.move.push(
    { id: 'ralt', nodes: ['x0_RALT_01', 'x0_Cadre_Ralt01'], from: [0.373, 0.3345], to: [colX, colY[0]], scale: s, dz, box: [0.331, 0.293, 0.415, 0.376] },
    { id: 'rmi', nodes: ['x0_VOR_01', 'Cadre_CI601_01'], from: [0.6, 0.334], to: [colX, colY[1]], scale: s, dz, box: [0.558, 0.292, 0.642, 0.376] },
    { id: 'oat', nodes: ['x0_Temp'], from: [0.2, 0.253], to: [colX, colY[2]], scale: 1.1, dz, box: [0.169, 0.222, 0.231, 0.284] },
    { id: 'speed_placard', nodes: ['Cube.125'], from: [0.6055, 0.248], to: [0.6055, r4(yBottom - 0.0035 - 0.029)], scale: 1 },
  );
  L._comment_v109 = 'v10.9: radio altimeter, RMI and OAT in a column beside the PFD; Classic / Modernized cockpit switch in the tablet.';
  return L;
}

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
toV109(L);
const out = process.argv[2] || path;
writeFileSync(out, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout ${process.argv[2] ? 'preview written to ' + out : 'patched'}: ${L.move.length - 1} instrument groups placed, PFD insert to x ${L.units.find((u) => u.id === 'PFD1').plate.size[0]} wide`);
