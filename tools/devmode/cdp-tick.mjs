// Read-only: sample a few instrument counters twice to see whether a page is actually being updated.
// Usage: node cdp-tick.mjs <pageId> [gapMs]
const [, , pageId, gap = '2000'] = process.argv;
const ws = new WebSocket(`ws://127.0.0.1:19999/devtools/page/${pageId}`);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('connect failed')); });
let nextId = 1; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => {
  const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ timeout: true }); } }, 5000);
});
const expr = `(function(){
  var e = document.querySelector("wtg1000-pfd, wtg1000-mfd");
  var o = {};
  ["frameCount","deltaTime","lastTime","isStarted","initialized","isConnected","allowRender","isGlassCockpit","qualityLevel","isPaused","_isConnected","_isInitialized","hasBeenInitialised","gameState"].forEach(function(k){ if (e && k in e && typeof e[k] !== "function") o[k] = e[k]; });
  o.perfNow = (typeof performance !== "undefined" && performance.now) ? Math.round(performance.now()) : "n/a";
  o.dateNow = Date.now();
  o.simTime = (typeof SimVar !== "undefined") ? SimVar.GetSimVarValue("E:ABSOLUTE TIME","seconds") : "n/a";
  var t = (document.body.innerText||"").replace(/\\s+/g," ");
  var m = t.match(/TAS\\s*(\\d+)\\s*KT/); o.tas = m ? m[1] : "?";
  return JSON.stringify(o);
})()`;
const sample = async () => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result?.result?.value ?? JSON.stringify(r); };
const a = await sample();
await new Promise((r) => setTimeout(r, Number(gap)));
const b = await sample();
console.log('t0:', a);
console.log('t1:', b);
ws.close();
