// One-off edit of wt21-layout.json for v10 (kept for the record). The user approved the v10 proposal renders ("gostei da proposta, vale o
// teste"), so its change (make-proposal-v10.mjs toV10: PFD + MFD together on the captain side, original engine gauges in the centre,
// original copilot side) becomes the real layout, plus test 12:
//  * "O botão do FD também não liga, embora esteja sempre ligado": the FD key gets a lamp on the FD state and names FD 1, as the WT21's
//    own APStateManager does. (It reads "always on" because the WT21 autopilot turns the FD back on whenever the AP is engaged, like
//    the CJ4: autoEngageFd; with the AP off the key does turn it off.)
//  * keepVisible: what v10 gives back (the copilot's flight instruments and the engine gauges, the v9.4 hide groups), so
//    verify-package.ps1 can check that none of it is hidden.
import { readFileSync, writeFileSync } from 'node:fs';
import { toV10 } from './make-proposal-v10.mjs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (!L.units.some((u) => u.id === 'PFD2')) throw new Error('already patched (no PFD2)');
const keepVisible = { copilot_flight_group: L.hide.copilot_flight_group, engine_cluster: L.hide.engine_cluster };
toV10(L);
const fd = L.controlSets.fcp.controls.find((c) => c.name === 'FD');
Object.assign(fd, { click: '1 (>K:TOGGLE_FLIGHT_DIRECTOR)', light: true, lamp: '(A:AUTOPILOT FLIGHT DIRECTOR ACTIVE:1, Bool)' });
L.keepVisible = keepVisible;
L._comment_v10 = 'v10: PFD + MFD on the captain side, original engine gauges in the centre, original copilot side (no PFD 2 / DCP 2); FD key lamp; every key sinks when clicked (make-g1000-interior.mjs).';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched to v10: units ${L.units.map((u) => u.id).join(', ')}; panels ${L.panels.map((p) => p.id).join(', ')}; FD lamp ${fd.lamp}`);
