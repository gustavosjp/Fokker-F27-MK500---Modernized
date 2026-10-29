// v11 (the author, bgaurant: "can you publish your improvements as an additional mod? I mean without including the original package?"):
// turns the full package source tree that scaffold.ps1 makes (and verify-package.ps1 checked) into the add-on form, in place. Only our
// files stay; the author's come from his own package, installed beside it:
//   * aircraft.cfg: [VARIATION] base_container = "..\Bgt_F27500v2" (as the liveries of his aircraft do) + our [FLTSIM.n] blocks;
//     his .cfg files, sounds and panel are inherited
//   * every file identical to one of his is removed (models, textures, sounds, cfgs, Data/effects/...), except the thumbnails the
//     aircraft selector shows (his images: listed in the report, to replace before publishing)
//   * our models were his glTF + our parts in one .bin (his bytes first, ours appended): the .bin keeps our part only, the glTF reads
//     his geometry from his package (buffer 0, ../../Bgt_F27500v2/model/...); IncludeBase of his behaviours points into his package
//   * texture.cfg of each variation falls back to his texture folders (and to ours for the WT21 hardware), as the liveries do
// What is still derived from his files is listed in the report (to settle with him before publishing): the systems WASM copy, panel.cfg,
// systems.cfg (yaw damper gain), the glTF JSON (his scene with our nodes), the exterior XML.
// Usage: node make-addon.mjs <package source dir> <author package dir> <report.json>
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const [, , pkgDir, authorDir, reportPath] = process.argv;
const AUTHOR_SIM = 'Bgt_F27500v2';
const authorSim = join(authorDir, 'SimObjects', 'Airplanes', AUTHOR_SIM);
const simRoot = join(pkgDir, 'SimObjects', 'Airplanes');
const ourSimName = readdirSync(simRoot).find((d) => statSync(join(simRoot, d)).isDirectory());
const sim = join(simRoot, ourSimName);
const TO_AUTHOR = `..\\..\\${AUTHOR_SIM}`;   // from a folder of our SimObject to his SimObject (one VFS, across packages)
const report = { authorPackage: authorDir, removedIdentical: 0, removedBytes: 0, keptAuthorImages: [], models: [], derived: [], files: 0, bytes: 0 };

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const rel = (p) => relative(pkgDir, p).replace(/\\/g, '/');
const fail = (msg) => { console.error(`make-addon: ${msg}`); process.exit(1); };

if (!existsSync(join(authorSim, 'aircraft.cfg'))) fail(`author's SimObject not found: ${authorSim}`);
if (readFileSync(join(sim, 'aircraft.cfg'), 'utf8').includes('base_container')) fail('already an add-on tree (run scaffold.ps1 -Force first)');

// ---------- 1. our models: his geometry from his package, ours in our .bin ----------
const authorBins = readdirSync(join(authorSim, 'model')).filter((f) => /\.bin$/i.test(f)).map((f) => ({ name: f, data: readFileSync(join(authorSim, 'model', f)) }));
for (const f of readdirSync(join(sim, 'model')).filter((n) => /\.gltf$/i.test(n))) {
  const gltfPath = join(sim, 'model', f);
  const gltf = JSON.parse(readFileSync(gltfPath, 'utf8'));
  if (gltf.buffers.length !== 1) fail(`${f}: ${gltf.buffers.length} buffers`);
  const binPath = join(sim, 'model', gltf.buffers[0].uri);
  const bin = readFileSync(binPath);
  const author = authorBins.filter((a) => bin.length > a.data.length && bin.subarray(0, a.data.length).equals(a.data)).sort((a, b) => b.data.length - a.data.length)[0];
  if (!author) {
    if (authorBins.some((a) => a.data.equals(bin))) continue;   // his own model, untouched: removed with the identical files
    fail(`${f}: its .bin does not start with any of the author's .bin files`);
  }
  const aLen = author.data.length;
  const views = gltf.bufferViews;
  const ours = views.filter((v) => (v.byteOffset ?? 0) >= aLen);
  const straddle = views.filter((v) => (v.byteOffset ?? 0) < aLen && (v.byteOffset ?? 0) + v.byteLength > aLen);
  if (straddle.length) fail(`${f}: ${straddle.length} buffer views straddle the author's data`);
  const start = Math.min(...ours.map((v) => v.byteOffset));
  if (start % 4 !== 0) fail(`${f}: our data starts at ${start}, not 4-aligned`);
  const tail = bin.subarray(start);
  // the split must give back the same bytes: his data, the padding we wrote (zeros), our data
  const gap = bin.subarray(aLen, start);
  if (gap.some((b) => b !== 0)) fail(`${f}: non-zero bytes between his data and ours`);
  for (const v of ours) {
    v.buffer = 1;
    v.byteOffset -= start;
  }
  gltf.buffers = [
    { byteLength: aLen, uri: `../../${AUTHOR_SIM}/model/${author.name}` },
    { byteLength: tail.length, uri: gltf.buffers[0].uri },
  ];
  writeFileSync(binPath, tail);
  writeFileSync(gltfPath, JSON.stringify(gltf));
  report.models.push({ gltf: rel(gltfPath), authorBin: author.name, authorBytes: aLen, ourBytes: tail.length, ourViews: ours.length });
  report.derived.push({ file: rel(gltfPath), why: "glTF JSON: his scene (nodes, materials, animations) with our parts; his geometry stays in his package" });
}

