// Derives F27500v2bgt_INTERIOR_g1000.gltf from the author's base interior glTF by adding two cockpit screens
// (G1000 PFD and MFD). No binary data is touched: each screen is a new mesh entry that reuses the accessors of the
// author's GNS530 screen quad (4:3), plus a new "$gauges..." material, plus a node. The new glTF keeps pointing at the
// same .bin as the base interior.
//
// Why a JSON-only edit works: the author's own "$gaugesF27gps" material is just a name + emissiveFactor; the "$" prefix
// is what binds it to a [VcockpitNN] texture in panel.cfg. We do the same with two new material names.
//
// IMPORTANT (found by in-sim tests on 2026-10-16): the screens only show the page when the interior XML ALSO carries a
// component with the ASOBO_GT_Material_Emissive_Code template on each screen node (see scaffold.ps1). Without any component
// the screen stays black (CTRL1 gltf A, CTRL3 gltf B), and so did ASOBO_GT_Component_Emissive_Gauge + ASOBO_GT_Visibility.
//
// Usage: node make-g1000-interior.mjs <base.gltf> <out.gltf> [emissive-only|gps-clone]
//   emissive-only  (default, proven) the new materials are just { name, emissiveFactor:[1,1,1] }, the form the FSS 727 uses
//                  for its "$..._Screen" materials. Its base colour defaults to white, so a screen whose dynamic texture is
//                  NOT bound shows up bright white, while a bound-but-blank texture stays black (a useful diagnostic).
//   gps-clone      the new materials are copies of the author's $gaugesF27gps material (did not show the page in tests,
//                  but only ever tested WITHOUT the Material_Emissive_Code component, so the material form is not proven guilty)
//
// A 4th argument selects the screen preset: "g1000" (default: PFD + MFD) or "wt21" (the layout in wt21-layout.json: captain PFD,
// centre MFD, CDU on the GPS 530 housing, copilot PFD): per unit a screen quad in front of a dark textured plate quad.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as HW from './hw3d.mjs';

// ---- quaternions ([x, y, z, w] as in glTF) for mounted units ----
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
function quatFromMatrix(m) {   // m[row][col], a proper rotation
  const t = m[0][0] + m[1][1] + m[2][2];
  let x, y, z, w;
  if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); w = 0.25 / s; x = (m[2][1] - m[1][2]) * s; y = (m[0][2] - m[2][0]) * s; z = (m[1][0] - m[0][1]) * s; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]); w = (m[2][1] - m[1][2]) / s; x = 0.25 * s; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s; }
  else if (m[1][1] > m[2][2]) { const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]); w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = 0.25 * s; z = (m[1][2] + m[2][1]) / s; }
  else { const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]); w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}
/** Rotation taking a panel unit (faces the pilot: viewer side -z, up +y, its right -x) to face `normal` with its top towards `up`. */
function quatFromBasis(normal, up) {
  const n = norm3(normal), right = norm3(cross3(up, n)), u = cross3(n, right);
  const c0 = right.map((v) => -v), c2 = n.map((v) => -v);   // where world x and z of the panel-unit frame go (y goes to u)
  return quatFromMatrix([[c0[0], u[0], c2[0]], [c0[1], u[1], c2[1]], [c0[2], u[2], c2[2]]]);
}
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qRotate = (q, v) => { const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [r[0], r[1], r[2]]; };

// 5th argument (wt21): where to write the hardware atlas map read by make-hw-atlas.py (kept out of the package).
const [, , basePath, outPath, materialForm = 'emissive-only', presetName = 'g1000', atlasMapPath = join(tmpdir(), 'f27-hw-atlas.json')] = process.argv;

// Provisional placement (metres, glTF space; +x is the aircraft's LEFT, the glTF here is right-handed with z forward).
// PILOT_0 (captain) sits at x=+0.489, z=8.565 facing +z; the panel instruments are at z~9.17, so z=9.12 puts the glass ~5 cm
// in front of them. These cover existing instruments on purpose: they only prove the screens work.
const PRESETS = {
  g1000: [
    { name: 'G1000_PFD_screen', material: '$gaugesF27g1000pfd', translation: [0.4865, 0.4066, 9.12], widthM: 0.205 },
    { name: 'G1000_MFD_screen', material: '$gaugesF27g1000mfd', translation: [0.0300, 0.4066, 9.12], widthM: 0.205 },
  ],
};
// wt21: positions and sizes come from wt21-layout.json (shared with the offline Blender preview and with scaffold.ps1). Each unit is a
// screen quad (the page) in front of a plate quad (hides the empty instrument pockets; textured dark material, see below).
let LAYOUT = null;
if (presetName === 'wt21') {
  // F27_WT21_LAYOUT overrides the layout file (layout proposals are generated into a sandbox from their own copy)
  LAYOUT = JSON.parse(readFileSync(process.env.F27_WT21_LAYOUT || join(dirname(fileURLToPath(import.meta.url)), 'wt21-layout.json'), 'utf8'));
  PRESETS.wt21 = LAYOUT.units.map((u) => ({
    name: u.node, material: u.material, translation: [u.screen.center[0], u.screen.center[1], u.screenZ ?? LAYOUT.screenZ], sizeM: u.screen.size,
  }));
}
const SCREENS = PRESETS[presetName];
if (!basePath || !outPath || !['gps-clone', 'emissive-only'].includes(materialForm) || !SCREENS) {
  console.error('usage: node make-g1000-interior.mjs <base.gltf> <out.gltf> [emissive-only|gps-clone] [g1000|wt21]');
  process.exit(2);
}

const gltf = JSON.parse(readFileSync(basePath, 'utf8'));

const SOURCE_NODE = 'AS530_screen';
const GPS_MATERIAL = '$gaugesF27gps';
const SOURCE_QUAD_WIDTH_M = 0.10888692736625671; // from the quad's POSITION accessor (2 * 0.0544434...)
const SOURCE_QUAD_HEIGHT_M = 0.07962357997894287; // 2 * 0.0398118...; the quad is centred on its node origin and lies in the xy plane

const sourceNodeIndex = gltf.nodes.findIndex((n) => n.name === SOURCE_NODE);
if (sourceNodeIndex < 0) throw new Error(`node ${SOURCE_NODE} not found`);
const sourceMesh = gltf.meshes[gltf.nodes[sourceNodeIndex].mesh];
const gpsMaterialIndex = gltf.materials.findIndex((m) => m.name === GPS_MATERIAL);
if (gpsMaterialIndex < 0) throw new Error(`material ${GPS_MATERIAL} not found`);

