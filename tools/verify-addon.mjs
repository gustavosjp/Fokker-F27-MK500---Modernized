// v11: offline checks of the add-on form (tools/make-addon.mjs) against the author's package installed in Community: every reference
// of ours into his package resolves, his geometry is the one our models were split from, and nothing of his is carried along.
// Usage: node verify-addon.mjs <add-on package dir (source or built)> <author's pristine package dir> <Community dir>
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const [, , pkgDir, pristineDir, community] = process.argv;
const AUTHOR_SIM = 'Bgt_F27500v2';
const installedDir = join(community, 'bgt-f27500-v2');
const simRoot = join(pkgDir, 'SimObjects', 'Airplanes');
const ourSimName = readdirSync(simRoot)[0];
const sim = join(simRoot, ourSimName);
const hisSim = join(installedDir, 'SimObjects', 'Airplanes', AUTHOR_SIM);
let fail = 0;
const check = (what, ok, detail = '') => {
  console.log(ok ? `  ok   ${what}` : `  FAIL ${what} ${detail}`);
  if (!ok) fail++;
};
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const isBuilt = existsSync(join(pkgDir, 'layout.json'));

/** A SimObject-relative path of ours ("..\..\X\..." goes to the SimObject X of any installed package, as the VFS does). */
const simObjectDirs = (name) => (name === ourSimName ? [sim] : readdirSync(community).map((p) => join(community, p, 'SimObjects', 'Airplanes', name)).filter((d) => existsSync(d)));
const resolveFrom = (folder, path) => {
  const parts = path.split(/[\\/]/).filter((s) => s !== '');
  const abs = resolve(folder, ...parts);
  const r = relative(simRoot, abs).split(/[\\/]/);
  if (r[0] === '..') return [abs];
  return simObjectDirs(r[0]).map((d) => join(d, ...r.slice(1))).filter((p) => existsSync(p));
};

console.log('aircraft.cfg');
const cfg = readFileSync(join(sim, 'aircraft.cfg'), 'utf8');
check(`base_container is his aircraft (..\\${AUTHOR_SIM}), installed in Community`, cfg.includes(`base_container = "..\\${AUTHOR_SIM}"`) && existsSync(join(hisSim, 'aircraft.cfg')));
const blocks = cfg.split(/^(?=\[FLTSIM\.\d+\])/m).filter((b) => b.startsWith('[FLTSIM'));
const field = (b, k) => (b.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm')) ?? [])[1] ?? '';
const hisTitles = [...readFileSync(join(hisSim, 'aircraft.cfg'), 'utf8').matchAll(/^title\s*=\s*"([^"]*)"/gm)].map((m) => m[1]);
const titles = blocks.map((b) => field(b, 'title'));
check(`${blocks.length} variations, titles unique and none of his`, new Set(titles).size === titles.length && !titles.some((t) => hisTitles.includes(t)));
for (const b of blocks) {
  const [m, p, t] = [field(b, 'model'), field(b, 'panel'), field(b, 'texture')];
  check(`${field(b, 'title')}: model.${m}, panel.${p}, texture.${t} are ours`, existsSync(join(sim, `model.${m}`, 'model.CFG')) && existsSync(join(sim, `panel.${p}`, 'panel.cfg')) && existsSync(join(sim, `texture.${t}`, 'texture.cfg')));
}

console.log('texture fallbacks');
const chains = {};
for (const t of [...new Set(blocks.map((b) => field(b, 'texture')))]) {
  const dir = join(sim, `texture.${t}`);
  const fb = [...readFileSync(join(dir, 'texture.cfg'), 'utf8').matchAll(/^fallback\.\d+=(.+?)\s*$/gm)].map((m) => m[1]);
  const dirs = fb.map((f) => resolveFrom(dir, f));
  chains[t] = [dir, ...dirs.flat()];
  const missing = fb.filter((_, i) => dirs[i].length === 0);
  check(`texture.${t}: ${fb.length} fallbacks resolve (his package, the livery's, ours)`, missing.length === 0, missing.join(','));
}

console.log('models');
for (const mdir of readdirSync(sim).filter((d) => d.startsWith('model.'))) {
  const mcfg = readFileSync(join(sim, mdir, 'model.CFG'), 'utf8');
  for (const [, kind, xml] of mcfg.matchAll(/^(normal|interior)\s*=\s*(\S+)/gm)) {
    const xmlPath = resolveFrom(join(sim, mdir), xml)[0];
    check(`${mdir}: ${kind} ${xml}`, !!xmlPath);
    if (!xmlPath) continue;
    const x = readFileSync(xmlPath, 'utf8');
    for (const [, tag, inc] of x.matchAll(/<(IncludeBase|Include) RelativeFile="([^"]+)"/g)) {
      const hit = resolveFrom(dirname(xmlPath), inc);
      // his behaviours come from his package: an include of a plain name would read a file of ours
      check(`${basename(xmlPath)}: ${tag} ${inc} (his package)`, hit.length > 0 && inc.includes(AUTHOR_SIM) && hit[0].startsWith(installedDir));
    }
    for (const [, lod] of x.matchAll(/ModelFile="([^"]+)"/g)) {
      const gltfPath = join(dirname(xmlPath), lod);
      if (!existsSync(gltfPath)) { check(`${basename(xmlPath)}: ${lod}`, false); continue; }
      const g = JSON.parse(readFileSync(gltfPath, 'utf8'));
      const sizes = g.buffers.map((b) => {
        const p = resolveFrom(dirname(gltfPath), b.uri)[0];
        return p ? statSync(p).size : -1;
      });
      check(`${lod}: ${g.buffers.length} buffers, each file there with its length (${g.buffers.map((b) => b.uri).join(' + ')})`, g.buffers.every((b, i) => sizes[i] === b.byteLength), sizes.join(','));
      const his = g.buffers.find((b) => b.uri.includes(AUTHOR_SIM));
      if (his) {
        const installed = resolveFrom(dirname(gltfPath), his.uri)[0];
        const pristine = join(pristineDir, 'SimObjects', 'Airplanes', AUTHOR_SIM, 'model', basename(his.uri));
        check(`${lod}: his geometry (${basename(his.uri)}) installed is the one the model was made from`, !!installed && existsSync(pristine) && md5(installed) === md5(pristine));
      }
      const out = g.bufferViews.filter((v) => (v.byteOffset ?? 0) + v.byteLength > g.buffers[v.buffer].byteLength);
      const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
      const misaligned = g.accessors.filter((a) => a.bufferView !== undefined && ((g.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0)) % size[a.componentType] !== 0);
      check(`${lod}: buffer views inside their buffers, accessors aligned (${g.bufferViews.length} views)`, out.length === 0 && misaligned.length === 0, `${out.length} out, ${misaligned.length} misaligned`);
      // every texture the model names is found along the chain of each variation that shows it
      const images = [...new Set((g.images ?? []).map((i) => i.uri))];
      for (const b of blocks.filter((bb) => `model.${field(bb, 'model')}` === mdir)) {
        const t = field(b, 'texture');
        const lost = images.filter((im) => !chains[t].some((d) => existsSync(join(d, im))));
        check(`${lod} in texture.${t}: all ${images.length} textures found`, lost.length === 0, lost.slice(0, 6).join(','));
      }
    }
  }
}

