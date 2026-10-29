// Writes a tiny solid-colour DXT1 texture (with its full mip chain) plus the MSFS ".json" sidecar the author's textures carry.
// Used as the base colour of the WT21 plates (the quads that hide the empty instrument pockets): a TEXTURED material, the same form as
// every material of the author's interior, because a plate with an untextured material (only baseColorFactor) did not show up in the sim.
// Usage: node make-plate-dds.mjs <out.PNG.DDS> <r> <g> <b>
import { writeFileSync } from 'node:fs';

const [, , outPath, r = '36', g = '36', b = '40'] = process.argv;
if (!outPath) { console.error('usage: node make-plate-dds.mjs <out.PNG.DDS> <r> <g> <b>'); process.exit(2); }
const rgb565 = ((Number(r) >> 3) << 11) | ((Number(g) >> 2) << 5) | (Number(b) >> 3);

const SIZE = 64;
const mips = [];
for (let s = SIZE; s >= 1; s = Math.floor(s / 2)) mips.push(s);
const blocksOf = (s) => Math.max(1, Math.ceil(s / 4)) ** 2;

const header = Buffer.alloc(128);
header.write('DDS ', 0, 'ascii');
header.writeUInt32LE(124, 4);                                   // dwSize
header.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000, 8); // CAPS|HEIGHT|WIDTH|PIXELFORMAT|MIPMAPCOUNT|LINEARSIZE
header.writeUInt32LE(SIZE, 12);                                 // height
header.writeUInt32LE(SIZE, 16);                                 // width
header.writeUInt32LE(blocksOf(SIZE) * 8, 20);                   // linear size of the top level
header.writeUInt32LE(mips.length, 28);                          // mip count
header.writeUInt32LE(32, 76);                                   // pixel format size
header.writeUInt32LE(0x4, 80);                                  // DDPF_FOURCC
header.write('DXT1', 84, 'ascii');
header.writeUInt32LE(0x1000 | 0x8 | 0x400000, 108);             // TEXTURE|COMPLEX|MIPMAP

const block = Buffer.alloc(8);
block.writeUInt16LE(rgb565, 0);                                 // colour 0
block.writeUInt16LE(rgb565, 2);                                 // colour 1 (same: solid block)
block.writeUInt32LE(0, 4);                                      // every texel uses colour 0
const data = Buffer.concat(mips.map((s) => Buffer.concat(Array(blocksOf(s)).fill(block))));

writeFileSync(outPath, Buffer.concat([header, data]));
writeFileSync(outPath + '.json', JSON.stringify({ Version: 2, SourceFileDate: 133688302360000000, Flags: ['FL_BITMAP_COMPRESSION', 'FL_BITMAP_MIPMAP'] }));
console.log(`wrote ${outPath} (${SIZE}x${SIZE} DXT1, ${mips.length} mips, rgb ${r},${g},${b})`);
