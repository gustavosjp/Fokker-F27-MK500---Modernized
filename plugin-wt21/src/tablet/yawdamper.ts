import { Subject } from '@microsoft/msfs-sdk';

import { SimBridge } from './sim';

/** 1 while the pilot has the yaw damper on (the FCP's YD key toggles it); the lamp reads it. */
export const YD_SWITCH_VAR = 'L:F27_YD_SW';
/** 1 while the tablet is working the rudder trim (damping and / or nulling the sideslip). */
export const YD_ACTIVE_VAR = 'L:F27_YD_ACTIVE';

/** Rudder trim per degree a second of yaw rate (fraction of the trim's 10 degrees), after the washout: 0.04 = 0.4 degree of trim per deg/s. */
const GAIN = 0.04;
/** The damping part never moves the trim further than this from where it stands (fraction of full trim: 0.15 = 1.5 degrees; v11.5.1 flight test: 1.5 degrees
 * of rudder trim alone gave 5 deg/s of yaw rate within a quarter of a second, the author's rudder is strong). */
const AUTHORITY = 0.15;
/** Washout: the yaw rate is high-passed with this time constant, so a steady coordinated turn is not fought, only the changes are, s. */
const WASHOUT_S = 4;
/** How fast the trim may move, fraction of full trim per second (0.4 = 4 degrees a second). */
const RATE = 0.4;
/** When it stops, the trim goes back to where the pilot left it at this rate (a step would kick the nose just as the pilot takes over), fraction per second. */
const RETURN_RATE = 0.05;
/** It works above this indicated speed, knots, and only in the air. */
const MIN_KT = 90;
/** Safety: a high-passed yaw rate this big for this long (a leaky count) means the damping is not working (wrong sign, a failure): it switches itself off. */
const RUNAWAY_DEG_S = 8;
const RUNAWAY_S = 2.5;
/** Safety: back-and-forth faster than any dutch roll means the damping feeds it, whatever the reason (a low instrument refresh rate, another add-on): off.
 * Swings of the yaw rate past this size count (deg/s); the count drains at FLIP_DRAIN per second, so 0.5 Hz never fills it and 1 Hz fills it in FLIP_MAX s. */
const FLIP_MIN_DEG_S = 0.5;
const FLIP_DRAIN = 1;
const FLIP_MAX = 8;

/** Sideslip nulling (the "ball in the middle" part): the trim moves this much per degree of sideslip a second (fraction of full trim). */
const BETA_KI = 0.01;
/** Sideslip below this is left alone, degrees (the sensor's noise and the natural wobble). */
const BETA_DEADBAND = 0.3;
/** The sideslip trim never goes further than this from where the pilot left the trim (fraction of full trim: 0.3 = 3 degrees; the flight test needed 0.8 degree
 * for a steady sideslip of 0.85). */
const BETA_AUTHORITY = 0.3;
/** Low-pass time constant of the sideslip, s. */
const BETA_LP_S = 2;
/** The sign check: after this long of nulling, a sideslip (averaged, so a passing wobble does not count) that is bigger than it was means the
 * sign is wrong: flip it once, and if the second sign is no better either, give up, s. */
const BETA_CHECK_S = 8;
/** Time constant of the average of |sideslip| the check compares, s. */
const BETA_AVG_S = 4;
/** A sideslip this big switches the nulling off at once, degrees. */
const BETA_ABORT = 8;

/**
 * v11.6 (live flight: "faz essa curva descoordenada?", and with the sim's own yaw damper on "ainda mostra derrapagem"): a software yaw
 * damper and auto rudder trim that need nothing of the author's files. It works the RUDDER TRIM, so it adds to what the pilot does on the
 * pedals instead of fighting them, within authority of where the pilot had the trim, and gives the trim back when it stops.
 * Two parts:
 *  - damping (when the sim's own yaw damper is not on, i.e. the author's systems.cfg with gain 0): the trim moves against the washed-out
 *    yaw rate (turn entry's adverse yaw, dutch roll);
 *  - sideslip nulling (with the autopilot on, whether or not the sim's yaw damper is): a slow integrator trims the steady sideslip away.
 *    The recorded flight had INCIDENCE BETA at -2.8 degrees and the ball at -0.22 in straight and level flight with the sim's yaw damper on:
 *    a damper cannot remove a steady sideslip, a trim can.
 * Sign: ROTATION VELOCITY BODY Y is positive when the nose goes right (the recorded turns: a left turn, heading falling, reads negative);
 * positive trim is right rudder. So a yaw to the right is answered with trim to the left. Measured in flight on 2026-11-07 (v11.5.1, a 1.5 degree trim
 * touch in level cruise at 12,000 ft, 190 kt): right trim gave +5 deg/s of yaw rate at once and INCIDENCE BETA went more NEGATIVE, so a negative beta is
 * answered with trim to the LEFT (the first guess, from turn entries, was the other way; the sign check had flipped it in that flight's first seconds).
 * The sideslip part still checks its own sign and flips it once.
 * v11.5.1 (a user: "crazy small but strong continuous left and right oscillations"): K:RUDDER_TRIM_SET takes -100..100, not -16383..16383,
 * so every correction was a full 10 degrees of trim one way and the other. It is K:RUDDER_TRIM_SET_EX1 now, as Asobo's own behaviours use.
 */