// ---------- 2. our model XMLs include his behaviours from his package ----------
const authorContentInfo = readdirSync(join(authorDir, 'ContentInfo'))[0];
/** Where a file of ours sits in his package (our SimObject and ContentInfo folders carry other names). */
const hisPath = (p) => {
  const r = relative(pkgDir, p).split(/[\\/]/);
  if (r[0] === 'SimObjects' && r[2] === ourSimName) r[2] = AUTHOR_SIM;
  if (r[0] === 'ContentInfo') r[1] = authorContentInfo;
  return join(authorDir, ...r);
};
// his copies are known before anything is rewritten: rewriting his own XMLs' references would make them "ours" (and keep them)
const hisCopies = new Set(walk(pkgDir).filter((p) => existsSync(hisPath(p)) && md5(hisPath(p)) === md5(p)));
for (const f of readdirSync(join(sim, 'model')).filter((n) => /\.xml$/i.test(n))) {
  const p = join(sim, 'model', f);
  if (hisCopies.has(p)) continue;
  let t = readFileSync(p, 'utf8');
  t = t.replace(/RelativeFile="([^"\\/]+)"/g, (m, name) => {
    const ours = join(sim, 'model', name);
    return existsSync(join(authorSim, 'model', name)) && (!existsSync(ours) || hisCopies.has(ours)) ? `RelativeFile="${TO_AUTHOR}\\model\\${name}"` : m;
  });
  writeFileSync(p, t);
}

// ---------- 3. remove every file identical to his file at the same place (but the selector's thumbnails of our variations) ----------
const cfgText = readFileSync(join(sim, 'aircraft.cfg'), 'utf8');
const textures = [...cfgText.matchAll(/^texture\s*=\s*"([^"]*)"/gm)].map((m) => m[1]);
for (const p of hisCopies) {
  const folder = basename(dirname(p));
  if (/[\\/]ContentInfo[\\/]/i.test(p) || (/^thumbnail/i.test(basename(p)) && textures.some((t) => folder.toLowerCase() === `texture.${t}`.toLowerCase()))) {
    report.keptAuthorImages.push(rel(p));
    continue;
  }
  report.removedIdentical++;
  report.removedBytes += statSync(p).size;
  rmSync(p);
}
const prune = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(join(dir, e.name));
  if (readdirSync(dir).length === 0) rmdirSync(dir);
};
prune(pkgDir);

// ---------- 3b. bridges: his XMLs, included from his package, include their siblings by plain names, which the sim resolves from OUR
// model folder (where the root XML is). Add-on test 1: his F275bgt.xml (his BGT_* templates: switches, knobs, push buttons, warning
// lights) was looked for here, and every control built on it was dead or stuck. A bridge is a file of ours with the same name that
// only includes his, from his package.
report.bridges = [];
const crossPrefix = `${TO_AUTHOR}\\model\\`;
const queue = readdirSync(join(sim, 'model')).filter((n) => /\.xml$/i.test(n))
  .flatMap((n) => [...readFileSync(join(sim, 'model', n), 'utf8').matchAll(/RelativeFile="([^"]+)"/g)].map((m) => m[1]))
  .filter((ref) => ref.startsWith(crossPrefix)).map((ref) => ref.slice(crossPrefix.length));
for (const seen = new Set(); queue.length;) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  for (const [, sib] of readFileSync(join(authorSim, 'model', name), 'utf8').matchAll(/RelativeFile="([^"\\/]+)"/g)) {
    queue.push(sib);
    const bridge = join(sim, 'model', sib);
    if (existsSync(bridge)) continue;
    writeFileSync(bridge, ['<?xml version="1.0" encoding="utf-8"?>',
      `<!-- Add-on bridge: the author's model XMLs, included from his package, include "${sib}" by a path the sim resolves from this`,
      '     folder; this file of ours only sends that include on to his own file, in his package. -->',
      '<ModelBehaviors>',
      `\t<Include RelativeFile="${crossPrefix}${sib}"/>`,
      '</ModelBehaviors>', ''].join('\r\n'));
    report.bridges.push(rel(bridge));
  }
}

// his checklist with its paths moved to our folder: his own, inherited, points to his folder where its pictures are
if (existsSync(join(sim, 'Checklist'))) {
  rmSync(join(sim, 'Checklist'), { recursive: true });
  report.removedIdentical++;
}

