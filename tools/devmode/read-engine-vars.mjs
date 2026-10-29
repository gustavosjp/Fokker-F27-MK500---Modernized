// Read-only sampler of the engine variables used to calibrate the F27 EIS (panel.xml <EngineDisplay>).
// Needs the sim running with Developer Mode on and the G1000 aircraft loaded. It finds the AS1000 MFD page itself.
// Usage: node read-engine-vars.mjs [seconds=20] [intervalSeconds=2]
const seconds = Number(process.argv[2] ?? 20);
const every = Number(process.argv[3] ?? 2);

const list = await (await fetch('http://127.0.0.1:19999/pagelist.json')).json();
const page = list.find((p) => /AS1000_MFD/.test(p.title ?? '')) ?? list.find((p) => /AS1000_PFD/.test(p.title ?? ''));
if (!page) { console.log('no AS1000 page in the list (is the G1000 aircraft loaded and Developer Mode on?)'); process.exit(1); }
console.log(`using page ${page.id}: ${page.title}`);

const ws = new WebSocket(`ws://127.0.0.1:19999/devtools/page/${page.id}`);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('connect failed')); });
let nextId = 1; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const evaluate = (expression) => new Promise((res) => {
  const id = nextId++; pending.set(id, res);
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ timeout: true }); } }, 5000);
});

// [label, simvar (without A:/L: prefix handled by SimVar), unit]
const VARS = [
  ['TRQ ft-lb  1', 'ENG TORQUE:1', 'Foot pounds'], ['TRQ ft-lb  2', 'ENG TORQUE:2', 'Foot pounds'],
  ['F27 torq ind 1', 'L:f275_xengtorq_1_ind', 'number'], ['F27 torq ind 2', 'L:f275_xengtorq_2_ind', 'number'],
  ['F27 TGT ind 1', 'L:f275_dart_egt_01_ind', 'number'], ['F27 TGT ind 2', 'L:f275_dart_egt_02_ind', 'number'],
  ['F27 RPM  1', 'L:f275_RpmF27_01', 'Number'], ['F27 RPM  2', 'L:f275_RpmF27_02', 'Number'],
  ['GEN ENG RPM 1', 'GENERAL ENG RPM:1', 'Rpm'], ['GEN ENG RPM 2', 'GENERAL ENG RPM:2', 'Rpm'],
  ['PROP RPM 1', 'PROP RPM:1', 'RPM'], ['PROP RPM 2', 'PROP RPM:2', 'RPM'],
  ['FUEL FLOW 1 pph', 'ENG FUEL FLOW PPH:1', 'Pounds per hour'], ['FUEL FLOW 2 pph', 'ENG FUEL FLOW PPH:2', 'Pounds per hour'],
  ['OIL PRESS 1 psi', 'ENG OIL PRESSURE:1', 'psi'], ['OIL PRESS 2 psi', 'ENG OIL PRESSURE:2', 'psi'],
  ['OIL TEMP 1 C', 'ENG OIL TEMPERATURE:1', 'celsius'], ['OIL TEMP 2 C', 'ENG OIL TEMPERATURE:2', 'celsius'],
  ['TURB ITT 1 C', 'TURB ENG ITT:1', 'celsius'], ['TURB N1 1 %', 'TURB ENG N1:1', 'percent'], ['TURB N1 2 %', 'TURB ENG N1:2', 'percent'],
  ['THROTTLE 1 %', 'GENERAL ENG THROTTLE LEVER POSITION:1', 'Percent'], ['COMBUSTION 1', 'GENERAL ENG COMBUSTION:1', 'Bool'],
  ['ON GROUND', 'SIM ON GROUND', 'Bool'],
];
const expr = `(function(){ var o = {}; ${JSON.stringify(VARS)}.forEach(function(v){ try { o[v[0]] = SimVar.GetSimVarValue(v[1], v[2]); } catch (e) { o[v[0]] = "ERR"; } }); return JSON.stringify(o); })()`;

const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : String(v));
const started = Date.now();
let sample = 0;
while ((Date.now() - started) / 1000 < seconds) {
  const r = await evaluate(expr);
  const raw = r.result?.result?.value;
  if (!raw) { console.log('no value', JSON.stringify(r).slice(0, 200)); break; }
  const o = JSON.parse(raw);
  console.log(`--- sample ${++sample} (+${Math.round((Date.now() - started) / 1000)}s)`);
  const rows = [];
  for (let i = 0; i < VARS.length; i += 2) {
    const a = VARS[i], b = VARS[i + 1];
    rows.push(b && !b[0].includes('ON GROUND') && a[0].replace(/ \d$/, '') === b[0].replace(/ \d$/, '')
      ? `${a[0].replace(/ \d$/, '').padEnd(18)} ${fmt(o[a[0]]).padStart(8)} ${fmt(o[b[0]]).padStart(8)}`
      : `${a[0].padEnd(18)} ${fmt(o[a[0]]).padStart(8)}`);
    if (b && a[0].replace(/ \d$/, '') !== b[0].replace(/ \d$/, '')) rows.push(`${b[0].padEnd(18)} ${fmt(o[b[0]]).padStart(8)}`);
  }
  console.log(rows.join('\n'));
  await new Promise((r2) => setTimeout(r2, every * 1000));
}
ws.close();
