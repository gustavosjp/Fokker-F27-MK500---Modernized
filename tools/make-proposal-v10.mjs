// Layout PROPOSAL v10 (user, 2026-10-21): "deixar o PFD e o MFD juntos na parte esquerda, e onde tinha os relógios de parâmetros do
// motor, voltar. No lado do copiloto, manter os originais também. Se precisar remover os instrumentos analógicos do lado do piloto, pode."
// Run as a script, writes tools/proposals/v10-layout.json from the current wt21-layout.json (which is NOT changed); toV10() is the change
// itself, also applied for real by patch-layout-v10.mjs (approved: "gostei da proposta, vale o teste"):
//  * captain side, inboard -> outboard: MFD keys column (x 0.150..0.171) | MFD, screen centre x 0.2715 | MFD keys column between the
//    screens (x 0.372..0.393) | PFD, screen centre x 0.4935 (in front of the captain, eye x 0.5). Both portrait 0.165 x 0.22 at y 0.352.
//    Inserts cover x 0.145..0.65, y 0.226..0.478 (the captain's instruments span x 0.180..0.642, y 0.231..0.472).
//  * all the captain's analogue flight instruments hidden, including the standby cluster of v5 (the moves go away);
//  * centre: the original engine gauges come back (the centre MFD is gone); the FCP stays above them;
//  * copilot side: original instruments back, no PFD 2, no DCP 2 (the copilot's old AP annunciator strip comes back);
//  * pedestal (CDU, servo switches) unchanged.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const r4 = (v) => Math.round(v * 10000) / 10000;

/** The v10 change, applied in place to a v9.4 layout object. */
export function toV10(L) {
  const frameY = 0.352, screen = [0.165, 0.22];
  const insY = [0.226, 0.478], insH = r4(insY[1] - insY[0]), insCY = r4((insY[0] + insY[1]) / 2);

  // ---- units ----
  L.units = L.units.filter((u) => u.id !== 'PFD2');
  const pfd = L.units.find((u) => u.id === 'PFD1');
  pfd.screen = { center: [0.4935, frameY], size: screen };
  pfd.plate = { center: [r4((0.396 + 0.65) / 2), insCY], size: [r4(0.65 - 0.396), insH] };
  const mfd = L.units.find((u) => u.id === 'MFD1');
  mfd.screen = { center: [0.2715, frameY], size: screen };
  mfd.plate = { center: [r4((0.145 + 0.396) / 2), insCY], size: [r4(0.396 - 0.145), insH] };

  // ---- MFD keys: one column between the screens, one inboard (rects normalised to the MFD insert, u from the pilot's left = x 0.396) ----
  const [W, H] = mfd.plate.size, xL = 0.396, yT = insY[1];
  const rect = (x0, x1, y0, y1) => [r4((xL - x1) / W), r4((yT - y1) / H), r4((xL - x0) / W), r4((yT - y0) / H)];   // x0 < x1, y0 < y1 (world)
  const old = Object.fromEntries(L.controlSets.mfd.controls.map((c) => [c.name, c]));
  const keyAt = (name, x0, row) => { const yTop = 0.466 - row * 0.019; return { ...old[name], rect: rect(x0, x0 + 0.021, yTop - 0.011, yTop) }; };
  const knobAt = (name, x0, yC) => ({ ...old[name], rect: rect(x0 + 0.0015, x0 + 0.0195, yC - 0.009, yC + 0.009) });
  const between = 0.372, inboard = 0.150;
  L.controlSets.mfd.size = [W, H];
  L.controlSets.mfd.controls = [
    ...['UPR_MENU', 'LWR_MENU', 'ENG', 'SYS', 'ESC'].map((n, k) => keyAt(n, between, k)),
    knobAt('MENU_ADV', between, 0.355),
    ...['CAS', 'NAV_DATA', 'TFC', 'TERR_WX'].map((n, k) => keyAt(n, inboard, k)),
    knobAt('ZOOM', inboard, 0.372), knobAt('DATA', inboard, 0.345),
  ];

  // ---- panels: no DCP 2 ----
  L.panels = L.panels.filter((p) => p.id !== 'DCP2');

  // ---- hidden / moved ----
  L.hide.captain_flight_group = [...L.hide.captain_flight_group, 'x0_IAS_01', 'x0_Cadre_ias01', 'x0_ALTI_01', 'x0_Struct_Cadres.003', 'x0_VSI_01', 'x0_HorizSec', 'x0_Cadre_HorizSec', 'Cube.129'];
  delete L.hide.copilot_flight_group;
  delete L.hide.engine_cluster;
  L.hide.old_ap_annunciators = ['x0_Pan_ApWarn_01', 'x0_Warn_AP01_', 'x0_Btn_APwarn_01', 'x0_Sw_APwarn_01'];
  L.move = L.move.filter((m) => m.id === 'ap_servo_switches');
  return L;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = new URL('.', import.meta.url);
  const L = toV10(JSON.parse(readFileSync(new URL('./wt21-layout.json', here), 'utf8')));
  L._comment_v10_proposal = 'PROPOSAL v10: PFD + MFD on the captain side, original engine gauges in the centre, original copilot side.';
  mkdirSync(new URL('./proposals/', here), { recursive: true });
  writeFileSync(new URL('./proposals/v10-layout.json', here), JSON.stringify(L, null, 2));
  console.log('proposal written: tools/proposals/v10-layout.json');
}