// wt21 makes its screens below as exact-size meshes (see addQuad); only the g1000 preset still scales clones of the GPS quad.
for (const s of presetName === 'wt21' ? [] : SCREENS) {
  if (gltf.nodes.some((n) => n.name === s.name)) throw new Error(`node ${s.name} already exists`);
  if (gltf.materials.some((m) => m.name === s.material)) throw new Error(`material ${s.material} already exists`);

  const materialIndex = gltf.materials.length;
  gltf.materials.push(
    materialForm === 'emissive-only'
      ? { name: s.material, emissiveFactor: [1, 1, 1] }
      : { ...structuredClone(gltf.materials[gpsMaterialIndex]), name: s.material },
  );

  const mesh = structuredClone(sourceMesh);
  mesh.name = s.name;
  mesh.primitives[0].material = materialIndex;
  const meshIndex = gltf.meshes.length;
  gltf.meshes.push(mesh);

  // widthM keeps the quad's own aspect (1.368:1, the original behaviour); sizeM stretches it to exactly width x height
  const scale = s.sizeM ? [s.sizeM[0] / SOURCE_QUAD_WIDTH_M, s.sizeM[1] / SOURCE_QUAD_HEIGHT_M, 1] : [s.widthM / SOURCE_QUAD_WIDTH_M, s.widthM / SOURCE_QUAD_WIDTH_M, 1];
  const nodeIndex = gltf.nodes.length;
  gltf.nodes.push({
    translation: s.translation,
    scale,
    mesh: meshIndex,
    extensions: { ASOBO_unique_id: { id: s.name } },
    name: s.name,
  });
  gltf.scenes[0].nodes.push(nodeIndex);
  console.log(`added ${s.name}: node ${nodeIndex}, mesh ${meshIndex}, material ${materialIndex} (${s.material}), scale ${scale.map((v) => v.toFixed(3)).join(' x ')}`);
}

// Hardware, plates, panels and click zones (wt21 only).
// * v8 (CJ4 style): display frames, panel-coloured inserts, the FCP and the DCPs are REAL 3D meshes (hw3d.mjs) in the interior's own vertex
//   format, appended to a copy of the interior .bin; they share one atlas material (F27WT21_HW.PNG.DDS, painted by make-hw-atlas.py from the
//   atlas map written here). A unit without a frame would still get the flat textured plate + four wall quads of v7 (none since v9).
// * Every control gets an invisible click zone: a quad with the author's own "Collision" material, the form of his click spots
//   (e.g. x0_Btn_Feather01_Pull), just in front of the key cap / knob; scaffold.ps1 puts the XML interaction on it.
// * v9.1 (test 9): every added quad (screens, click zones, plates, wall pieces) is a GENERATED mesh of exactly its size with NO node
//   scale. The sim turns a non-uniform node scale into a uniform one (about the mean of x, y, z; the author's 1352 nodes have only 3
//   slightly non-uniform scales), so the old scaled clones of the GPS quad came out the wrong size: the portrait screens showed as
//   small landscape quads, and the click zones grew ~4 cm wide and overlapped, so a click took the first neighbour (ALT -> VS,
//   TERR WX -> TFC, NAV -> CRS 1).
let binChunks = null, binState = null;
/** Appends a generated mesh (hw3d MeshBuilder, panel space) as a scene node at `translation` (or as a child of node `parent`); no scale,
 * optional rotation. */
