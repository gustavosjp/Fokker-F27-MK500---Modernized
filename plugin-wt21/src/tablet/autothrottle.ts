import { Subject } from '@microsoft/msfs-sdk';

import { DART, F27_POWER } from '../dart';
import { SimBridge } from './sim';

/** What the autothrottle does: off, holding the selected speed, climb power, descent power, or disconnected by the pilot. */
export type AtMode = 'off' | 'spd' | 'clb' | 'des' | 'disc';

/** The MFD band shows the mode from this variable (0 off, 1 SPD, 2 CLB, 3 DES, 4 disconnected, 5 held back by the TGT or torque limit,
 * 6 holding the minimum speed instead of a lower selected one). */
export const AT_MODE_VAR = 'L:F27_AT_MODE';
/** 1 while the autothrottle is on (armed), for the lamp of the FCP's A/T key. */
export const AT_ARMED_VAR = 'L:F27_AT_ARMED';
const MODE_NUM: Record<AtMode, number> = { off: 0, spd: 1, clb: 2, des: 3, disc: 4 };
const MODE_LIMITED = 5;
const MODE_MIN_SPEED = 6;

/** Lever travel the autothrottle allows itself, % per second. */
const RATE_PCT_S = 4;
/** Lowest lever it sets in flight, %. */
const MIN_PCT = 3;
/** Highest lever it sets, %: the author's WASM holds the lever at 80 in flight, which is 15,000 rpm (SystemsBgt, its one THROTTLEn_SET call). */
const MAX_PCT = 80;
/** Torque at most this share of the 600 psi gauge. */
const TORQUE_SHARE = 0.95;
/** Lever rate per rpm of error (% per second). Recorded flight: 85 rpm per % of lever and an engine lag of about 1.8 s, so this crosses over at 0.25 rad/s. */
const GAIN_RPM = 0.003;
/** How the room left under the TGT and torque limits caps the lever's rate upwards (% per second per °C / psi); over a limit, the lever comes back. */
const GAIN_TGT = 0.2;
const GAIN_TORQUE = 0.04;
/** Held back by a limit for this long: the MFD band says so (A/T TGT), so the pilot knows to look at the fuel trim; and it goes back to the mode only after
 * this long free of it (v11.5.1 flight: in a hot climb the band flickered between A/T CLB and A/T TGT every few seconds), s. */
const LIMIT_SHOW_S = 2;
const LIMIT_CLEAR_S = 5;
/** SPD never holds less than this times the stall speed of the flap setting (the aircraft's own DESIGN SPEED VS1 flaps up, VS0 with flaps):
 * v11.5.1 flight, the selected speed was 0 when the A/T came on after take-off and 100 kt (FLC had taken the speed of the moment) at the first level-off. */
const MIN_SPEED_FACTOR = 1.3;
/** A selected speed below this is no selection at all (the WT21 starts with 0): when the A/T comes on, it takes the speed of the moment, kt. */
const NO_SELECTION_KT = 60;
/** FLC: the selected altitude has to stay on the other side this long before CLB and DES swap, so turning the knob through the aircraft's
 * altitude does not swing the power (v11.5.1 flight), s. */
const FLC_SWAP_S = 1.5;
/** SPD: lever rate per knot of speed error and per kt/s of speed trend (% per second). */
const GAIN_ERR = 0.3;
// v11.6 live flight (13,000 ft level-off at 158 kt, SPD 150): with 2.0 the lever fell 80 -> 20 % in 20 s and the speed undershot to 149 kt;
// a stronger trend term brakes the lever as the speed starts to drop
const GAIN_TREND = 4.0;
/** SPD in a descent: a vertical speed below this (low-passed) is a descent, ft/min, s. */
const DESCENT_FPM = -300;
const VS_LP_S = 3;
/** SPD in a descent: the 11,000 rpm ceiling opens up to 14,200 between these knots under the selected speed: a shallow path must not starve the speed. */
const SLOW_FROM_KT = 1;
const SLOW_TO_KT = 4;
/** SPD in a descent: the 11,000 rpm floor gives way to flight idle (not for continuous use) between these knots over the selected speed, and only if the speed
 * is not already coming down at this rate (kt/s): a big reduction is flown at 11,000 rpm, not at idle. Level or climbing, the floor stays (v11.5.1 flight: at
 * a level-off 26 kt fast it went to idle and the autopilot let the altitude sag 200 ft). */
const FAST_FROM_KT = 5;
const FAST_TO_KT = 15;
const COMING_DOWN_KT_S = 0.5;
/** A lever this far from the last setting was moved by the pilot (or a throttle quadrant): the autothrottle lets go, %. */
const OVERRIDE_PCT = 4;
/** After it engages, the levers get this long to come together on its setting before a gap counts as the pilot's hand, s (test: armed
 * again with the levers apart, it let go on the next frame, so it could not be turned back on). */
