// Writes the WT21 variation's copy of the author's interior behaviours WITHOUT the mouse interactions of the parts it hides.
// Why: hiding a node (ASOBO_GT_Visibility_Code 0) stops drawing it but not its knob/switch interaction, so the old CRS knobs and
// selectors behind the new FCP, the old AP warning switches behind the DCPs, etc. still took clicks meant for the new keys (test 8).
// Only top-level Components on a hidden node whose template is interactive (the author's BGT knobs, switches, buttons, levers, and
// ASOBO interactions) are dropped; everything else of the author's XML is copied byte for byte. The G1000 variation keeps the original.
//
// Usage: node make-wt21-base-xml.mjs <author interior xml> <hide json from expand-hide.mjs> <out xml> [--list]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , authorPath, hidePath, outPath, flag] = process.argv;
const src = readFileSync(authorPath, 'utf8');
const hidden = new Set(JSON.parse(readFileSync(hidePath, 'utf8')).all);
const INTERACTIVE = /^(BGT_(Knob|Switch|Btn|Button|Push|Lever|Selector|Rotary|Toggle|Guard|Cover)|ASOBO_GT_(Interaction|Push|Switch|Knob|Lever))/i;

// top-level <Component ...> ... </Component> blocks inside <Behaviors>, with nesting counted
const tag = /<Component\b[^>]*?(\/?)>|<\/Component\s*>/g;
const blocks = [];
let depth = 0, start = -1, open = '';
for (let m; (m = tag.exec(src));) {
  if (m[0].startsWith('</')) {
    depth--;
    if (depth === 0) blocks.push({ start, end: m.index + m[0].length, open });
  } else if (m[1] !== '/') {
    if (depth === 0) { start = m.index; open = m[0]; }
    depth++;
  }
}
if (depth !== 0) throw new Error('unbalanced <Component> tags');

const drop = [], keptHidden = [];
for (const b of blocks) {
  const node = /Node="([^"]+)"/.exec(b.open)?.[1];
  if (!node || !hidden.has(node)) continue;
  const body = src.slice(b.start, b.end);
  const nested = (body.match(/<Component\b/g) || []).length - 1;
  const templates = [...body.matchAll(/<UseTemplate\s+Name="([^"]+)"/g)].map((t) => t[1]);
  const interactive = templates.filter((t) => INTERACTIVE.test(t));
  if (interactive.length && nested === 0) drop.push({ ...b, node, templates });
  else keptHidden.push({ node, templates, nested });
}

let out = '', at = 0;
for (const b of drop) {
  out += src.slice(at, b.start) + `<!-- F27 WT21: interaction of hidden ${b.node} (${b.templates.join(', ')}) removed -->`;
  at = b.end;
}
out += src.slice(at);
writeFileSync(outPath, out);
console.log(`base xml: ${blocks.length} components, dropped ${drop.length} interactions of hidden parts -> ${outPath}`);
if (flag === '--list') {
  for (const b of drop) console.log(`  drop ${b.node.padEnd(28)} ${b.templates.join(', ')}`);
  const kinds = new Map();
  for (const k of keptHidden) for (const t of k.templates) kinds.set(t, (kinds.get(t) || 0) + 1);
  console.log('  kept on hidden nodes (not interactive):', [...kinds].map(([t, n]) => `${t} x${n}`).join(', '));
}
