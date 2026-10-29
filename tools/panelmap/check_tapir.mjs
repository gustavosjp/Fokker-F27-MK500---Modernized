// v10.9 offline scenarios for the Classic cockpit's TAPIR layer (plugin-wt21, src/tablet/tapir.ts): a fake sim records the K: events
// the layer sends and plays the WT21 autopilot's side (the pitch reference moves 0.5 degree per AP_PITCH_REF_INC event, as the SDK's
// APPitchDirector does; AP_ALT_VAR_SET_ENGLISH sets the selected altitude). Each step is what the panel does and what must be sent.
// Usage: node check_tapir.mjs <plugin-wt21/build/tablet/tapir.js>   -> one JSON line, ok true/false
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const copy = join(tmpdir(), 'f27-check-tapir.mjs');   // the build is plain ES modules in .js files
writeFileSync(copy, readFileSync(process.argv[2], 'utf8'));
const { TapirBridge } = await import(pathToFileURL(copy).href);
const vars = new Map(Object.entries({
  'AUTOPILOT MASTER': 0, 'L:f275_AP_Turn_Rotac': 0, 'PLANE HEADING DEGREES MAGNETIC': 40.4, 'L:F275bgt_hdg_sel': 90,
  'NAV HAS LOCALIZER:1': 0, 'L:f275_AP_Sw_LocAr_Pos': 0, 'AUTOPILOT GLIDESLOPE ACTIVE': 0, 'AUTOPILOT PITCH HOLD': 0,
  'L:f275_AP_Pitch_Wheel': 0, 'AUTOPILOT PITCH HOLD REF': 0, 'AUTOPILOT ALTITUDE LOCK VAR': 9000, 'AIRSPEED INDICATED': 180.4,
  'VERTICAL SPEED': 500,
}));
for (const m of ['hdg', 'vorapp', 'ias', 'alt']) { vars.set(`L:f275_Btn_AP_${m}_Pos`, 0); vars.set(`L:F275bgt_warn_BtnAP_${m}`, 0); }
let events = [];
const sim = {
  get: (n) => { if (!vars.has(n)) throw new Error(`unread var ${n}`); return vars.get(n); },
  getString: () => '',
  set: (n, _u, v) => {
    if (!n.startsWith('K:')) throw new Error(`unexpected write ${n}`);
    const k = n.slice(2);
    events.push(v || k.endsWith('_SET_ENGLISH') ? `${k} ${v}` : k);
    if (k === 'AP_PITCH_REF_INC_UP') vars.set('AUTOPILOT PITCH HOLD REF', vars.get('AUTOPILOT PITCH HOLD REF') - 0.5);
    if (k === 'AP_PITCH_REF_INC_DN') vars.set('AUTOPILOT PITCH HOLD REF', vars.get('AUTOPILOT PITCH HOLD REF') + 0.5);
    if (k === 'AP_ALT_VAR_SET_ENGLISH') vars.set('AUTOPILOT ALTITUDE LOCK VAR', v);
  },
  load: () => null, save: () => {},
};
const b = new TapirBridge(sim);
let now = 1000;
const step = (frames = 1) => { for (let i = 0; i < frames; i++) { now += 20; b.update(now); } };
const failed = [];
let passed = 0;
const check = (title, expect) => {
  if (JSON.stringify(events) === JSON.stringify(expect)) {
    passed++;
  } else {
    failed.push(`${title}: sent [${events.join(', ')}], expected [${expect.join(', ')}]`);
  }
  events = [];
};
const press = (m, v = 1) => { vars.set(`L:f275_Btn_AP_${m}_Pos`, v); vars.set(`L:F275bgt_warn_BtnAP_${m}`, v); };

