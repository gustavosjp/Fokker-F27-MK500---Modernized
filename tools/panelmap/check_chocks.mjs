// Verify aid for the wheel chocks (make-wt21-exterior.mjs): poses the WT21 exterior as parked (v10.7: the gear animations at frame 100,
// GEAR ANIMATION POSITION 100 %, as the sim plays them; the stairs' at their end, out), then checks that the chocks (nodes
// F27WT21_CHOCKS_*) stand on the tyres' ground (the bottom of the main tyres), that no chock vertex is inside a tyre, that each of the
// four main wheels has a chock in front and behind (none at the nose wheels, as the maintenance manual's parking procedure says), and
// that the author's stairs stand on the same ground (brought down in v10.7: he made them for the compressed gear).
// Prints one JSON line: {ok, groundGapMm, minClearanceMm, mainsChocked, noseChocked, stairsGapMm}.
// Usage: node check_chocks.mjs <F27500v2bgt_wt21.gltf>
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(src, 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'f27-chk-'));
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${script} failed: ${r.stderr}`);
};
run('make_fold_demo.mjs', src, tmp, '--frame', '100', ...g.animations.map((a) => a.name).filter((n) => /^x0_GEAR_|^x0_STAIRS_/.test(n)));
run('dump_geometry.mjs', join(tmp, basename(src)), join(tmp, 'down'));
const meta = JSON.parse(readFileSync(join(tmp, 'down.json'), 'utf8'));
const raw = readFileSync(join(tmp, 'down.bin'));
const pos = new Float32Array(raw.buffer, raw.byteOffset, meta.vertexFloats);
rmSync(tmp, { recursive: true, force: true });
const vertsWhere = (test) => meta.prims.filter((q) => test(q.name))
  .flatMap((p) => Array.from({ length: p.vCount }, (_, k) => [0, 1, 2].map((a) => pos[3 * (p.vOffset + k) + a])));
const verts = (name) => vertsWhere((n) => n === name);
const minY = (v) => Math.min(...v.map((p) => p[1]));
const chocks = vertsWhere((n) => n.startsWith('F27WT21_CHOCKS'));
const ground = Math.min(minY(verts('GEAR_Left_Tire_Still')), minY(verts('GEAR_Right_Tire_Still')));
const result = { ok: false, groundGapMm: null, minClearanceMm: null, mainsChocked: 0, noseChocked: 0, stairsGapMm: null };
const mm = (m) => Math.round(m * 10000) / 10;
if (chocks.length) {
  result.groundGapMm = mm(Math.abs(minY(chocks) - ground));
  let minClear = Infinity;
  for (const tyre of ['GEAR_Center_Tire_Still', 'GEAR_Left_Tire_Still', 'GEAR_Right_Tire_Still']) {
    const v = verts(tyre), xs = v.map((p) => p[0]), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    for (const w of [v.filter((p) => p[0] < mid), v.filter((p) => p[0] > mid)]) {
      const ax = (k, f) => f(...w.map((p) => p[k]));
      const x0 = ax(0, Math.min), x1 = ax(0, Math.max), y0 = ax(1, Math.min), y1 = ax(1, Math.max), zc = (ax(2, Math.min) + ax(2, Math.max)) / 2;
      const r = (y1 - y0) / 2, yc = (y0 + y1) / 2;
      // a chock is a prism along x, wider than its wheel: its vertices sit on its two side planes, a little outside the wheel's x span
      const beside = chocks.filter((p) => p[0] >= x0 - 0.05 && p[0] <= x1 + 0.05);
      for (const p of beside) minClear = Math.min(minClear, Math.hypot(p[2] - zc, p[1] - yc) - r);
      if (beside.some((p) => p[2] > zc && p[2] - zc < 0.6) && beside.some((p) => p[2] < zc && zc - p[2] < 0.6)) result[tyre.includes('Center') ? 'noseChocked' : 'mainsChocked']++;
    }
  }
  result.minClearanceMm = mm(minClear);
  result.stairsGapMm = mm(minY(vertsWhere((n) => /^x0_STAIRS_(Fwd|Aft)$/.test(n))) - ground);
  result.ok = result.groundGapMm <= 2 && result.minClearanceMm >= 0 && result.mainsChocked === 4 && result.noseChocked === 0
    && Math.abs(result.stairsGapMm) <= 5;
}
console.log(JSON.stringify(result));
