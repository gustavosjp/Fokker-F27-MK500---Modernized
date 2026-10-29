// Expands the "hide" prefixes of wt21-layout.json into exact node names of the author's interior glTF and checks the node
// hierarchy: hiding a node with ASOBO_GT_Visibility_Code also hides its children, so every child of a hidden node has to be in
// the hidden set too, otherwise something that should stay visible would vanish.
// Usage: node expand-hide.mjs <base interior.gltf> <wt21-layout.json> [out.json]
// stdout: one summary line per group; out.json (optional): { all: [exact node names], groups: { group: [names] } }
import { readFileSync, writeFileSync } from 'node:fs';

const [, , gltfPath, layoutPath, outPath] = process.argv;
if (!gltfPath || !layoutPath) { console.error('usage: node expand-hide.mjs <interior.gltf> <wt21-layout.json> [out.json]'); process.exit(2); }
const gltf = JSON.parse(readFileSync(gltfPath, 'utf8'));
const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));

const groups = {};
const all = new Set();
for (const [group, prefixes] of Object.entries(layout.hide)) {
  const names = gltf.nodes.map((n) => n.name || '').filter((name) => name && prefixes.some((p) => name.startsWith(p)));
  const empty = prefixes.filter((p) => !names.some((n) => n.startsWith(p)));
  if (empty.length) throw new Error(`hide group ${group}: prefix matches no node: ${empty.join(', ')}`);
  groups[group] = names;
  names.forEach((n) => all.add(n));
  console.log(`${group}: ${names.length} nodes`);
}

const indexByName = new Map(gltf.nodes.map((n, i) => [n.name, i]));
let problems = 0;
for (const name of all) {
  const walk = (i) => (gltf.nodes[i].children || []).forEach((c) => {
    if (!all.has(gltf.nodes[c].name)) { console.error(`child ${gltf.nodes[c].name} of hidden ${name} is not in the hide set`); problems++; }
    walk(c);
  });
  walk(indexByName.get(name));
}
if (problems) process.exit(1);
console.log(`total hidden nodes: ${all.size}`);
if (outPath) writeFileSync(outPath, JSON.stringify({ all: [...all], groups }, null, 1));
