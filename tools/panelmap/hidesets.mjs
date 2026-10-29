import { readFileSync, writeFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('C:/Projetos/bgt-f27500-v2/SimObjects/Airplanes/Bgt_F27500v2/model/F27500v2bgt_INTERIOR.gltf','utf8'));
const meta = JSON.parse(readFileSync('out/interior.json','utf8'));
const blob = readFileSync('out/interior.bin');
const nf = meta.vertexFloats;
const V = new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + nf*4));
const parent = new Map(); j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
const children = i => j.nodes[i].children || [];
const sets = JSON.parse(readFileSync(process.argv[2],'utf8'));
// bbox per node from dump
const bb = new Map();
for (const p of meta.prims) {
  let b = bb.get(p.node) || [1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for (let v=0; v<p.vCount; v++) for (let k=0;k<3;k++){ const x=V[(p.vOffset+v)*3+k]; if(x<b[k])b[k]=x; if(x>b[k+3])b[k+3]=x; }
  bb.set(p.node,b);
}
const out = {};
for (const [group, prefixes] of Object.entries(sets)) {
  const names = new Set();
  j.nodes.forEach((n,i)=>{ if (prefixes.some(p=>(n.name||'').startsWith(p))) names.add(i); });
  // closure
  const closure = new Set();
  const walk = i => { closure.add(i); children(i).forEach(walk); };
  [...names].forEach(walk);
  const extra = [...closure].filter(i=>!names.has(i));
  let b=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for (const i of names) { const q=bb.get(i); if(!q) continue; for(let k=0;k<3;k++){ if(q[k]<b[k])b[k]=q[k]; if(q[k+3]>b[k+3])b[k+3]=q[k+3]; } }
  console.log(group, 'nodes', names.size, 'closure-extras', extra.map(i=>j.nodes[i].name).join(',')||'-', 'bbox', b.map(v=>+v.toFixed(3)).join(' '));
  out[group] = [...names].map(i=>j.nodes[i].name);
}
writeFileSync(process.argv[3], JSON.stringify(out,null,1));
