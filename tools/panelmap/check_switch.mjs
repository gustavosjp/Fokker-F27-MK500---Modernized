// v10.9 check of the cockpit switch in the WT21 interior (tools\make-cockpit-switch.mjs): poses the carriers' animations at frame 0
// (Modernized) and frame 100 (Classic) and checks where everything ends up:
//  * the author's parts the WT21 cockpit replaces (expand-hide.mjs of the layout) hang under F27SW_classic* carriers, and nothing else
//    of his does: away (> 20 m) at frame 0, home at frame 100;
//  * every node we added, but the tablet's and the moved author groups, hangs under F27SW_modern: home at 0, away at 100;
//  * the tablet hangs under no carrier;
//  * each moved author group (F27_WT21_move_*): at frame 0 its rest transform (the layout's move), at frame 100 none (home, full size);
//  * v10.9.1: a carrier away is also shrunk to a thousandth (the carriers have no visibility code, test 15).
// Usage: node check_switch.mjs <wt21 interior gltf> <author interior gltf> <wt21-layout.json>   -> one JSON line, ok true/false
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , gltfPath, authorPath, layoutPath] = process.argv;
const g = JSON.parse(readFileSync(gltfPath, 'utf8'));
const bin = readFileSync(join(dirname(gltfPath), g.buffers[0].uri));
const hideOut = join(tmpdir(), 'f27-check-switch-hide.json');
execFileSync('node', [join(dirname(fileURLToPath(import.meta.url)), '..', 'expand-hide.mjs'), authorPath, layoutPath, hideOut]);
const hidden = new Set(JSON.parse(readFileSync(hideOut, 'utf8')).all);
const authorCount = JSON.parse(readFileSync(authorPath, 'utf8')).nodes.length;

const rows = (ai, n) => {
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || 4 * n;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (__, k) => bin.readFloatLE(base + stride * i + 4 * k)));
};
const parentOf = new Map();
g.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const carrierOf = (i) => {
  for (let p = parentOf.get(i); p !== undefined; p = parentOf.get(p)) {
    if (/^F27SW_/.test(g.nodes[p].name)) return g.nodes[p].name;
  }
  return null;
};
const problems = [];
const say = (m) => { if (problems.length < 20) problems.push(m); };

// who hangs where
const ours = (n) => /^(WT21_|F27WT21_|F27_WT21_)/.test(n || '');
const tablet = (n) => /^(WT21_TAB1|F27WT21_TAB1|F27_WT21_TAB1)/.test(n || '');
const movers = g.nodes.map((n, i) => [n, i]).filter(([n]) => /^F27_WT21_move_/.test(n.name) && !/_box_/.test(n.name)).map(([, i]) => i);
const inMover = (i) => { for (let p = i; p !== undefined; p = parentOf.get(p)) if (movers.includes(p)) return true; return false; };
let classicCount = 0, modernCount = 0;
g.nodes.forEach((n, i) => {
  if (/^F27SW_/.test(n.name)) return;
  const c = carrierOf(i);
  if (i < authorCount) {
    if (hidden.has(n.name) !== (c !== null && c.startsWith('F27SW_classic'))) say(`${n.name}: ${hidden.has(n.name) ? 'hidden but not' : 'not hidden but'} on a Classic carrier (${c})`);
    if (c && c.startsWith('F27SW_classic')) classicCount++;
  } else if (tablet(n.name)) {
    if (c !== null) say(`${n.name}: the tablet's, on ${c}`);
  } else if (ours(n.name) && !inMover(i)) {
    if (c !== 'F27SW_modern') say(`${n.name}: ours, on ${c}`);
    else modernCount++;
  }
});

// posed world positions at frame 0 and 100 (carrier translations only: they carry no rotation)
const posed = (frame) => {
  const t = new Map(), s = new Map();
  for (const an of g.animations || []) {
    if (!/^F27SW_|^F27_WT21_move_/.test(an.name)) continue;
    for (const ch of an.channels) {
      const sm = an.samplers[ch.sampler], times = rows(sm.input, 1).map((r) => r[0]), out = rows(sm.output, 3);
      const k = frame / 24 >= times[times.length - 1] ? times.length - 1 : 0;
      if (Math.abs(times[0]) > 1e-6 || Math.abs(times[times.length - 1] - 100 / 24) > 1e-4 || times.length !== 2) say(`${an.name}: keys not at frames 0 and 100`);
      (ch.target.path === 'scale' ? s : t).set(ch.target.node, out[k]);
    }
  }
  return { t, s };
};
const f0 = posed(0), f100 = posed(100);
const len = (v) => Math.hypot(...v);
const carriers = g.nodes.map((n, i) => [n, i]).filter(([n]) => /^F27SW_/.test(n.name));
for (const [n, i] of carriers) {
  const a = f0.t.get(i), b = f100.t.get(i);
  if (!a || !b) { say(`${n.name}: no translation animation`); continue; }
  const classic = n.name.startsWith('F27SW_classic');
  // v10.9.1: away also means shrunk to a thousandth, home full size (no visibility code on carriers: test 15)
  const sAway = (classic ? f0 : f100).s.get(i), sHome = (classic ? f100 : f0).s.get(i);
  if (!sAway || !sHome || sAway.some((v) => Math.abs(v - 0.001) > 1e-7) || sHome.some((v) => Math.abs(v - 1) > 1e-7)) say(`${n.name}: not shrunk away / full size home`);
  const rest = n.scale || [1, 1, 1], restWant = classic ? 0.001 : 1;
  if (rest.some((v) => Math.abs(v - restWant) > 1e-7)) say(`${n.name}: rest scale is not the Modernized one`);
  // a carrier's translation is in its parent's frame: the author's parent nodes can be scaled, so "away" is judged in the world
  let scale = 1;
  for (let p = parentOf.get(i); p !== undefined; p = parentOf.get(p)) scale *= (g.nodes[p].scale || [1, 1, 1])[1];
  const away0 = len(a) * scale > 20, home0 = len(a) < 1e-6, away100 = len(b) * scale > 20, home100 = len(b) < 1e-6;
  if (classic ? !(away0 && home100) : !(home0 && away100)) say(`${n.name}: frame 0 ${a.map((x) => x.toFixed(3))}, frame 100 ${b.map((x) => x.toFixed(3))}`);
}
for (const i of movers) {
  const n = g.nodes[i], a = f0.t.get(i), b = f100.t.get(i), s0 = f0.s.get(i) || [1, 1, 1], s100 = f100.s.get(i) || [1, 1, 1];
  const rest = n.translation || [0, 0, 0], rs = n.scale || [1, 1, 1];
  if (!a || !b) { say(`${n.name}: no animation`); continue; }
  const same = (u, v) => u.every((x, k) => Math.abs(x - v[k]) < 1e-5);
  if (!same(a, rest) || !same(s0, rs) || !same(b, [0, 0, 0]) || !same(s100, [1, 1, 1])) say(`${n.name}: frame 0 must be its move, frame 100 home at full size`);
}
console.log(JSON.stringify({ ok: problems.length === 0 && classicCount > 100 && modernCount > 100, classicNodes: classicCount, modernNodes: modernCount,
  carriers: carriers.length, movers: movers.length, problems }));
