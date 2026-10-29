// Prints the XML interaction components for every click zone of wt21-layout.json (bezel keys/knobs of the units, the FCP panel).
// Node names match make-g1000-interior.mjs: F27WT21_<unit or panel id>_<control name>. {i} in the event code is the instrument index.
// Templates (all defined in the sim's Asobo\Generic\Interactions.xml; the two knob ones are what the author uses):
//   key                -> ASOBO_GT_Interaction_LeftSingle_Code                      (LEFT_SINGLE_CODE)
//   knob               -> ASOBO_GT_Interaction_WheelAndContinuousLeft               (CLOCKWISE_CODE / ANTICLOCKWISE_CODE: wheel, or click on a half)
//   knob with a push   -> ASOBO_GT_Interaction_WheelAndContinuousLeft_LeftSingle    (+ LEFT_SINGLE_CODE on the centre)
// A key with a `lamp` expression also gets a component on its lamp node: ASOBO_GT_Visibility_Code (the expression) + emissive 1.
// A knob also steps L:F27WT21_<owner>_<knob>_Pos and gets an ASOBO_GT_Anim_Code component spinning its knob node (v9.3).
// A key click also stamps the time in L:F27WT21_<owner>_<key>_T, and an ASOBO_GT_Anim_Code component sinks its cap node for a moment (v10).
// Usage: node controls-xml.mjs <wt21-layout.json>
import { readFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const owners = [
  ...L.units.filter((u) => u.controls).map((u) => ({ id: u.id, set: u.controls, index: u.index })),
  ...(L.panels || []).map((p) => ({ id: p.id, set: p.controls, index: p.index })),
];
const out = [];
for (const o of owners) {
  out.push(`\n\t\t<!-- ${o.id}: ${L.controlSets[o.set].controls.length} controls (${o.set}, instrument index ${o.index}) -->`);
  for (const c of L.controlSets[o.set].controls) {
    const node = `F27WT21_${o.id}_${c.name}`;
    const code = (s) => esc(s.replace(/\{i\}/g, String(o.index)));
    // knobs also step their own position 0..100 (5 per detent = 18 deg), which spins the knob node (v9.3, see below)
    const pos = `L:F27WT21_${o.id}_${c.name}_Pos`;
    const cw = c.type === 'knob' ? `${c.cw} (${pos}, number) 5 + 100 % (>${pos}, number)` : c.cw;
    const ccw = c.type === 'knob' ? `${c.ccw} (${pos}, number) 95 + 100 % (>${pos}, number)` : c.ccw;
    // keys stamp the click time first (before the event code, whatever it leaves on the stack), which sinks the cap (v10, see below)
    const stamp = `L:F27WT21_${o.id}_${c.name}_T`;
    let body;
    if (c.type === 'key') {
      body = `\t\t\t<UseTemplate Name="ASOBO_GT_Interaction_LeftSingle_Code">\n\t\t\t\t<LEFT_SINGLE_CODE>${code(`(E:SIMULATION TIME, second) (>${stamp}, number) ${c.click}`)}</LEFT_SINGLE_CODE>\n\t\t\t</UseTemplate>`;
    } else if (c.push) {
      body = `\t\t\t<UseTemplate Name="ASOBO_GT_Interaction_WheelAndContinuousLeft_LeftSingle">\n\t\t\t\t<CLOCKWISE_CODE>${code(cw)}</CLOCKWISE_CODE>\n\t\t\t\t<ANTICLOCKWISE_CODE>${code(ccw)}</ANTICLOCKWISE_CODE>\n\t\t\t\t<LEFT_SINGLE_CODE>${code(c.push)}</LEFT_SINGLE_CODE>\n\t\t\t</UseTemplate>`;
    } else {
      body = `\t\t\t<UseTemplate Name="ASOBO_GT_Interaction_WheelAndContinuousLeft">\n\t\t\t\t<CLOCKWISE_CODE>${code(cw)}</CLOCKWISE_CODE>\n\t\t\t\t<ANTICLOCKWISE_CODE>${code(ccw)}</ANTICLOCKWISE_CODE>\n\t\t\t</UseTemplate>`;
    }
    out.push(`\t\t<Component ID="F27WT21Ctl_${o.id}_${c.name}" Node="${node}">\n${body}\n\t\t</Component>`);
    if (c.type === 'knob') {   // the knob node WT21_<owner>_knob_<name> and its glTF animation of the same name (make-g1000-interior.mjs)
      const kn = `WT21_${o.id}_knob_${c.name}`;
      out.push(`\t\t<Component ID="F27WT21Knob_${o.id}_${c.name}" Node="${kn}">\n` +
        `\t\t\t<UseTemplate Name="ASOBO_GT_Anim_Code">\n\t\t\t\t<ANIM_NAME>${kn}</ANIM_NAME>\n\t\t\t\t<ANIM_CODE>(${pos}, number)</ANIM_CODE>\n` +
        `\t\t\t\t<ANIM_WRAP>True</ANIM_WRAP>\n\t\t\t\t<ANIM_LAG>200</ANIM_LAG>\n\t\t\t</UseTemplate>\n\t\t</Component>`);
    }
    if (c.type === 'key') {   // the cap node WT21_<owner>_key_<name> and its press animation of the same name (make-g1000-interior.mjs)
      // seconds since the click t -> 0..100: in over 40 ms, held, out by 180 ms (min(25 t, 1, 25 (0.18 - t)), clamped at 0, so a clock
      // that went back leaves it up); the curve is the motion, ANIM_LAG only smooths it
      const kn = `WT21_${o.id}_key_${c.name}`, t = `(E:SIMULATION TIME, second) (${stamp}, number) -`;
      out.push(`\t\t<Component ID="F27WT21Key_${o.id}_${c.name}" Node="${kn}">\n` +
        `\t\t\t<UseTemplate Name="ASOBO_GT_Anim_Code">\n\t\t\t\t<ANIM_NAME>${kn}</ANIM_NAME>\n` +
        `\t\t\t\t<ANIM_CODE>${esc(`${t} 25 * 1 min 0.18 ${t} - 25 * min 0 max 100 *`)}</ANIM_CODE>\n` +
        `\t\t\t\t<ANIM_LAG>1500</ANIM_LAG>\n\t\t\t</UseTemplate>\n\t\t</Component>`);
    }
    if (c.lamp) {   // the key's lamp bar (WT21_<owner>_lamp_<key>, make-g1000-interior.mjs): shown and lit while the mode is on
      out.push(`\t\t<Component ID="F27WT21Lamp_${o.id}_${c.name}" Node="WT21_${o.id}_lamp_${c.name}">\n` +
        `\t\t\t<UseTemplate Name="ASOBO_GT_Visibility_Code">\n\t\t\t\t<VISIBILITY_CODE>${code(c.lamp)}</VISIBILITY_CODE>\n\t\t\t</UseTemplate>\n` +
        `\t\t\t<UseTemplate Name="ASOBO_GT_Material_Emissive_Code">\n\t\t\t\t<EMISSIVE_CODE>1</EMISSIVE_CODE>\n\t\t\t</UseTemplate>\n\t\t</Component>`);
    }
  }
}
// v10.3: tablets fold away. The bezel strips (F27WT21_<id>_EDGE_T/B/L/R) toggle L:F27TAB_Stowed; the arm's swing and the tablet's
// joint (make-g1000-interior.mjs) play their animations on it.
for (const u of L.units.filter((x) => x.tablet && x.tablet.arm)) {
  out.push(`\n\t\t<!-- ${u.id}: the tablet folds against the wall, and back, on a click on its bezel (or from its Settings page) -->`);
  for (const side of ['T', 'B', 'L', 'R']) {
    out.push(`\t\t<Component ID="F27WT21Tab_${u.id}_EDGE_${side}" Node="F27WT21_${u.id}_EDGE_${side}">\n` +
      `\t\t\t<UseTemplate Name="ASOBO_GT_Interaction_LeftSingle_Code">\n\t\t\t\t<LEFT_SINGLE_CODE>${esc('(L:F27TAB_Stowed, Bool) ! (>L:F27TAB_Stowed, Bool)')}</LEFT_SINGLE_CODE>\n` +
      `\t\t\t</UseTemplate>\n\t\t</Component>`);
  }
  for (const part of ['swing', 'joint']) {
    const name = `F27_WT21_${u.id}_${part}`;
    out.push(`\t\t<Component ID="F27WT21Tab_${u.id}_${part}" Node="${name}">\n` +
      `\t\t\t<UseTemplate Name="ASOBO_GT_Anim_Code">\n\t\t\t\t<ANIM_NAME>${name}</ANIM_NAME>\n\t\t\t\t<ANIM_CODE>(L:F27TAB_Stowed, Bool) 100 *</ANIM_CODE>\n` +
      `\t\t\t\t<ANIM_LAG>140</ANIM_LAG>\n\t\t\t</UseTemplate>\n\t\t</Component>`);
  }
}
process.stdout.write(out.join('\n') + '\n');
