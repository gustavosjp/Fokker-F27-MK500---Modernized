import { Subject } from '@microsoft/msfs-sdk';

import { SimBridge } from './sim';

/** Pulling speed, knots (a tug at walking pace), and how fast it is reached or left. */
const PULL_KT = 2;
const RAMP_KT_PER_S = 0.6;
/** Yaw per steering step at the full pulling speed, degrees a second; at most MAX_STEPS each way. */
const STEP_DEG_S = 1;
const MAX_STEPS = 3;
/** Above this ground speed something else moves the aircraft (thrust, a slope): the tablet lets go. */
const ABORT_KT = 5;
const FT_S_PER_KT = 1.68781;

/** Why a pull did not start or stopped by itself ('' = it was stopped from the tablet, or never asked). */
export type PullStop = '' | 'brake' | 'chocks' | 'air' | 'fast' | 'tug';

/**
 * v10.12 (user: "teria como colocar uma opção além de empurrar, puxar o avião?"): the tablet pulls the aircraft forward itself, at
 * walking pace, the way pushback tools without a tug do it (the sim's tug and GSX's only push back): every frame it sets the aircraft's
 * forward speed (VELOCITY BODY Z) and its yaw rate (ROTATION VELOCITY BODY Y), the yaw growing with the speed as behind a towbar.
 * Live tests in the sim (2026-10-28, SBCT): 1.5 ft/s held for 2 s moved the aircraft 0.89 m straight ahead; a positive yaw rate turns
 * the nose right, but the sim applied three times the rate written in degrees a second, so the rate written is divided by the gain
 * seen in the rate read back.
 * It lets go at once if the parking brake is set, the wheels leave the ground, the ground speed passes ABORT_KT, or a tug (the sim's
 * or GSX's) is pushing.
 */
export class PullTug {
  public readonly active = Subject.create(false);
  public readonly speedKt = Subject.create(0);
  /** Steering, in steps (negative: nose left). */
  public readonly steps = Subject.create(0);
  public readonly stopped = Subject.create<PullStop>('');
  private target = 0;
  private last = 0;
  private gain = 1;

  /**
   * @param sim Where the aircraft's speeds are written and its state read.
   */
  constructor(private readonly sim: SimBridge) { }

  /** Starts pulling (TabletModel.pullStart checks the chocks and the parking brake first, to say why not). */
  public start(): void {
    this.target = PULL_KT;
    this.stopped.set('');
    this.active.set(true);
  }

  /** One more step of turn to that side (-1 nose left, 1 nose right), or straight again (0). */
  public steer(dir: -1 | 0 | 1): void {
    if (this.active.get()) {
      this.steps.set(dir === 0 ? 0 : Math.max(-MAX_STEPS, Math.min(MAX_STEPS, this.steps.get() + dir)));
    }
  }

  /** Slows to a stop, then lets go. */
  public stop(): void {
    this.target = 0;
  }

  /**
   * Called every frame.
   * @param now The time, ms.
   */
  public update(now: number): void {
    const dt = Math.min(0.2, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.active.get()) {
      return;
    }
    const s = this.sim;
    const why: PullStop = s.get('BRAKE PARKING POSITION', 'bool') !== 0 ? 'brake'
      : s.get('SIM ON GROUND', 'bool') === 0 ? 'air'
        : s.get('GROUND VELOCITY', 'knots') > ABORT_KT ? 'fast'
          : s.get('PUSHBACK STATE', 'enum') !== 3 || s.get('L:FSDT_GSX_DEPARTURE_STATE', 'number') === 5 ? 'tug' : '';
    if (why) {
      this.letGo(why);
      return;
    }
    const v = this.speedKt.get();
    const next = v < this.target ? Math.min(this.target, v + RAMP_KT_PER_S * dt) : Math.max(this.target, v - RAMP_KT_PER_S * dt);
    this.speedKt.set(next);
    if (next === 0 && this.target === 0) {
      this.letGo('');
      return;
    }
    const cmd = (this.steps.get() * STEP_DEG_S * (next / PULL_KT)) / this.gain;
    s.set('VELOCITY BODY Z', 'feet per second', next * FT_S_PER_KT);
    s.set('ROTATION VELOCITY BODY Y', 'degrees per second', cmd);
    if (Math.abs(cmd) > 0.2) {
      const seen = s.get('ROTATION VELOCITY BODY Y', 'degrees per second') / cmd;
      if (seen > 0.2 && seen < 10) {
        this.gain += (seen - this.gain) * 0.1;
      }
    }
  }

  /** Stops writing: the aircraft's speeds back to 0 once, nothing more after. */
  private letGo(why: PullStop): void {
    this.sim.set('VELOCITY BODY Z', 'feet per second', 0);
    this.sim.set('ROTATION VELOCITY BODY Y', 'degrees per second', 0);
    this.speedKt.set(0);
    this.steps.set(0);
    this.target = 0;
    this.active.set(false);
    this.stopped.set(why);
  }
}