const ENGAGE_GRACE_S = 2;
/** A gap has to last this long to count as the pilot's hand, so a throttle quadrant's jitter does not disconnect it, s. */
const OVERRIDE_HOLD_S = 0.3;
/** Sim events a joystick button can be bound to in the sim's controls (arm toggles, disconnect turns off); the FCP's A/T key sends arm. */
export const AT_ARM_KEY = 'AUTO_THROTTLE_ARM';
export const AT_DISCONNECT_KEY = 'AUTO_THROTTLE_DISCONNECT';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * v11.6 (user: "quero que implemente o Autothrottle"; the F27 had none, so it is an option, off unless chosen in the tablet's Settings): the
 * power levers follow the WT21 autopilot's vertical mode, as an autothrottle does for an aircraft without one built in.
 * v11.5.1 (a user: "holding either max power or idle, with FLC, is not correct"): the F27's levers select rpm, so it now flies the rpm of the
 * aircraft's own flight manual, booklets and checklist ({@link F27_POWER}) instead of take-off power or flight idle:
 *   FLC, selected altitude above  CLB: 14,200 rpm, FLC holds the speed with pitch
 *   FLC, selected altitude below  DES: 11,000 rpm
 *   any other mode                SPD: power holds the autopilot's selected speed (the SPD knob), between 11,000 and 14,200 rpm; in a descent
 *                                 11,000 rpm is the ceiling unless the speed falls behind, and flight idle only if it runs well ahead
 * The fuel trim stays with the pilot, who keeps the TGT under 730 °C with it; the autothrottle never pushes past that TGT or the torque limit
 * and shows A/T TGT when one holds it back. It works only in the air with the autopilot on, and lets go for good (until armed again) when a
 * lever moves away from where it put it.
 */
export class Autothrottle {
  public readonly armed = Subject.create(false);
  public readonly mode = Subject.create<AtMode>('off');
  private readonly shown = Subject.create(0);
  private lever = -1;
  private lastAt = 0;
  private engagedFor = 0;
  private overrideFor = 0;
  private limitedFor = 0;
  private freeFor = 0;
  private limitShown = false;
  private flcClimb = true;
  private swapFor = 0;
  private vsLp = 0;

  /**
   * @param sim Where the aircraft is read and the levers set.
   */
  constructor(private readonly sim: SimBridge) {
    this.armed.sub((a) => {
      if (a) {
        this.lever = -1;
        if (this.mode.get() === 'disc') {
          this.mode.set('off');
        }
      }
    });
    this.shown.sub((v) => this.sim.set(AT_MODE_VAR, 'number', v), true);
    this.mode.sub((m) => this.shown.set(MODE_NUM[m]), true);
    this.armed.sub((a) => this.sim.set(AT_ARMED_VAR, 'number', a ? 1 : 0), true);
  }

  /**
   * A sim event from a joystick button bound in the sim's controls: arm toggles it on and off, disconnect turns it off.
   * @param key The intercepted event's name.
   */
  public onKey(key: string): void {
    if (key === AT_ARM_KEY) {
      this.armed.set(!this.armed.get());
    } else if (key === AT_DISCONNECT_KEY) {
      this.armed.set(false);
    }
  }

  /**
   * Called every frame.
   * @param now The current time, in milliseconds.
   */
  public update(now: number): void {
    const s = this.sim;
    const dt = this.lastAt ? Math.min(0.5, (now - this.lastAt) / 1000) : 0;
    this.lastAt = now;
    const levers = [1, 2].map((n) => s.get(`GENERAL ENG THROTTLE LEVER POSITION:${n}`, 'percent'));
    const working = this.armed.get() && s.get('SIM ON GROUND', 'bool') === 0 && s.get('AUTOPILOT MASTER', 'bool') !== 0;
    if (!working) {
      this.lever = -1;
      if (this.mode.get() !== 'disc') {
        this.mode.set('off');
        this.shown.set(MODE_NUM.off);
      }
      return;
    }
    const vs = s.get('VERTICAL SPEED', 'feet per minute');
    const ias = s.get('AIRSPEED INDICATED', 'knots');
    const flc = s.get('AUTOPILOT FLIGHT LEVEL CHANGE', 'bool') !== 0;
    // the WT21 autopilot's selected altitude is slot 1 (alt_mode_slot_index = 1 in this aircraft's systems.cfg)
    const toAlt = s.get('AUTOPILOT ALTITUDE LOCK VAR:1', 'feet') - s.get('INDICATED ALTITUDE', 'feet');
    if (this.lever < 0) {
      this.lever = (levers[0] + levers[1]) / 2;
      this.engagedFor = 0;
      this.overrideFor = 0;
      this.limitedFor = 0;
      this.freeFor = 0;
      this.limitShown = false;
      this.swapFor = 0;
      this.flcClimb = toAlt >= 0;
      this.vsLp = vs;
      // no speed selected yet (the WT21 starts with 0): the speed of the moment, as the bug shows on the PFD
      if (s.get('AUTOPILOT AIRSPEED HOLD VAR', 'knots') < NO_SELECTION_KT) {
        s.set('K:AP_SPD_VAR_SET', 'number', Math.round(ias));
      }
    }
    // the pilot moved a lever (a gap that outlasts the engage grace and a quadrant's jitter): let go until armed again
    this.engagedFor += dt;
    const gap = levers.some((l) => Math.abs(l - this.lever) > OVERRIDE_PCT);
    this.overrideFor = gap && this.engagedFor > ENGAGE_GRACE_S ? this.overrideFor + dt : 0;
    if (this.overrideFor >= OVERRIDE_HOLD_S) {
      this.lever = -1;
      this.armed.set(false);
      this.mode.set('disc');
      return;
    }
    this.vsLp += (vs - this.vsLp) * Math.min(1, dt / VS_LP_S);

    // FLC climbs or descends towards the selected altitude; right on it, the way it was going; turning the knob through the aircraft's altitude
    // has to stay on the other side for a moment before the power swaps
    if (Math.abs(toAlt) > 100 && (toAlt > 0) !== this.flcClimb) {
      this.swapFor += dt;
      if (this.swapFor >= FLC_SWAP_S || !flc) {
        this.flcClimb = toAlt > 0;
        this.swapFor = 0;
      }
    } else {
      this.swapFor = 0;
    }
    const mode: AtMode = flc ? (this.flcClimb ? 'clb' : 'des') : 'spd';
    this.mode.set(mode);

    // the engines, the higher one counting
    let rpm = 0;
    let tgt = 0;
    let torque = 0;
    for (const n of [1, 2]) {
      rpm = Math.max(rpm, s.get(`L:f275_RpmF27_0${n}`, 'number'));
      tgt = Math.max(tgt, s.get(`L:f275_dart_egt_0${n}_ind`, 'number'));
      torque = Math.max(torque, s.get(`L:f275_xengtorq_${n}_ind`, 'number'));
    }

    let want: number;
    let atMinSpeed = false;
    if (mode === 'clb') {
      want = GAIN_RPM * (F27_POWER.climbCruiseRpm - rpm);
    } else if (mode === 'des') {
      want = GAIN_RPM * (F27_POWER.descentRpm - rpm);
    } else {
      // never slower than 1.3 times the stall speed of the flap setting, whatever is selected
      const flapsUp = s.get('FLAPS HANDLE INDEX', 'number') === 0;
      const stall = s.get(flapsUp ? 'DESIGN SPEED VS1' : 'DESIGN SPEED VS0', 'knots');
      const minSpeed = stall > 0 ? stall * MIN_SPEED_FACTOR : 0;
      const selected = s.get('AUTOPILOT AIRSPEED HOLD VAR', 'knots');
      atMinSpeed = selected < minSpeed;
      const err = Math.max(selected, minSpeed) - ias;
      const trend = s.get('ACCELERATION BODY Z', 'feet per second squared') * 0.5925;   // ft/s² -> kt/s
      const descending = this.vsLp < DESCENT_FPM;
      const slow = clamp01((err - SLOW_FROM_KT) / (SLOW_TO_KT - SLOW_FROM_KT));
      const ceiling = descending
        ? F27_POWER.descentRpm + (F27_POWER.climbCruiseRpm - F27_POWER.descentRpm) * slow
        : F27_POWER.climbCruiseRpm;
      const fast = descending ? clamp01((-err - FAST_FROM_KT) / (FAST_TO_KT - FAST_FROM_KT)) * clamp01(1 + trend / COMING_DOWN_KT_S) : 0;
      const floor = F27_POWER.descentRpm * (1 - fast);
      want = GAIN_ERR * err - GAIN_TREND * trend;
      want = Math.max(Math.min(want, GAIN_RPM * (ceiling - rpm)), GAIN_RPM * (floor - rpm));
    }

    // the limits cap the rate upwards and bring the lever back when over them: the continuous TGT and the torque. Not the manual's TGT by rpm band: those are
    // for steady running, and right after take-off power (v11.5.1 flight, TGT 709 at 10,500 rpm) the 550 C band below 10,400 rpm would hold the power down
    // just when it was needed; the EIS shows those bands in amber.
    const cap = Math.min(
      (F27_POWER.continuousTgt - tgt) * GAIN_TGT,
      (DART.torqueGaugePsi * TORQUE_SHARE - torque) * GAIN_TORQUE,
    );
    // held back only when the cap really binds (below what it wants and below its own rate limit)
    const held = cap < Math.min(want, RATE_PCT_S) - 0.01 && (cap < 0 || want > 0.05);
    if (held) {
      this.limitedFor += dt;
      this.freeFor = 0;
      if (this.limitedFor > LIMIT_SHOW_S) {
        this.limitShown = true;
      }
    } else {
      this.freeFor += dt;
      if (this.freeFor > LIMIT_CLEAR_S) {
        this.limitShown = false;
        this.limitedFor = 0;
      }
    }
    this.shown.set(this.limitShown ? MODE_LIMITED : atMinSpeed ? MODE_MIN_SPEED : MODE_NUM[mode]);

    const rate = Math.max(-RATE_PCT_S, Math.min(RATE_PCT_S, Math.min(want, cap)));
    this.lever = Math.max(MIN_PCT, Math.min(MAX_PCT, this.lever + rate * dt));
    const value = Math.round((this.lever / 100) * 16383);
    s.set('K:THROTTLE1_SET', 'number', value);
    s.set('K:THROTTLE2_SET', 'number', value);
  }
}