export class YawDamper {
  /** True while the trim is being worked. */
  public readonly active = Subject.create(false);
  private base = 0;
  private lp = 0;
  private dyn = 0;
  private offset = 0;
  private betaLp = 0;
  // measured in flight (2026-11-07, a 1.5 degree trim touch): right trim yaws the nose right and INCIDENCE BETA goes NEGATIVE, so a negative beta wants left trim
  private betaSign = -1;
  private betaStart = 0;
  private betaAbs = 0;
  private betaFor = 0;
  private flipped = false;
  private lastAt = 0;
  private runawayFor = 0;
  private flips = 0;
  private lastSign = 0;
  private returning = false;

  /**
   * @param sim Where the aircraft is read and the trim set.
   */
  constructor(private readonly sim: SimBridge) {
    this.active.sub((a) => this.sim.set(YD_ACTIVE_VAR, 'number', a ? 1 : 0), true);
  }

  /**
   * Called every frame.
   * @param now The current time, in milliseconds.
   */
  public update(now: number): void {
    const s = this.sim;
    const dt = this.lastAt ? Math.min(0.2, (now - this.lastAt) / 1000) : 0;
    this.lastAt = now;
    const flying = s.get(YD_SWITCH_VAR, 'number') > 0
      && s.get('SIM ON GROUND', 'bool') === 0
      && s.get('AIRSPEED INDICATED', 'knots') > MIN_KT;
    const damping = flying && s.get('AUTOPILOT YAW DAMPER', 'bool') === 0;
    const nulling = flying && s.get('AUTOPILOT MASTER', 'bool') !== 0;
    if (!damping && !nulling) {
      if (this.active.get()) {
        // give the trim back as the pilot left it, gently
        this.returning = true;
        this.offset += this.dyn;
        this.dyn = 0;
        this.offset -= Math.max(-RETURN_RATE * dt, Math.min(RETURN_RATE * dt, this.offset));
        this.setTrim(this.base + this.offset);
        if (this.offset === 0) {
          this.active.set(false);
        }
      }
      return;
    }
    const r = s.get('ROTATION VELOCITY BODY Y', 'degrees per second');
    const beta = s.get('INCIDENCE BETA', 'degrees');
    if (!this.active.get()) {
      this.base = s.get('RUDDER TRIM PCT', 'position 16k') / 16383;
      this.dyn = 0;
      this.offset = 0;
      this.returning = true;
      this.active.set(true);
    }
    if (this.returning) {
      // starting, or back on before the trim had returned: the filters and the guards start afresh
      this.returning = false;
      this.lp = r;
      this.betaLp = beta;
      this.betaAbs = Math.abs(beta);
      this.betaStart = -1;
      this.betaFor = 0;
      this.runawayFor = 0;
      this.flips = 0;
      this.lastSign = 0;
    }
    if (dt === 0) {
      return;
    }

    let target = 0;
    if (damping) {
      this.lp += (r - this.lp) * Math.min(1, dt / WASHOUT_S);
      const hp = r - this.lp;
      // a leaky count, not a run of consecutive frames: a diverging oscillation crosses zero every few seconds
      this.runawayFor = Math.max(0, this.runawayFor + (Math.abs(hp) > RUNAWAY_DEG_S ? dt : -dt * 0.25));
      const sign = hp > FLIP_MIN_DEG_S ? 1 : hp < -FLIP_MIN_DEG_S ? -1 : 0;
      if (sign !== 0 && sign !== this.lastSign) {
        this.flips += 1;
        this.lastSign = sign;
      }
      this.flips = Math.max(0, this.flips - FLIP_DRAIN * dt);
      if (this.runawayFor > RUNAWAY_S || this.flips > FLIP_MAX) {
        s.set(YD_SWITCH_VAR, 'number', 0);    // the key's lamp goes out: the damper is not helping
        return;
      }
      target = Math.max(-AUTHORITY, Math.min(AUTHORITY, -GAIN * hp));
    }
    this.dyn += Math.max(-RATE * dt, Math.min(RATE * dt, target - this.dyn));

    if (nulling) {
      this.betaLp += (beta - this.betaLp) * Math.min(1, dt / BETA_LP_S);
      this.betaAbs += (Math.abs(this.betaLp) - this.betaAbs) * Math.min(1, dt / BETA_AVG_S);
      if (Math.abs(this.betaLp) > BETA_ABORT) {
        s.set(YD_SWITCH_VAR, 'number', 0);    // far from coordinated and not coming back: let go
        return;
      }
      const err = Math.abs(this.betaLp) > BETA_DEADBAND ? this.betaLp : 0;
      this.offset = Math.max(-BETA_AUTHORITY, Math.min(BETA_AUTHORITY, this.offset - this.betaSign * BETA_KI * err * dt));
      this.betaFor += dt;
      if (this.betaStart < 0 && this.betaFor > 2) {
        this.betaStart = this.betaAbs;          // the reference: the average sideslip when the nulling had just begun
      }
      if (this.betaFor > BETA_CHECK_S && this.betaStart >= 0) {
        if (Math.abs(this.offset) > 0.05 && this.betaAbs > this.betaStart + 0.8) {
          if (this.flipped) {
            s.set(YD_SWITCH_VAR, 'number', 0);    // the second sign was no better: it does not help this aircraft
            return;
          }
          this.flipped = true;
          this.betaSign = -this.betaSign;
          this.offset = 0;
        }
        this.betaStart = this.betaAbs;
        this.betaFor = 0;
      }
    }
    this.setTrim(this.base + this.offset + this.dyn);
  }

  /**
   * @param frac Rudder trim as a fraction of full trim (-1 left .. +1 right).
   */
  private setTrim(frac: number): void {
    const f = Math.max(-1, Math.min(1, frac));
    this.sim.set('K:RUDDER_TRIM_SET_EX1', 'number', Math.round(f * 16383));
  }
}
