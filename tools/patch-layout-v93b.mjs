// One-off edit of wt21-layout.json (v9.3, step 2). Test 10: "os botões do FMC ficaram meio grandes": every CDU key shrinks about its
// own centre (positions unchanged), leaving CJ4-like gaps: letters/digits 8 x 7 mm (were 10 x 10), PREV/NEXT 14 x 7, CLR DEL 22 x 7,
// page keys 14 x 5 (were 16 x 6), line select keys 7 x 4 (were 9 x 5); caps 2 mm high (LSK 1.5 mm).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./wt21-layout.json', import.meta.url);
const text = readFileSync(path, 'utf8');
const L = JSON.parse(text);
const nl = text.includes('\r\n') ? '\r\n' : '\n';
if (JSON.stringify(L, null, 2).replace(/\n/g, nl) !== text.replace(/(\d)\.0(,?\r?$)/gm, '$1$2').replace(/(\r?\n)$/, '')) {
  throw new Error('layout file is not in JSON.stringify(…, null, 2) form; refusing to rewrite it');
}
const cs = L.controlSets.cdu;
if (cs._sized) throw new Error('already patched');
const [W, H] = cs.size.map((v) => v * 1000);   // mm
const r4 = (v) => Math.round(v * 10000) / 10000;
const page = new Set(['IDX', 'FPLN', 'LEGS', 'DEPARR', 'PERF', 'DSPL_MENU', 'MFD_ADV', 'MFD_DATA', 'TUN', 'DIR', 'MSG', 'EXEC']);
for (const c of cs.controls) {
  const cx = (c.rect[0] + c.rect[2]) / 2 * W, cy = (c.rect[1] + c.rect[3]) / 2 * H;
  let w = 8, h = 7, ht = 0.002;
  if (/^[LR][1-6]$/.test(c.name)) { w = 7; h = 4; ht = 0.0015; }
  else if (page.has(c.name)) { w = 14; h = 5; }
  else if (c.name === 'PREV' || c.name === 'NEXT') { w = 14; }
  else if (c.name === 'CLR') { w = 22; }
  c.rect = [r4((cx - w / 2) / W), r4((cy - h / 2) / H), r4((cx + w / 2) / W), r4((cy + h / 2) / H)];
  c.height = ht;
}
cs._sized = 'v9.3: keys shrunk about their centres (test 10)';
writeFileSync(path, JSON.stringify(L, null, 2).replace(/\n/g, nl) + (text.endsWith(nl) ? nl : ''));
console.log(`layout patched: ${cs.controls.length} CDU keys resized`);
