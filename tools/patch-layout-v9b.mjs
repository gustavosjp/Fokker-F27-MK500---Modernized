// One-off edit of wt21-layout.json (v9, second step): a dark blanking plate over the strip of the old servo-switch panel left in front
// of the CDU (z 8.857..8.89 on the pedestal's left block: the "INTERRUPTEURS / PA" legend and the collars of the hidden DIR/ROULIS/PROF
// switches). A panel with no controls, mounted flat (face up, top forward), 1.6 cm above the pedestal top (y 0.1337).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
if (L.controlSets.cover) throw new Error('already patched');

L.controlSets.cover = { style: '3d', size: [0.107, 0.033], face: 'module', color: [30, 31, 34], labels: [], controls: [] };
L.panels.push({
  id: 'CDUCOVER', center: [0, 0], size: [0.107, 0.033], z: 9.0, backZ: 9.03, controls: 'cover', index: 1,
  mount: { origin: [0.1385, 0.150, 8.8735], normal: [0, 1, 0], up: [0, 0, 1] },
  _comment: 'v9: blanking plate over the rest of the old servo-switch panel, in front of the CDU.',
});
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log('layout patched: CDUCOVER');
