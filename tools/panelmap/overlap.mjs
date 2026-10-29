import { readFileSync } from 'node:fs';
const meta = JSON.parse(readFileSync('out/interior.json','utf8'));
const blob = readFileSync('out/interior.bin'); const nf = meta.vertexFloats;
const V = new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + nf*4));
const hide = JSON.parse(readFileSync(process.argv[2],'utf8'));
const hideNames = new Set(process.argv[3].split(',').flatMap(g=>hide[g]||[]));
const rects = { PFD1:[0.324,0.224,0.649,0.479], PFD2:[-0.5705,0.224,-0.2455,0.479], MFD:[-0.15,0.14,0.15,0.49], CDU:[-0.085,0.66,0.085,0.83] };
for (const [rn, r] of Object.entries(rects)) {
  console.log('==', rn, r.join(' '));
  for (const q of meta.prims) {
    if (['Collision','Occluder'].includes(q.material)) continue;
    if (hideNames.has(q.name)) continue;
    let b=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
    for (let v=0; v<q.vCount; v++) for (let k=0;k<3;k++){ const x=V[(q.vOffset+v)*3+k]; if(x<b[k])b[k]=x; if(x>b[k+3])b[k+3]=x; }
    const ox = b[0] < r[2] && b[3] > r[0], oy = b[1] < r[3] && b[4] > r[1];
    if (ox && oy && b[2] < 9.168 && b[5] > 8.9 && (b[3]-b[0]) < 0.8 && (b[4]-b[1]) < 0.8 && !(q.name||"").startsWith("x0_Struct_") && !(q.name||"").startsWith("x0_Yoke") && !(q.name||"").startsWith("x0_Chrono") && !(q.name||"").startsWith("x0_Glass_Chrono")) console.log('  ', (q.name||'').padEnd(28), (q.material||'').padEnd(24), b.map(v=>(+v.toFixed(3)).toString().padStart(7)).join(' '));
  }
}
