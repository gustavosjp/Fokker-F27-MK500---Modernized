// Preview aid for the v10 key press: a copy of the WT21 interior glTF in which some key caps stand at the END of their press animation
// (the pressed position the sim plays for a moment after a click), so a render can be compared with the rest pose. The .bin is copied
// next to it (dump_geometry.mjs reads <name>.bin). Prints each picked key's world position.
// Usage: node make_press_demo.mjs <wt21 gltf> <out dir> KEYNODE [KEYNODE ...]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const [, , src, outDir, ...picked] = process.argv;
const g = JSON.parse(readFileSync(src, 'utf8'));
const bin = readFileSync(join(dirname(src), g.buffers[0].uri));
mkdirSync(outDir, { recursive: true });
for (const name of picked) {
  const an = (g.animations || []).find((a) => a.name === name);
  if (!an) throw new Error(`no press animation ${name}`);
  const s = an.samplers[an.channels[0].sampler], a = g.accessors[s.output], bv = g.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const node = g.nodes[an.channels[0].target.node];
  const pressed = [0, 1, 2].map((k) => bin.readFloatLE(base + 12 + 4 * k));
  console.log(`${name}: rest ${node.translation.map((v) => v.toFixed(4)).join(', ')} -> pressed ${pressed.map((v) => v.toFixed(4)).join(', ')}`);
  node.translation = pressed;
}
const out = join(outDir, basename(src));
copyFileSync(join(dirname(src), g.buffers[0].uri), out.replace(/\.gltf$/i, '.bin'));
g.buffers[0].uri = basename(out).replace(/\.gltf$/i, '.bin');
writeFileSync(out, JSON.stringify(g));
console.log(`wrote ${out}`);