step(3); check('AP off: the selector becomes the heading bug, once', ['HEADING_BUG_SET 90']);
vars.set('AUTOPILOT MASTER', 1); vars.set('AUTOPILOT PITCH HOLD', 1);
step(3); check('AP on, no button: wings level, pitch kept', ['AP_WING_LEVELER_ON']);
vars.set('L:f275_AP_Pitch_Wheel', 8);   // 2 degrees nose up
step(10); check('pitch wheel +8: pitch target to -2 (nose up), 0.5 per event, every 50 ms', ['AP_PITCH_REF_INC_UP', 'AP_PITCH_REF_INC_UP', 'AP_PITCH_REF_INC_UP', 'AP_PITCH_REF_INC_UP']);
press('hdg'); step(3); check('HDG in: heading mode on the selector', ['AP_HDG_HOLD_ON']);
vars.set('L:F275bgt_hdg_sel', 95); step(2); check('selector turned: bug follows', ['HEADING_BUG_SET 95']);
vars.set('L:f275_AP_Turn_Rotac', 15); vars.set('L:F275bgt_warn_BtnAP_hdg', 0);   // his WASM puts the HDG lamp out off centre
step(1); check('VIRAGE 15: bug 15 degrees ahead, heading mode', ['HEADING_BUG_SET 55', 'AP_HDG_HOLD_ON']);
vars.set('PLANE HEADING DEGREES MAGNETIC', 46.2); step(1); check('turning: the bug stays ahead', ['HEADING_BUG_SET 61']);
vars.set('L:f275_AP_Turn_Rotac', 0); vars.set('L:F275bgt_warn_BtnAP_hdg', 1);
step(2); check('knob centred, HDG lit again: back to the selector', ['HEADING_BUG_SET 95', 'AP_HDG_HOLD_ON']);
press('hdg', 0); press('vorapp'); vars.set('NAV HAS LOCALIZER:1', 1);
step(2); check('VOR/APP on a localizer: NAV1 source, approach', ['AP_NAV_SELECT_SET 1', 'AP_APR_HOLD_ON']);
vars.set('AUTOPILOT GLIDESLOPE ACTIVE', 1); press('alt'); vars.set('L:f275_AP_Pitch_Wheel', -20);
step(5); check('glideslope captured: ALT and the wheel left alone', []);
vars.set('AUTOPILOT GLIDESLOPE ACTIVE', 0); press('alt', 0); press('vorapp', 0); vars.set('L:f275_AP_Pitch_Wheel', -8);
step(1); check('VOR/APP out: approach off, wings level', ['AP_APR_HOLD_OFF', 'AP_WING_LEVELER_ON', 'AP_PITCH_REF_INC_DN']);
step(20); events = [];
press('ias'); step(1); check('IAS in: speed of the moment, climbing (VS > 0)', ['AP_SPD_VAR_SET 180', 'AP_ALT_VAR_SET_ENGLISH 30000', 'FLIGHT_LEVEL_CHANGE_ON']);
vars.set('AIRSPEED INDICATED', 172); step(10); check('speed decays within 5 s: no swap yet', []);
step(250); check('speed still 8 kt slow after 5 s: FLC turned to descend', ['AP_ALT_VAR_SET_ENGLISH 0']);
vars.set('AIRSPEED INDICATED', 181); step(300); check('speed back: nothing', []);
press('ias', 0); press('alt'); step(1); check('IAS out, ALT in: FLC off, altitude given back, ALT hold', ['FLIGHT_LEVEL_CHANGE_OFF', 'AP_ALT_VAR_SET_ENGLISH 9000', 'AP_ALT_HOLD_ON']);
press('alt', 0); step(1); check('ALT out: back to pitch (the fake wheel still asks 2 deg nose down)', ['AP_ALT_HOLD_OFF', 'AP_PITCH_REF_INC_DN']);
vars.set('AUTOPILOT MASTER', 0); step(2); check('AP off: forgotten, the bug sent again', ['HEADING_BUG_SET 95']);
vars.set('AUTOPILOT MASTER', 1); step(1); check('AP on again: modes sent again', ['AP_WING_LEVELER_ON']);
console.log(JSON.stringify({ ok: failed.length === 0, passed, failed }));
