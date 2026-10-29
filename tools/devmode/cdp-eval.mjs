// Read-only evaluation of expressions on a Coherent GT inspector page.
// Usage: node cdp-eval.mjs <pageId> <file-with-expressions-one-per-line>
import { readFileSync } from 'node:fs';
const [, , pageId, exprFile] = process.argv;
const exprs = readFileSync(exprFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('//'));
const ws = new WebSocket(`ws://127.0.0.1:19999/devtools/page/${pageId}`);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('connect failed')); });
let nextId = 1; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => {
  const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ timeout: true }); } }, 5000);
});
for (const expr of exprs) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const v = r.result?.result;
  const out = r.error ? 'ERR ' + JSON.stringify(r.error) : r.timeout ? 'timeout' : r.result?.wasThrown ? 'THROWN ' + JSON.stringify(v) : JSON.stringify(v?.value ?? v?.description ?? v);
  console.log(`> ${expr.slice(0, 110)}\n  ${String(out).slice(0, 1500)}`);
}
ws.close();
