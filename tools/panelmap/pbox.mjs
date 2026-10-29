import { readFileSync } from 'node:fs';
const meta = JSON.parse(readFileSync('out/interior.json','utf8'));
const blob = readFileSync('out/interior.bin'); const nf = meta.vertexFloats;
const V = new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + nf*4));
for (const p of process.argv.slice(2)) {
  const hits = meta.prims.filter(q=>(q.name||'').startsWith(p));
  let b=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
  for (const q of hits) for (let v=0; v<q.vCount; v++) for (let k=0;k<3;k++){ const x=V[(q.vOffset+v)*3+k]; if(x<b[k])b[k]=x; if(x>b[k+3])b[k+3]=x; }
  console.log(p.padEnd(22), String(hits.length).padStart(3), b.map(v=>(+v.toFixed(3)).toString().padStart(7)).join(' '), [...new Set(hits.map(h=>h.material))].join('|'));
}
