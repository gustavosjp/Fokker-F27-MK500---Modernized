import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('C:/Projetos/bgt-f27500-v2/SimObjects/Airplanes/Bgt_F27500v2/model/F27500v2bgt_INTERIOR.gltf','utf8'));
const parent = new Map(); j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
const roots = j.scenes[0].nodes;
console.log('scene roots', roots.length, 'nodes', j.nodes.length);
const prefixes = process.argv.slice(2);
function sub(i){ let c=1; (j.nodes[i].children||[]).forEach(k=>c+=sub(k)); return c; }
for (const p of prefixes) {
  const hits = j.nodes.map((n,i)=>[n,i]).filter(([n])=>(n.name||'').startsWith(p));
  console.log(p, '->', hits.length, 'nodes');
  for (const [n,i] of hits.slice(0,40)) console.log('   ', i, n.name, 'mesh='+(n.mesh!==undefined), 'children='+(n.children||[]).length, 'subtree='+sub(i), 'parent='+(parent.has(i)? j.nodes[parent.get(i)].name : 'ROOT'));
}
