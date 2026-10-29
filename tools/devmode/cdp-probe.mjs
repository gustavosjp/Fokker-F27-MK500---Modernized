// Read-only probe of a Coherent GT inspector page: collects console/log/exception events for a few seconds and
// evaluates a few side-effect-free expressions. Usage: node cdp-probe.mjs <pageId> [waitMs]
const pageId = process.argv[2];
const waitMs = Number(process.argv[3] ?? 4000);
const candidates = [
  `ws://127.0.0.1:19999/devtools/page/${pageId}`,
  `ws://127.0.0.1:19999/inspector/page/${pageId}`,
  `ws://127.0.0.1:19999/page/${pageId}`,
];

function tryConnect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(null); }, 3000);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); resolve(null); };
  });
}

let ws = null;
let usedUrl = null;
for (const u of candidates) {
  ws = await tryConnect(u);
  if (ws) { usedUrl = u; break; }
}
if (!ws) { console.log('no websocket endpoint accepted:', candidates.join(' | ')); process.exit(1); }
console.log('connected:', usedUrl);

let nextId = 1;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  let m; try { m = JSON.parse(ev.data); } catch { console.log('raw:', String(ev.data).slice(0, 300)); return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else events.push(m);
};
const send = (method, params = {}) => new Promise((res) => {
  const id = nextId++; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ timeout: true, method }); } }, 4000);
});

for (const m of ['Runtime.enable', 'Console.enable', 'Log.enable']) {
  const r = await send(m);
  console.log(m, '->', r.error ? 'error ' + JSON.stringify(r.error) : r.timeout ? 'timeout' : 'ok');
}
await new Promise((r) => setTimeout(r, waitMs));

const fmtArg = (a) => (a?.value !== undefined ? String(a.value) : a?.description ?? a?.type ?? '?');
const seen = new Set();
for (const e of events) {
  let line = null;
  if (e.method === 'Runtime.consoleAPICalled') line = `[console.${e.params.type}] ` + (e.params.args || []).map(fmtArg).join(' ');
  else if (e.method === 'Console.messageAdded') line = `[console.${e.params.message?.level}] ${e.params.message?.text}`;
  else if (e.method === 'Runtime.exceptionThrown') line = `[EXCEPTION] ${e.params.exceptionDetails?.text} ${e.params.exceptionDetails?.exception?.description ?? ''}`;
  else if (e.method === 'Log.entryAdded') line = `[log.${e.params.entry?.level}] ${e.params.entry?.text} ${e.params.entry?.url ?? ''}`;
  if (line && !seen.has(line)) { seen.add(line); console.log(line.slice(0, 600)); }
}
console.log(`events: ${events.length}, distinct lines: ${seen.size}`);

const evalExprs = [
  'document.title',
  'location.href',
  'document.readyState',
  'typeof msfssdk + " / " + typeof garminsdk',
  '(document.querySelector("wtg1000-pfd, wtg1000-mfd")||{}).tagName || "no wtg1000 element"',
  'document.body ? document.body.innerHTML.length : -1',
  '(document.getElementById("Electricity")||{getAttribute:()=>"no #Electricity"}).getAttribute("state")',
];
for (const expr of evalExprs) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const v = r.result?.result;
  console.log('eval', JSON.stringify(expr).slice(0, 90), '=>', r.error ? 'ERR ' + JSON.stringify(r.error) : r.timeout ? 'timeout' : JSON.stringify(v?.value ?? v?.description ?? v));
}
ws.close();