// ---------- 4. aircraft.cfg: inherit his aircraft, keep our variations ----------
const cfgPath = join(sim, 'aircraft.cfg');
const cfg = readFileSync(cfgPath, 'utf8');
const first = cfg.search(/^\[FLTSIM\.\d+\]/m);
if (first < 0) fail('aircraft.cfg: no [FLTSIM.n]');
writeFileSync(cfgPath, ['[VERSION]', 'major = 1', 'minor = 0', '', '[VARIATION]', `base_container = "..\\${AUTHOR_SIM}"`, '', ''].join('\r\n') + cfg.slice(first));

// ---------- 5. texture folders: his textures through fallbacks, ours (WT21 hardware) in our texture.common ----------
const authorChain = (t) => {
  const c = join(authorSim, `texture.${t}`, 'texture.cfg');
  return existsSync(c) ? [...readFileSync(c, 'utf8').matchAll(/^fallback\.\d+\s*=\s*(.+?)\s*$/gm)].map((m) => m[1]) : [];
};
for (const t of [...new Set(textures)]) {
  const dir = join(sim, `texture.${t}`);
  mkdirSync(dir, { recursive: true });
  const cfgFile = readdirSync(dir).find((n) => /^texture\.cfg$/i.test(n));
  const old = cfgFile ? [...readFileSync(join(dir, cfgFile), 'utf8').matchAll(/^fallback\.\d+\s*=\s*(.+?)\s*$/gm)].map((m) => m[1]) : [];
  let chain;
  if (old.length && old[0].startsWith('..\\..\\')) {
    // a livery of another package (tools\wt21-liveries.json): its folder first, then his folders as the liveries themselves use them
    chain = [old[0], '..\\texture.common', `${TO_AUTHOR}\\texture.vcen`, `${TO_AUTHOR}\\texture`, `${TO_AUTHOR}\\texture.common`];
  } else {
    if (!existsSync(join(authorSim, `texture.${t}`))) fail(`texture.${t}: neither a livery nor one of his texture folders`);
    // one of his liveries: his folder, his own chain for it (in his package), ours for the WT21 hardware, his base folder last
    chain = [`${TO_AUTHOR}\\texture.${t}`, ...authorChain(t).map((f) => f.replace(/^\.\.\\/, `${TO_AUTHOR}\\`)), '..\\texture.common', `${TO_AUTHOR}\\texture`];
    for (const thumb of readdirSync(join(authorSim, `texture.${t}`)).filter((n) => /^thumbnail/i.test(n))) {
      if (!existsSync(join(dir, thumb))) {
        copyFileSync(join(authorSim, `texture.${t}`, thumb), join(dir, thumb));
        report.keptAuthorImages.push(rel(join(dir, thumb)));
      }
    }
  }
  chain = [...new Set(chain)];
  if (cfgFile && cfgFile !== 'texture.cfg') rmSync(join(dir, cfgFile));
  writeFileSync(join(dir, 'texture.cfg'), ['[fltsim]', ...chain.map((c, i) => `fallback.${i + 1}=${c}`)].join('\r\n') + '\r\n');
}

// ---------- 6. what is still derived from his work ----------
const derived = [
  ['systems.cfg', 'his systems.cfg with yaw_damper_gain = 1.0 (his 0 means no yaw damper)'],
  ['panel.WT21/panel.cfg', "his panel.cfg's gauges with the WT21 screens and the tablet added"],
  ['model.wt21/model.CFG', "his model.CFG (KLN90B variant) pointing to our models"],
  ['model/F27500v2bgt_wt21.xml', 'his exterior XML with our chocks, covers and gear pins (his own behaviours inside)'],
];
for (const [f, why] of derived) if (existsSync(join(sim, f))) report.derived.push({ file: rel(join(sim, f)), why });
for (const f of existsSync(join(pkgDir, 'wasm')) ? readdirSync(join(pkgDir, 'wasm')) : []) {
  report.derived.push({ file: `wasm/${f}`, why: 'his systems WASM with the TAPIR mode / trim servo events and the GPU-stairs rule blanked (tools/patch-wasm-wt21.py)' });
}
for (const p of walk(pkgDir)) { report.files++; report.bytes += statSync(p).size; }
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`add-on: ${report.files} files, ${(report.bytes / 1048576).toFixed(1)} MB; removed ${report.removedIdentical} files identical to the author's `
  + `(${(report.removedBytes / 1048576).toFixed(1)} MB); models split: ${report.models.map((m) => `${basename(m.gltf)} (ours ${(m.ourBytes / 1024).toFixed(0)} KB)`).join(', ')}; `
  + `author's images kept: ${report.keptAuthorImages.length}; derived files: ${report.derived.length}; bridges: ${report.bridges.join(', ') || 'none'}`);