function appendNode(name, mb, translation, material, rotation = null, quiet = false, parent = null) {
  if (gltf.nodes.some((n) => n.name === name)) throw new Error(`node ${name} already exists`);
  const r = HW.addMesh(gltf, binChunks, binState, name, material, mb);
  const nodeIndex = gltf.nodes.length;
  gltf.nodes.push({ translation, ...(rotation ? { rotation } : {}), mesh: r.mesh, extensions: { ASOBO_unique_id: { id: name } }, name });
  if (parent === null) gltf.scenes[0].nodes.push(nodeIndex);
  else (gltf.nodes[parent].children ||= []).push(nodeIndex);
  if (!quiet) console.log(`added ${name}: ${r.vertices} vertices, ${r.triangles} triangles`);
  return nodeIndex;
}
/** Exact-size quad facing the pilot (-z) at `center`, uv 0..1 with (0,0) at its top-left as seen from the front, like the GPS quad. */
function addQuad(name, materialIndex, center, size, rotation = null, quiet = true) {
  const mb = new HW.MeshBuilder();
  HW.flatRect(mb, -size[0] / 2, -size[1] / 2, size[0] / 2, size[1] / 2, 0, { u0: 0, v0: 0, u1: 1, v1: 1 });
  return appendNode(name, mb, center, materialIndex, rotation, quiet);
}
if (LAYOUT) {
  // ---- binary: copy of the interior .bin; every new mesh is appended to it ----
  const baseBin = readFileSync(join(dirname(basePath), gltf.buffers[0].uri));
  binChunks = [baseBin];
  binState = { length: baseBin.length };
  const texMaterials = new Map();
  const texturedMaterial = (materialName, ddsName) => {
    if (texMaterials.has(ddsName)) return texMaterials.get(ddsName);
    if (gltf.materials.some((m) => m.name === materialName)) throw new Error(`material ${materialName} already exists`);
    const imageIndex = gltf.images.length;
    gltf.images.push({ uri: ddsName, name: ddsName.replace(/\.PNG\.DDS$/i, '').toLowerCase(), extras: 'ASOBO_image_converted_meta' });
    const textureIndex = gltf.textures.length;
    gltf.textures.push({ extensions: { MSFT_texture_dds: { source: imageIndex } } });
    const index = gltf.materials.length;
    gltf.materials.push({ name: materialName, pbrMetallicRoughness: { baseColorTexture: { index: textureIndex }, metallicFactor: 0, roughnessFactor: 0.7 } });
    texMaterials.set(ddsName, index);
    return index;
  };
  const collisionIndex = gltf.materials.findIndex((m) => m.name === 'Collision');
  if (collisionIndex < 0) throw new Error('material Collision not found');
  const H = Math.SQRT1_2;
  // Closed boxes for flat plates: four wall quads; the quad faces -z in its own frame, so +90 deg about x faces up, -90 down; about y,
  // -90 faces +x (the aircraft's left), +90 faces -x.
  const addWalls = (prefix, materialIndex, c, size, zFront, zBack) => {
    const depth = zBack - zFront, zm = (zFront + zBack) / 2, [w, h] = size;
    if (depth <= 0.0005) return 0;
    for (const [side, centre, rotation, sz] of [
      ['top', [c[0], c[1] + h / 2, zm], [H, 0, 0, H], [w, depth]], ['bottom', [c[0], c[1] - h / 2, zm], [-H, 0, 0, H], [w, depth]],
      ['left', [c[0] + w / 2, c[1], zm], [0, -H, 0, H], [depth, h]], ['right', [c[0] - w / 2, c[1], zm], [0, H, 0, H], [depth, h]]]) {
      addQuad(`${prefix}_wall_${side}`, materialIndex, centre, sz, rotation);
    }
    return 4;
  };
  // ---- screens: one exact-size quad per unit with its own "$gauges..." material (bound to its [VcockpitNN] by name) ----
  // v10.2: a touchscreen (the tablet) also carries the Collision tag, the flag that makes the sim's mouse ray hit the screen and hand
  // the click to its interactive gauge (MSFS DevSupport: "set the collision flag on your material"; the author's click spots use it)
  for (const u of LAYOUT.units) {
    if (gltf.materials.some((m) => m.name === u.material)) throw new Error(`material ${u.material} already exists`);
    const materialIndex = gltf.materials.length;
    const touch = u.touch ? { extensions: { ASOBO_tags: { tags: ['Collision'] } } } : {};
    gltf.materials.push(materialForm === 'emissive-only' ? { name: u.material, emissiveFactor: [1, 1, 1], ...touch } : { ...structuredClone(gltf.materials[gpsMaterialIndex]), name: u.material, ...touch });
    addQuad(u.node, materialIndex, [u.screen.center[0], u.screen.center[1], u.screenZ ?? LAYOUT.screenZ], u.screen.size, null, false);
  }
  const plainPlate = () => texturedMaterial(LAYOUT.plateMaterial, LAYOUT.plateTexture);
  plainPlate();   // always created: the walls of moved instruments use it even when no unit is a flat plate (v9: the CDU got a frame)
  const faceZ = LAYOUT.panelFaceZ ?? 9.17;

  // ---- atlas ----
  const C = LAYOUT.colors;
  const atlas = new HW.Atlas(2048);
  const FACE_PPM = 6800;   // face art pixels per metre
  for (const [setName, cs] of Object.entries(LAYOUT.controlSets)) {
    if (cs.style === '3d' && cs.face === 'module') {
      atlas.add(`face:${setName}`, Math.round(cs.size[0] * FACE_PPM / 4) * 4, Math.round(cs.size[1] * FACE_PPM / 4) * 4, { kind: 'face', color: cs.color ?? C.module, size: cs.size, labels: cs.labels || [] });
    }
  }
  const swatches = { panel: C.panel, module: C.module, frame: C.frame, keySide: C.keySide, knob: C.knob, recess: C.recess, lampOn: C.lampOn };
  if (C.tabletCase) Object.assign(swatches, { tabletCase: C.tabletCase, tabletGlass: C.tabletGlass, tabletMount: C.tabletMount });
  for (const [nm, col] of Object.entries(swatches)) {
    atlas.add(`swatch:${nm}`, 64, 64, { kind: 'swatch', color: col });
  }
  atlas.add('knurl', 256, 64, { kind: 'knurl', color: C.knob });
  atlas.add('knobTop', 128, 128, { kind: 'knobTop', color: C.knob });
  for (const [setName, cs] of Object.entries(LAYOUT.controlSets)) {
    if (cs.style !== '3d') continue;
    for (const c of cs.controls) {
      if (c.type !== 'key') continue;
      // cell at the cap's own aspect (10 px per mm, or the set's legendPpm: v10.9.1 the CDU at 16) so the legend is not stretched
      const ppm = cs.legendPpm ?? 10000;
      const cw = ((c.rect[2] - c.rect[0]) * cs.size[0] - 0.0022) * ppm, ch = ((c.rect[3] - c.rect[1]) * cs.size[1] - 0.0022) * ppm;
      atlas.add(`key:${setName}:${c.name}`, Math.round(cw / 4) * 4, Math.round(ch / 4) * 4, { kind: 'key', label: c.label, light: !!c.light, color: C.keyCap, lamp: C.lampOff });
    }
  }
  const uvOf = (name, inset = 0) => HW.uvRect(atlas, atlas.cells[name].rect, inset);
  const hwMaterial = texturedMaterial('F27_WT21_hw', 'F27WT21_HW.PNG.DDS');
  // lit lamp bars of the autopilot keys: the same atlas as base colour AND emission (they point at the lampOn swatch); each lamp is
  // its own node, shown by its key's `lamp` expression (controls-xml.mjs)
  const atlasTexture = gltf.materials[hwMaterial].pbrMetallicRoughness.baseColorTexture.index;
  const lampMaterial = gltf.materials.length;
  gltf.materials.push({ name: 'F27_WT21_lamp', pbrMetallicRoughness: { baseColorTexture: { index: atlasTexture }, metallicFactor: 0, roughnessFactor: 0.5 }, emissiveTexture: { index: atlasTexture }, emissiveFactor: [1, 1, 1] });

  const addHwNode = (name, mb, translation, material = hwMaterial) => appendNode(name, mb, translation, material);

  // ---- controls: geometry (panel space) and click zones (world) ----
  const geom = (c, W, Hh) => ({ cx: ((c.rect[0] + c.rect[2]) / 2 - 0.5) * W, cy: (0.5 - (c.rect[1] + c.rect[3]) / 2) * Hh, w: (c.rect[2] - c.rect[0]) * W, h: (c.rect[3] - c.rect[1]) * Hh });
  // v9.3 (test 10: "não vejo alteração ao rodar"): the turning part of every knob is its own node, centred on the knob's axis, so a
  // glTF animation can spin it (addKnobs); only a plain knob's low skirt stays in the module mesh.
  // v10 (test 12: "efeito nos botões do FMC ao clicar"): likewise every key cap is its own node, centred on the key, so a glTF animation
  // can push it into its panel (addKeys, addKeyPresses).
  const addControlGeometry = (mb, setName, c, W, Hh, knobs, keys) => {
    const g = geom(c, W, Hh);
    if (c.type === 'key') {
      const kb = new HW.MeshBuilder();
      HW.keyCap(kb, 0, 0, g.w, g.h, 0, c.height ?? 0.004, 0.0011, uvOf(`key:${setName}:${c.name}`), uvOf('swatch:keySide', 0.25));
      keys.push({ c, kb, g });
      return;
    }
    const R = g.w / 2, h = c.height ?? 0.012, km = new HW.MeshBuilder();
    if (c.concentric === 'outer') {   // v9.4 dual knob, outer ring (turns on its own; its centre is the matching 'inner' control)
      HW.cylinder(km, 0, 0, R, 0, h * 0.45, 32, uvOf('knurl'), null);
      HW.annulus(km, 0, 0, R * 0.62, R, h * 0.45, 32, uvOf('swatch:knob', 0.25));
    } else if (c.concentric === 'inner') {   // v9.4 dual knob, centre knob standing on the ring
      HW.cylinder(km, 0, 0, R * 0.62, h * 0.45, h, 32, uvOf('knurl'), uvOf('knobTop'));
    } else if (c.concentric) {   // outer ring + inner knob, like the CJ4 DCP knobs (turns as one)
      HW.cylinder(km, 0, 0, R, 0, h * 0.45, 32, uvOf('knurl'), null);
      HW.annulus(km, 0, 0, R * 0.62, R, h * 0.45, 32, uvOf('swatch:knob', 0.25));
      HW.cylinder(km, 0, 0, R * 0.62, h * 0.45, h, 32, uvOf('knurl'), uvOf('knobTop'));
    } else {               // low skirt (fixed) + knob (turns)
      HW.cylinder(mb, g.cx, g.cy, R, 0, 0.0018, 32, uvOf('swatch:knob', 0.25), null);
      HW.annulus(mb, g.cx, g.cy, R * 0.84, R, 0.0018, 32, uvOf('swatch:knob', 0.25));
      HW.cylinder(km, 0, 0, R * 0.84, 0.0018, h, 32, uvOf('knurl'), uvOf('knobTop'));
    }
    knobs.push({ name: c.name, km, cx: g.cx, cy: g.cy });
  };
  // knob nodes + their spin animations: the author's knob form (x0_CRS_01_Knob: rotation, LINEAR, 5 keys over 100 frames at 24 fps,
  // driven 0..100 by ASOBO_GT_Anim_Code); a full clockwise turn (seen from the seat: +z, the pilot looks along +z) over 0..100
  const animData = (floats) => {
    const buf = Buffer.from(new Float32Array(floats).buffer);
    const pad = (4 - (binState.length % 4)) % 4;
    if (pad) { binChunks.push(Buffer.alloc(pad)); binState.length += pad; }
    gltf.bufferViews.push({ buffer: 0, byteOffset: binState.length, byteLength: buf.length });
    binChunks.push(buf); binState.length += buf.length;
    return gltf.bufferViews.length - 1;
  };
  let knobCount = 0;
  const addKnobs = (prefix, knobs, T, mounted) => {
    if (knobs.length && mounted) throw new Error(`${prefix}: knobs on a mounted unit are not supported (the spin would replace the mount rotation)`);
    for (const k of knobs) {
      const name = `WT21_${prefix}_knob_${k.name}`;
      const node = appendNode(name, k.km, [T[0] - k.cx, T[1] + k.cy, T[2]], hwMaterial, null, true);
      const times = [0, 1, 2, 3, 4].map((i) => (i * 25) / 24);
      const quats = [0, 1, 2, 3, 4].flatMap((i) => [0, 0, Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)]);
      gltf.accessors.push({ bufferView: animData(times), byteOffset: 0, componentType: 5126, count: 5, type: 'SCALAR', min: [0], max: [times[4]] });
      const input = gltf.accessors.length - 1;
      gltf.accessors.push({ bufferView: animData(quats), byteOffset: 0, componentType: 5126, count: 5, type: 'VEC4' });
      const output = gltf.accessors.length - 1;
      (gltf.animations ||= []).push({ name, channels: [{ sampler: 0, target: { node, path: 'rotation' } }], samplers: [{ input, output, interpolation: 'LINEAR' }] });
      knobCount++;
    }
  };
  // key cap nodes; a key with a `lamp` expression also gets a lamp node over the lamp bar painted on its cap (make-hw-atlas.py: 22..78 %
  // wide, 10..20 % down), a CHILD of the cap so it sinks with it
  let lamps = 0;
  const pressKeys = [];
  const addKeys = (prefix, keys, T) => {
    for (const { c, kb, g } of keys) {
      const height = c.height ?? 0.004;
      const node = appendNode(`WT21_${prefix}_key_${c.name}`, kb, [T[0] - g.cx, T[1] + g.cy, T[2]], hwMaterial, null, true);
      pressKeys.push({ node, depth: Math.min(0.0015, 0.6 * height) });
      if (!c.lamp) continue;
      const ch = 0.0011, zt = height + 0.0003, tx0 = -g.w / 2 + ch, tw = g.w - 2 * ch, ty1 = g.h / 2 - ch, th = g.h - 2 * ch;
      const mb = new HW.MeshBuilder();
      HW.flatRect(mb, tx0 + 0.22 * tw, ty1 - 0.20 * th, tx0 + 0.78 * tw, ty1 - 0.10 * th, zt, uvOf('swatch:lampOn', 0.25));
      appendNode(`WT21_${prefix}_lamp_${c.name}`, mb, [0, 0, 0], lampMaterial, null, true, node);
      lamps++;
    }
  };
  // the press itself, once mounted units are in place: rest -> `depth` into the panel along the cap's own height axis (local +z, so it
  // follows a mounted unit's rotation), over the knobs' 0..100 frame range; controls-xml.mjs holds it at 100 for a moment after a click
  const addKeyPresses = () => {
    for (const { node, depth } of pressKeys) {
      const n = gltf.nodes[node], t = n.translation, d = qRotate(n.rotation || [0, 0, 0, 1], [0, 0, depth]);
      gltf.accessors.push({ bufferView: animData([0, 100 / 24]), byteOffset: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [100 / 24] });
      const input = gltf.accessors.length - 1;
      gltf.accessors.push({ bufferView: animData([...t, t[0] + d[0], t[1] + d[1], t[2] + d[2]]), byteOffset: 0, componentType: 5126, count: 2, type: 'VEC3' });
      (gltf.animations ||= []).push({ name: n.name, channels: [{ sampler: 0, target: { node, path: 'translation' } }], samplers: [{ input, output: gltf.accessors.length - 1, interpolation: 'LINEAR' }] });
    }
  };
  let zones = 0;
  const addZones = (prefix, setName, center, size, zSurface) => {
    const cs = LAYOUT.controlSets[setName];
    for (const c of cs.controls) {
      const g = geom(c, size[0], size[1]);
      const name = `F27WT21_${prefix}_${c.name}`, at = (zz) => [center[0] - g.cx, center[1] + g.cy, zz];
      // panel X is the aircraft's right (-x); the zone sits just in front of the key cap / knob top. A dual knob's ring takes a ring-
      // shaped zone and its centre a disc, so the two never overlap (v9.4).
      if (c.concentric === 'outer' || c.concentric === 'inner') {
        const R = g.w / 2, h = c.height ?? 0.012, mb = new HW.MeshBuilder();
        const outer = c.concentric === 'outer';
        HW.annulus(mb, 0, 0, outer ? R * 0.62 + 0.0005 : 0.0002, outer ? R : R * 0.62, 0, 32, { u0: 0, v0: 0, u1: 1, v1: 1 });
        appendNode(name, mb, at(zSurface - (outer ? h * 0.45 : h) - 0.0012), collisionIndex, null, true);
      } else {
        addQuad(name, collisionIndex, at(zSurface - (c.height ?? 0) - 0.0012), [g.w, g.h]);
      }
      zones++;
    }
  };

  // ---- display units ----
  for (const u of LAYOUT.units) {
    const z = u.plateZ ?? LAYOUT.plateZ;
    const back = u.backZ ?? faceZ;
    if (u.tablet) {   // v10.2: the tablet: a rounded slab (black glass front, case-coloured sides and back) and a round mount puck behind
      const [W, Hh] = u.plate.size, t = u.tablet;
      const mb = new HW.MeshBuilder();
      HW.roundedSlab(mb, W, Hh, t.radius, -(back - z), 0, uvOf('swatch:tabletGlass', 0.25), uvOf('swatch:tabletCase', 0.25), uvOf('swatch:tabletCase', 0.25));
      const mount = uvOf('swatch:tabletMount', 0.25), capZ = -(back - z) - t.puckDepth;
      HW.cylinder(mb, 0, 0, t.puckRadius, capZ, -(back - z), 24, mount, null);
      const cap = Array.from({ length: 24 }, (_, k) => [t.puckRadius * Math.cos((-2 * Math.PI * k) / 24), t.puckRadius * Math.sin((-2 * Math.PI * k) / 24), capZ]);
      mb.fan(cap, cap.map(() => [(mount.u0 + mount.u1) / 2, (mount.v0 + mount.v1) / 2]));   // the puck's end, facing back (-Z)
      addHwNode(`WT21_${u.id}_hw`, mb, [u.plate.center[0], u.plate.center[1], z]);
      // v10.3: the bezel as four click strips around (never over) the touchscreen: a click folds the tablet away or brings it back
      const [sw, sh] = u.screen.size, bx = (W - sw) / 2, by = (Hh - sh) / 2;
      for (const [side, cx, cy, w, h] of [['T', 0, (sh + by) / 2, W, by], ['B', 0, -(sh + by) / 2, W, by], ['L', -(sw + bx) / 2, 0, bx, sh], ['R', (sw + bx) / 2, 0, bx, sh]]) {
        addQuad(`F27WT21_${u.id}_EDGE_${side}`, collisionIndex, [u.plate.center[0] - cx, u.plate.center[1] + cy, z - 0.0012], [w, h]);
      }
    } else if (u.frame) {
      const [W, Hh] = u.plate.size, f = u.frame;
      const mb = new HW.MeshBuilder();
      const body = uvOf(`swatch:${u.body ?? 'panel'}`, 0.25);   // panel-coloured insert over the pockets, or the CDU's own grey body
      HW.box(mb, -W / 2, -Hh / 2, W / 2, Hh / 2, -(back - z), 0, body, body);
      const sx = -(u.screen.center[0] - u.plate.center[0]), sy = u.screen.center[1] - u.plate.center[1];
      const [sw, sh] = u.screen.size;
      HW.frame(mb, sx, sy, sw + 2 * f.border, sh + 2 * f.border, sw, sh, 0, f.depth, f.depth - f.recess, f.chamfer, uvOf('swatch:frame', 0.25));
      const knobs = [], keys = [];
      if (u.controls) for (const c of LAYOUT.controlSets[u.controls].controls) addControlGeometry(mb, u.controls, c, W, Hh, knobs, keys);
      addHwNode(`WT21_${u.id}_hw`, mb, [u.plate.center[0], u.plate.center[1], z]);
      addKnobs(u.id, knobs, [u.plate.center[0], u.plate.center[1], z], !!u.mount);
      addKeys(u.id, keys, [u.plate.center[0], u.plate.center[1], z]);
      if (u.controls) addZones(u.id, u.controls, u.plate.center, u.plate.size, z);
    } else {
      const name = u.node.replace('_screen', '_plate');
      addQuad(name, plainPlate(), [u.plate.center[0], u.plate.center[1], z], u.plate.size);
      addWalls(name, plainPlate(), u.plate.center, u.plate.size, z, back);
      console.log(`added ${name}: flat plate (${LAYOUT.plateTexture})`);
    }
  }
  // ---- control modules (FCP, DCPs) ----
  for (const p of LAYOUT.panels || []) {
    const cs = LAYOUT.controlSets[p.controls];
    const [W, Hh] = p.size;
    const mb = new HW.MeshBuilder();
    HW.box(mb, -W / 2, -Hh / 2, W / 2, Hh / 2, -((p.backZ ?? faceZ) - p.z), 0, uvOf(`face:${p.controls}`), uvOf('swatch:module', 0.25));
    const knobs = [], keys = [];
    for (const c of cs.controls) addControlGeometry(mb, p.controls, c, W, Hh, knobs, keys);
    addHwNode(`WT21_${p.id}_hw`, mb, [p.center[0], p.center[1], p.z]);
    addKnobs(p.id, knobs, [p.center[0], p.center[1], p.z], !!p.mount);
    addKeys(p.id, keys, [p.center[0], p.center[1], p.z]);
    addZones(p.id, p.controls, p.center, p.size, p.z);
  }
  console.log(`click zones: ${zones}, keys: ${pressKeys.length}, key lamps: ${lamps}, turning knobs: ${knobCount}`);

  // ---- copies of the author's own art (v9.3: the AP servo-switch panel moved with its switches, same look and legends) ----
  // Asobo meshes share one index accessor per mesh; a primitive owns [StartIndex, StartIndex + 3 * PrimitiveCount) of it.
  const primTriangles = (prim) => {
    const ia = gltf.accessors[prim.indices], bv = gltf.bufferViews[ia.bufferView], base = (bv.byteOffset || 0) + (ia.byteOffset || 0);
    const read = (k) => (ia.componentType === 5125 ? baseBin.readUInt32LE(base + k * 4) : baseBin.readUInt16LE(base + k * 2));
    const ap = prim.extras?.ASOBO_primitive || {}, start = ap.StartIndex ?? 0, n = ap.PrimitiveCount ?? (ia.count - start) / 3, vb = ap.BaseVertexIndex ?? 0;
    const tris = [];
    for (let t = 0; t < n; t++) tris.push([read(start + 3 * t) + vb, read(start + 3 * t + 1) + vb, read(start + 3 * t + 2) + vb]);
    return tris;
  };
  const srcNode = (name) => {
    const i = gltf.nodes.findIndex((n) => n.name === name);
    const n = gltf.nodes[i];
    if (i < 0 || !gltf.scenes[0].nodes.includes(i) || n.scale) throw new Error(`copy: ${name} must be an unscaled scene root`);
    return n;
  };
  const toWorld = (n, p) => { const r = qRotate(n.rotation || [0, 0, 0, 1], p); const t = n.translation || [0, 0, 0]; return [r[0] + t[0], r[1] + t[1], r[2] + t[2]]; };
  for (const cp of LAYOUT.copies || []) {
    const off = cp.offset;
    if (cp.type === 'triangles') {   // raw copy of every triangle fully inside the box, same material, same local frame + offset
      const [x0, x1, y0, y1, z0, z1] = cp.box;
      for (const name of cp.nodes) {
        const n = srcNode(name), mesh = gltf.meshes[n.mesh];
        const prims = [];
        for (const prim of mesh.primitives) {
          // all of the author's meshes share one interleaved vertex bufferView; an accessor's byteOffset = the mesh's block start +
          // the attribute's offset in the 36-byte record, so a record starts at bufferView offset + block start + k * stride
          const pa = gltf.accessors[prim.attributes.POSITION], pbv = gltf.bufferViews[pa.bufferView], stride = pbv.byteStride;
          const block = Math.min(...Object.values(prim.attributes).map((ai) => gltf.accessors[ai].byteOffset || 0));
          const rec = (k) => (pbv.byteOffset || 0) + block + k * stride;
          const pOff = (pa.byteOffset || 0) - block;
          const pos = (k) => [baseBin.readFloatLE(rec(k) + pOff), baseBin.readFloatLE(rec(k) + pOff + 4), baseBin.readFloatLE(rec(k) + pOff + 8)];
          const inside = (k) => { const w = toWorld(n, pos(k)); return w[0] >= x0 && w[0] <= x1 && w[1] >= y0 && w[1] <= y1 && w[2] >= z0 && w[2] <= z1; };
          const sel = primTriangles(prim).filter((t) => t.every(inside));
          if (sel.length) prims.push({ prim, sel, stride, rec, block });
        }
        if (!prims.length) throw new Error(`copy ${cp.id}: nothing of ${name} inside the box`);
        const outPrims = [];
        for (const { prim, sel, stride, rec, block } of prims) {
          const map = new Map();
          const order = [];
          for (const t of sel) for (const k of t) if (!map.has(k)) { map.set(k, order.length); order.push(k); }
          const vbuf = Buffer.concat(order.map((k) => baseBin.subarray(rec(k), rec(k) + stride)));
          const big = order.length > 65535;
          const ibuf = Buffer.alloc(sel.length * 3 * (big ? 4 : 2));
          sel.flat().forEach((k, j) => (big ? ibuf.writeUInt32LE(map.get(k), j * 4) : ibuf.writeUInt16LE(map.get(k), j * 2)));   // author's winding kept
          const pad = () => { const p = (4 - (binState.length % 4)) % 4; if (p) { binChunks.push(Buffer.alloc(p)); binState.length += p; } };
          pad();
          const vView = gltf.bufferViews.length;
          gltf.bufferViews.push({ buffer: 0, byteOffset: binState.length, byteLength: vbuf.length, byteStride: stride, target: 34962 });
          binChunks.push(vbuf); binState.length += vbuf.length;
          pad();
          const iView = gltf.bufferViews.length;
          gltf.bufferViews.push({ buffer: 0, byteOffset: binState.length, byteLength: ibuf.length, target: 34963 });
          binChunks.push(ibuf); binState.length += ibuf.length;
          const attributes = {};
          for (const [att, ai] of Object.entries(prim.attributes)) {
            const a = gltf.accessors[ai], inRec = (a.byteOffset || 0) - block;
            if (inRec < 0 || inRec >= stride || a.bufferView !== gltf.accessors[prim.attributes.POSITION].bufferView) throw new Error(`copy ${cp.id}: attribute ${att} outside the vertex record`);
            const na = { bufferView: vView, byteOffset: inRec, componentType: a.componentType, count: order.length, type: a.type, ...(a.normalized ? { normalized: true } : {}) };
            if (att === 'POSITION') {
              const ps = order.map((k) => [0, 1, 2].map((d) => baseBin.readFloatLE(rec(k) + inRec + 4 * d)));
              na.min = [0, 1, 2].map((d) => Math.min(...ps.map((p) => p[d]))); na.max = [0, 1, 2].map((d) => Math.max(...ps.map((p) => p[d])));
            }
            gltf.accessors.push(na); attributes[att] = gltf.accessors.length - 1;
          }
          gltf.accessors.push({ bufferView: iView, byteOffset: 0, componentType: big ? 5125 : 5123, count: sel.length * 3, type: 'SCALAR' });
          outPrims.push({ attributes, indices: gltf.accessors.length - 1, material: prim.material, mode: 4, extras: { ASOBO_primitive: { PrimitiveCount: sel.length, VertexType: 'VTX', VertexVersion: 2 } } });
        }
        const nodeName = `F27_WT21_copy_${cp.id}_${name}`;
        gltf.meshes.push({ name: nodeName, primitives: outPrims });
        const t = n.translation || [0, 0, 0];
        gltf.nodes.push({ translation: [t[0] + off[0], t[1] + off[1], t[2] + off[2]], ...(n.rotation ? { rotation: n.rotation } : {}), mesh: gltf.meshes.length - 1, extensions: { ASOBO_unique_id: { id: nodeName } }, name: nodeName });
        gltf.scenes[0].nodes.push(gltf.nodes.length - 1);
        console.log(`copied ${cp.id}: ${prims.reduce((s, p) => s + p.sel.length, 0)} triangles of ${name} in ${prims.length} material(s)`);
      }
    } else if (cp.type === 'face') {   // a quad on a flat horizontal face, textured with the source material's own UV mapping there
      const n = srcNode(cp.node), mesh = gltf.meshes[n.mesh];
      const mi = gltf.materials.findIndex((m) => m.name === cp.material);
      const prim = mesh.primitives.find((p) => p.material === mi);
      if (!prim) throw new Error(`copy ${cp.id}: ${cp.node} has no ${cp.material} primitive`);
      const pa = gltf.accessors[prim.attributes.POSITION], ua = gltf.accessors[prim.attributes.TEXCOORD_0], bv = gltf.bufferViews[pa.bufferView];
      const rec = (k) => (bv.byteOffset || 0) + k * bv.byteStride;
      const half = (h) => { const s = h >> 15 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15); };
      const world = (k) => toWorld(n, [0, 1, 2].map((d) => baseBin.readFloatLE(rec(k) + (pa.byteOffset || 0) + 4 * d)));
      const uvOfV = (k) => [half(baseBin.readUInt16LE(rec(k) + (ua.byteOffset || 0))), half(baseBin.readUInt16LE(rec(k) + (ua.byteOffset || 0) + 2))];
      const tris = primTriangles(prim).filter((t) => t.every((k) => Math.abs(world(k)[1] - cp.y) < 0.0015));
      const [x0, x1, z0, z1] = cp.rect;
      // sample a 5 x 5 grid of the rectangle and fit u, v = a x + b z + c (the face is planar-mapped); refuse if it is not affine
      const rows = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const x = x0 + (x1 - x0) * (0.02 + 0.96 * i / 4), z = z0 + (z1 - z0) * (0.02 + 0.96 * j / 4);
        for (const t of tris) {
          const [A, B, C] = t.map(world);
          const det = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
          if (Math.abs(det) < 1e-14) continue;
          const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / det, l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / det, l3 = 1 - l1 - l2;
          if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
          const [ua0, ub0, uc0] = t.map(uvOfV);
          rows.push([x, z, l1 * ua0[0] + l2 * ub0[0] + l3 * uc0[0], l1 * ua0[1] + l2 * ub0[1] + l3 * uc0[1]]);
          break;
        }
      }
      if (rows.length < 12) throw new Error(`copy ${cp.id}: only ${rows.length} of 25 sample points on the face`);
      const fit = (col) => {   // least squares a x + b z + c
        let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, s1 = 0, sxu = 0, szu = 0, su = 0;
        for (const r of rows) { const [x, z] = r, u = r[col]; sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; s1 += 1; sxu += x * u; szu += z * u; su += u; }
        const M = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, s1]], R = [sxu, szu, su];
        const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        const D = det3(M);
        const sol = [0, 1, 2].map((c) => det3(M.map((row, ri) => row.map((v, ci) => (ci === c ? R[ri] : v)))) / D);
        const resid = Math.max(...rows.map((r) => Math.abs(sol[0] * r[0] + sol[1] * r[1] + sol[2] - r[col])));
        return { f: (x, z) => sol[0] * x + sol[1] * z + sol[2], resid };
      };
      const fu = fit(2), fv = fit(3);
      if (fu.resid > 0.0005 || fv.resid > 0.0005) throw new Error(`copy ${cp.id}: the face's texture mapping is not affine (residual ${Math.max(fu.resid, fv.resid)})`);
      // quad in builder space (X = -x, Y = y, Z = -z) around the rectangle's centre, facing up; the builder wants CCW from the viewer
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const corners = [[x1, z0], [x0, z0], [x0, z1], [x1, z1]];
      let pts = corners.map(([x, z]) => [-(x - cx), 0, -(z - cz)]);
      let uvs = corners.map(([x, z]) => [fu.f(x, z), fv.f(x, z)]);
      const nrm = cross3([pts[1][0] - pts[0][0], 0, pts[1][2] - pts[0][2]], [pts[2][0] - pts[0][0], 0, pts[2][2] - pts[0][2]]);
      if (nrm[1] < 0) { pts = pts.reverse(); uvs = uvs.reverse(); }
      const mb = new HW.MeshBuilder();
      mb.quad(pts, uvs);
      appendNode(`F27_WT21_copy_${cp.id}`, mb, [cx + off[0], cp.y + off[1], cz + off[2]], mi);
      console.log(`copied ${cp.id}: face of ${cp.node} (${cp.material}) ${(x1 - x0).toFixed(4)} x ${(z1 - z0).toFixed(4)} m, uv fit residual ${Math.max(fu.resid, fv.resid).toExponential(1)}`);
    }
  }

  // Mounted units/panels (v9: the CDU on the pedestal): laid out above exactly like a vertical panel unit, then every node of the unit
  // (screen quad, 3D body, lamps, click zones) is turned and moved as one piece: the face centre (plate centre at plateZ, the pivot)
  // goes to mount.origin, the face normal (towards the viewer, -z for a panel unit) to mount.normal and the unit's "up" to mount.up.
  const sceneRoots = new Set(gltf.scenes[0].nodes);
  for (const o of [...LAYOUT.units, ...(LAYOUT.panels || [])]) {
    if (!o.mount) continue;
    const q = quatFromBasis(o.mount.normal, o.mount.up);
    const pivot = o.plate ? [o.plate.center[0], o.plate.center[1], o.plateZ ?? LAYOUT.plateZ] : [o.center[0], o.center[1], o.z];
    const mine = (n) => n.name === o.node || n.name.startsWith(`WT21_${o.id}_`) || n.name.startsWith(`F27WT21_${o.id}_`);
    let moved = 0;
    for (const [i, n] of gltf.nodes.entries()) {
      if (!n.name || !mine(n) || !sceneRoots.has(i)) continue;   // children (key lamps) follow their parent
      const d = qRotate(q, [n.translation[0] - pivot[0], n.translation[1] - pivot[1], n.translation[2] - pivot[2]]);
      n.translation = [o.mount.origin[0] + d[0], o.mount.origin[1] + d[1], o.mount.origin[2] + d[2]];
      n.rotation = n.rotation ? qMul(q, n.rotation) : q;
      moved++;
    }
    console.log(`mounted ${o.id}: ${moved} nodes turned to face ${o.mount.normal.join(',')} and placed at ${o.mount.origin.join(', ')}`);
  }
  // v10.2: the tablet's arm, a rod from a base plate on the side wall (B) to the mount puck on the tablet's back (A).
  // v10.3 (user: "ao clicar em alguma borda movimentar ele, porque ele tá tapando alguns instrumentos"): it folds away. Hierarchy
  //   swing (root at B, turns about the vertical by arm.swingDeg) -> the rod, and joint (at A, turns the tablet flat against the wall,
  //   screen inboard) -> the tablet's body, screen and bezel click zones;
  // both turns are 2-key rotation animations of the same name driven 0..100 by L:F27TAB_Stowed (controls-xml.mjs), so every
  // in-between pose keeps the parts joined.
  const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const rotationAnim = (name, node, q0, q1) => {
    gltf.accessors.push({ bufferView: animData([0, 100 / 24]), byteOffset: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [100 / 24] });
    const input = gltf.accessors.length - 1;
    gltf.accessors.push({ bufferView: animData([...q0, ...q1]), byteOffset: 0, componentType: 5126, count: 2, type: 'VEC4' });
    (gltf.animations ||= []).push({ name, channels: [{ sampler: 0, target: { node, path: 'rotation' } }], samplers: [{ input, output: gltf.accessors.length - 1, interpolation: 'LINEAR' }] });
  };
  for (const u of LAYOUT.units) {
    if (!u.tablet || !u.tablet.arm) continue;
    const t = u.tablet, a = t.arm, hw = gltf.nodes.find((n) => n.name === `WT21_${u.id}_hw`);
    const z = u.plateZ ?? LAYOUT.plateZ, back = u.backZ ?? faceZ;
    const qUse = hw.rotation || [0, 0, 0, 1];
    const off = qRotate(qUse, [0, 0, back - z + t.puckDepth]);   // local +z = out of the tablet's back
    const A = hw.translation.map((v, k) => v + off[k]), B = a.to;
    const d = A.map((v, k) => v - B[k]), len = Math.hypot(...d), dir = d.map((v) => v / len);
    const mount = uvOf('swatch:tabletMount', 0.25);
    const base = new HW.MeshBuilder();
    HW.roundedSlab(base, a.base[0], a.base[1], 0.006, -a.base[2], 0, mount, mount, mount);
    appendNode(`F27_WT21_${u.id}_arm_base`, base, B, hwMaterial, quatFromBasis(a.wallNormal, [0, 1, 0]));
    const swing = gltf.nodes.length;
    gltf.nodes.push({ translation: [...B], children: [], extensions: { ASOBO_unique_id: { id: `F27_WT21_${u.id}_swing` } }, name: `F27_WT21_${u.id}_swing` });
    gltf.scenes[0].nodes.push(swing);
    const rod = new HW.MeshBuilder();
    HW.cylinder(rod, 0, 0, a.radius, 0, len, 16, mount, null);
    appendNode(`F27_WT21_${u.id}_arm`, rod, [0, 0, 0], hwMaterial, quatFromBasis(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), true, swing);
    const joint = gltf.nodes.length;
    gltf.nodes.push({ translation: d, children: [], extensions: { ASOBO_unique_id: { id: `F27_WT21_${u.id}_joint` } }, name: `F27_WT21_${u.id}_joint` });
    gltf.nodes[swing].children.push(joint);
    const mine = (n) => n.name === u.node || n.name.startsWith(`WT21_${u.id}_`) || n.name.startsWith(`F27WT21_${u.id}_`);
    let carried = 0;
    for (const [i, n] of gltf.nodes.entries()) {
      const k = gltf.scenes[0].nodes.indexOf(i);
      if (!n.name || !mine(n) || k < 0) continue;
      gltf.scenes[0].nodes.splice(k, 1);
      n.translation = n.translation.map((v, j) => v - A[j]);   // same rotation (both parents are unturned at rest)
      gltf.nodes[joint].children.push(i);
      carried++;
    }
    const th = (a.swingDeg * Math.PI) / 180, qSwing = [0, Math.sin(th / 2), 0, Math.cos(th / 2)];
    const qJoint = qMul(qMul(qConj(qSwing), quatFromBasis(a.wallNormal, [0, 1, 0])), qConj(qUse));
    rotationAnim(`F27_WT21_${u.id}_swing`, swing, [0, 0, 0, 1], qSwing);
    rotationAnim(`F27_WT21_${u.id}_joint`, joint, [0, 0, 0, 1], qJoint);
    console.log(`tablet ${u.id}: arm ${(len * 100).toFixed(1)} cm from the wall at ${B.join(', ')}; ${carried} nodes on its joint; folds ${a.swingDeg} deg flat against the wall`);
  }
  addKeyPresses();
  writeFileSync(atlasMapPath, JSON.stringify(atlas.toJSON(), null, 1));
  console.log(`atlas map: ${Object.keys(atlas.cells).length} cells -> ${atlasMapPath}`);
}

