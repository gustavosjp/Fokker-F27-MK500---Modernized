import { Subject } from '@microsoft/msfs-sdk';

import { DART, tgtLimit } from '../dart';
import { SimBridge } from './sim';

/** What the autothrottle does: off, holding the selected speed, climb power, flight idle, or disconnected by the pilot. */
export type AtMode = 'off' | 'spd' | 'clb' | 'idle' | 'disc';

/** The MFD band shows the mode from this variable (0 off, 1 SPD, 2 CLB, 3 IDLE, 4 disconnected). */
export const AT_MODE_VAR = 'L:F27_AT_MODE';
/** 1 while the autothrottle is on (armed), for the lamp of the FCP's A/T key. */
export const AT_ARMED_VAR = 'L:F27_AT_ARMED';
const MODE_NUM: Record<AtMode, number> = { off: 0, spd: 1, clb: 2, idle: 3, disc: 4 };

/** Lever travel the autothrottle allows itself, % per second. */
const RATE_PCT_S = 4;
/** Lowest lever it sets in flight, %. */
const MIN_PCT = 3;
/** Highest lever it sets, %: the F27's levers stop at 80 in flight (live reading, v11.6 test: in CLB the A/T pushed past it, the lever stayed at
 * 79.99, and the gap read as the pilot's hand, so it disconnected every few seconds). */
const MAX_PCT = 80;
/** Climb power: TGT this far below the Dart's limit for the rpm band (°C), torque at most this share of the 600 psi gauge. */
const TGT_MARGIN_C = 20;
const TORQUE_SHARE = 0.95;
/** SPD: lever rate per knot of speed error and per kt/s of speed trend (% per second). */
const GAIN_ERR = 0.3;
// v11.6 live flight (13,000 ft level-off at 158 kt, SPD 150): with 2.0 the lever fell 80 -> 20 % in 20 s and the speed undershot to 149 kt;
// a stronger trend term brakes the lever as the speed starts to drop
const GAIN_TREND = 4.0;
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

/**
 * v11.6 (user: "quero que implemente o Autothrottle"; the F27 had none, so it is an option, off unless chosen in the tablet's Settings): the
 * power levers follow the WT21 autopilot's vertical mode, as an autothrottle does for an aircraft without one built in:
 *   FLC, selected altitude above  CLB: power up to the Dart's limits (TGT and torque), FLC holds the speed with pitch
 *   FLC, selected altitude below  IDLE: power to the minimum
 *   any other mode                SPD: power holds the autopilot's selected speed (the SPD knob)
 * It works only in the air with the autopilot on, never pushes beyond the Dart's TGT for the rpm band or the torque, and lets go for good
 * (until armed again) when a lever moves away from where it put it.
 */
export class Autothrottle {
  public readonly armed = Subject.create(false);
  public readonly mode = Subject.create<AtMode>('off');
  private lever = -1;
  private lastAt = 0;
  private engagedFor = 0;
  private overrideFor = 0;

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
    this.mode.sub((m) => this.sim.set(AT_MODE_VAR, 'number', MODE_NUM[m]), true);
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
      }
      return;
    }
    if (this.lever < 0) {
      this.lever = (levers[0] + levers[1]) / 2;
      this.engagedFor = 0;
      this.overrideFor = 0;
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

    const flc = s.get('AUTOPILOT FLIGHT LEVEL CHANGE', 'bool') !== 0;
    // the WT21 autopilot's selected altitude is slot 1 (alt_mode_slot_index = 1 in this aircraft's systems.cfg)
    const climb = s.get('AUTOPILOT ALTITUDE LOCK VAR:1', 'feet') > s.get('INDICATED ALTITUDE', 'feet') + 100;
    const mode: AtMode = flc ? (climb ? 'clb' : 'idle') : 'spd';
    this.mode.set(mode);

    // the Dart's limits, the higher-loaded engine counting
    let tgtRoom = Infinity;
    let torqueRoom = Infinity;
    for (const n of [1, 2]) {
      const rpm = s.get(`L:f275_RpmF27_0${n}`, 'number');
      tgtRoom = Math.min(tgtRoom, tgtLimit(rpm) - TGT_MARGIN_C - s.get(`L:f275_dart_egt_0${n}_ind`, 'number'));
      torqueRoom = Math.min(torqueRoom, DART.torqueGaugePsi * TORQUE_SHARE - s.get(`L:f275_xengtorq_${n}_ind`, 'number'));
    }
    const limited = tgtRoom < 0 || torqueRoom < 0;

    let rate: number;
    if (mode === 'clb') {
      rate = limited ? -RATE_PCT_S : Math.min(RATE_PCT_S, Math.min(tgtRoom / 10, torqueRoom / 20) * RATE_PCT_S);
    } else if (mode === 'idle') {
      rate = -RATE_PCT_S;
    } else {
      const err = s.get('AUTOPILOT AIRSPEED HOLD VAR', 'knots') - s.get('AIRSPEED INDICATED', 'knots');
      const trend = s.get('ACCELERATION BODY Z', 'feet per second squared') * 0.5925;   // ft/s² -> kt/s
      rate = GAIN_ERR * err - GAIN_TREND * trend;
      if (limited && rate > 0) {
        rate = -RATE_PCT_S / 2;
      }
    }
    rate = Math.max(-RATE_PCT_S, Math.min(RATE_PCT_S, rate));
    this.lever = Math.max(MIN_PCT, Math.min(MAX_PCT, this.lever + rate * dt));
    const value = Math.round((this.lever / 100) * 16383);
    s.set('K:THROTTLE1_SET', 'number', value);
    s.set('K:THROTTLE2_SET', 'number', value);
  }
}
