import { Subject } from '@microsoft/msfs-sdk';

import { SimBridge } from './sim';

/** 1 while the pilot has the yaw damper on (the FCP's YD key toggles it); the lamp reads it. */
export const YD_SWITCH_VAR = 'L:F27_YD_SW';
/** 1 while the tablet is working the rudder trim (damping and / or nulling the sideslip). */
export const YD_ACTIVE_VAR = 'L:F27_YD_ACTIVE';

/** Rudder trim per degree a second of yaw rate (fraction of the trim's 10 degrees), after the washout: 0.04 = 0.4 degree of trim per deg/s. */
const GAIN = 0.04;
/** The damping part never moves the trim further than this from where it stands (fraction of full trim: 0.3 = 3 degrees). */
const AUTHORITY = 0.3;
/** Washout: the yaw rate is high-passed with this time constant, so a steady coordinated turn is not fought, only the changes are, s. */
const WASHOUT_S = 4;
/** How fast the trim may move, fraction of full trim per second. */
const RATE = 0.8;
/** It works above this indicated speed, knots, and only in the air. */
const MIN_KT = 90;
/** Safety: a high-passed yaw rate this big for this long (a leaky count) means the damping is not working (wrong sign, a failure): it switches itself off. */
const RUNAWAY_DEG_S = 8;
const RUNAWAY_S = 2.5;

/** Sideslip nulling (the "ball in the middle" part): the trim moves this much per degree of sideslip a second (fraction of full trim). */
const BETA_KI = 0.01;
/** Sideslip below this is left alone, degrees (the sensor's noise and the natural wobble). */
const BETA_DEADBAND = 0.3;
/** The sideslip trim never goes further than this from where the pilot left the trim (fraction of full trim: 0.6 = 6 degrees). */
const BETA_AUTHORITY = 0.6;
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
 * positive trim is right rudder; a nose-right yaw raises INCIDENCE BETA (turn entries: nose left, beta more negative). So a yaw to the right
 * is answered with trim to the left, and a negative beta with trim to the right. The sideslip part checks its own sign and flips it once.
 */
export class YawDamper {
  /** True while the trim is being worked. */
  public readonly active = Subject.create(false);
  private base = 0;
  private lp = 0;
  private dyn = 0;
  private offset = 0;
  private betaLp = 0;
  private betaSign = 1;
  private betaStart = 0;
  private betaAbs = 0;
  private betaFor = 0;
  private flipped = false;
  private lastAt = 0;
  private runawayFor = 0;
  private primed = false;

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
        this.setTrim(this.base);       // give the trim back as the pilot left it
        this.active.set(false);
      }
      this.primed = false;
      this.dyn = 0;
      this.offset = 0;
      this.runawayFor = 0;
      this.betaFor = 0;
      return;
    }
    const r = s.get('ROTATION VELOCITY BODY Y', 'degrees per second');
    const beta = s.get('INCIDENCE BETA', 'degrees');
    if (!this.active.get()) {
      this.base = s.get('RUDDER TRIM PCT', 'percent over 100');
      this.lp = r;
      this.betaLp = beta;
      this.betaAbs = Math.abs(beta);
      this.betaStart = -1;
      this.betaFor = 0;
      this.dyn = 0;
      this.offset = 0;
      this.primed = true;
      this.active.set(true);
    }
    if (!this.primed || dt === 0) {
      return;
    }

    let target = 0;
    if (damping) {
      this.lp += (r - this.lp) * Math.min(1, dt / WASHOUT_S);
      const hp = r - this.lp;
      // a leaky count, not a run of consecutive frames: a diverging oscillation crosses zero every few seconds
      this.runawayFor = Math.max(0, this.runawayFor + (Math.abs(hp) > RUNAWAY_DEG_S ? dt : -dt * 0.25));
      if (this.runawayFor > RUNAWAY_S) {
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
    this.sim.set('K:RUDDER_TRIM_SET', 'number', Math.round(f * 16383));
  }
}