// Moved instruments (wt21 only): the root nodes picked by name prefix (their children follow) are re-parented under a NEW carrier
// node whose transform does the move: x/y scaled by `scale` about `from` and placed at `to`, depth kept (z scaled about the panel
// face, < 1 mm error). A carrier instead of editing each node keeps every authored animation valid, including translation
// animations (the standby horizon's aircraft symbol, the altimeter flags), whose keys are in the node's local space.
const PANEL_Z = 9.165;
if (LAYOUT && LAYOUT.move) {
  const parentOf = new Map();
  gltf.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
  const roots = gltf.scenes[0].nodes;
  for (const m of LAYOUT.move) {
    const picked = new Set(gltf.nodes.map((n, i) => [n, i]).filter(([n]) => m.nodes.some((p) => (n.name || '').startsWith(p))).map(([, i]) => i));
    if (!picked.size) throw new Error(`move ${m.id}: no node matches ${m.nodes.join(', ')}`);
    const tops = [...picked].filter((i) => !(parentOf.has(i) && picked.has(parentOf.get(i))));
    for (const i of tops) {
      if (parentOf.has(i)) throw new Error(`move ${m.id}: ${gltf.nodes[i].name} has a parent outside the group`);
      const k = roots.indexOf(i);
      if (k < 0) throw new Error(`move ${m.id}: ${gltf.nodes[i].name} is not a scene root`);
      roots.splice(k, 1);
    }
    const s = m.scale;
    const sz = s;   // uniform only: a depth-only scale made the horizon vanish in the sim (test 6); use dz to bring a deep instrument forward
    const name = `F27_WT21_move_${m.id}`;
    const carrier = gltf.nodes.length;
    gltf.nodes.push({
      translation: [m.to[0] - s * m.from[0], m.to[1] - s * m.from[1], (1 - sz) * PANEL_Z + (m.dz ?? 0)],
      scale: [s, s, sz],
      children: tops,
      extensions: { ASOBO_unique_id: { id: name } },
      name,
    });
    roots.push(carrier);
    console.log(`moved ${m.id}: carrier node ${carrier} holds ${tops.map((i) => gltf.nodes[i].name).join(', ')}`);
    if (m.box) {   // walls from the moved frame's front to the panel face (the group stands proud of the panel by -dz)
      const [x0, y0, x1, y1] = m.box;
      const cx = m.to[0] + s * ((x0 + x1) / 2 - m.from[0]), cy = m.to[1] + s * ((y0 + y1) / 2 - m.from[1]);
      const plateIdx = gltf.materials.findIndex((mm) => mm.name === LAYOUT.plateMaterial);
      if (plateIdx < 0) throw new Error('plate material missing for move box');
      const name = `F27_WT21_move_${m.id}_box`;
      const zFront = 9.163 + (m.dz ?? 0), zBack = LAYOUT.panelFaceZ ?? 9.17;
      const H = Math.SQRT1_2, w = s * (x1 - x0), h = s * (y1 - y0), depth = zBack - zFront, zm = (zFront + zBack) / 2;
      for (const [side, centre, rotation, sz2] of [
        ['top', [cx, cy + h / 2, zm], [H, 0, 0, H], [w, depth]], ['bottom', [cx, cy - h / 2, zm], [-H, 0, 0, H], [w, depth]],
        ['left', [cx + w / 2, cy, zm], [0, -H, 0, H], [depth, h]], ['right', [cx - w / 2, cy, zm], [0, H, 0, H], [depth, h]]]) {
        addQuad(`${name}_${side}`, plateIdx, centre, sz2, rotation);   // exact-size quad, no scale (it also becomes a scene root)
      }
      console.log(`  box walls for ${m.id}: ${w.toFixed(3)} x ${h.toFixed(3)} m, ${depth.toFixed(4)} m deep`);
    }
  }
}

if (binChunks) {   // the wt21 glTF gets its own .bin: the author's data unchanged + the new hardware meshes
  const outBin = outPath.replace(/\.gltf$/i, '.bin');
  gltf.buffers[0] = { byteLength: binState.length, uri: basename(outBin) };
  writeFileSync(outBin, Buffer.concat(binChunks));
  console.log(`wrote ${outBin} (${binState.length} bytes)`);
}
writeFileSync(outPath, JSON.stringify(gltf));
console.log(`wrote ${outPath}`);