console.log('panels');
for (const pdir of readdirSync(sim).filter((d) => d.startsWith('panel'))) {
  const pc = readFileSync(join(sim, pdir, 'panel.cfg'), 'utf8');
  const wasm = [...pc.matchAll(/wasm_module=([^&]+)&/g)].map((m) => m[1]);
  check(`${pdir}: WASM ${wasm.join(',')} ours`, wasm.length > 0 && wasm.every((w) => existsSync(join(pkgDir, w))));
  // the sim's own WasmInstrument page runs his WASM gauges; the rest are ours
  const gauges = [...pc.matchAll(/^htmlgauge\d+=([^,?]+\.html)/gm)].map((m) => m[1]).filter((h) => !h.startsWith('WasmInstrument/'));
  const lost = gauges.filter((h) => !existsSync(join(pkgDir, 'html_ui', 'Pages', 'VCockpit', 'Instruments', ...h.split('/'))));
  check(`${pdir}: ${gauges.length} html gauges ours (${gauges.map((h) => h.split('/').slice(-1)[0]).join(', ')})`, gauges.length > 0 && lost.length === 0, lost.join(','));
}

console.log('nothing of his carried along');
const authorContentInfo = readdirSync(join(pristineDir, 'ContentInfo'))[0];
const copies = walk(pkgDir).filter((p) => !/layout\.json$|manifest\.json$/.test(p)).filter((p) => {
  const r = relative(pkgDir, p).split(/[\\/]/);
  if (r[0] === 'SimObjects' && r[2] === ourSimName) r[2] = AUTHOR_SIM;
  if (r[0] === 'ContentInfo') r[1] = authorContentInfo;
  const his = join(pristineDir, ...r);
  return existsSync(his) && md5(his) === md5(p);
});
const images = copies.filter((p) => /thumbnail/i.test(basename(p)) || /[\\/]ContentInfo[\\/]/.test(p));
check(`no copy of his files but the selector images (${images.length}: replace before publishing)`, copies.length === images.length, copies.filter((p) => !images.includes(p)).slice(0, 5).join(','));
// nor a file of his changed in place: the derived files have names of their own, but systems.cfg (the yaw damper gain); aircraft.cfg
// and the variations' texture.cfg are ours by nature (our variations, our fallback chains), as in the liveries of his aircraft
const DERIVED_IN_PLACE = ['systems.cfg'];
const changed = walk(sim).filter((p) => {
  const r = relative(sim, p);
  return existsSync(join(pristineDir, 'SimObjects', 'Airplanes', AUTHOR_SIM, r)) && !/thumbnail/i.test(basename(p)) && !copies.includes(p)
    && !DERIVED_IN_PLACE.includes(r) && r !== 'aircraft.cfg' && !/^texture\.[^\\/]+[\\/]texture\.cfg$/i.test(r);
});
check(`no file of his changed in place but ${DERIVED_IN_PLACE.join(', ')}`, changed.length === 0, changed.map((p) => relative(sim, p)).join(','));
const files = walk(pkgDir);
console.log(`  --   ${files.length} files, ${(files.reduce((n, p) => n + statSync(p).size, 0) / 1048576).toFixed(1)} MB${isBuilt ? ' (built)' : ''}`);
console.log(`result: ${fail} failure(s)`);
process.exit(fail);
