import { Subject } from '@microsoft/msfs-sdk';

import { SimBridge } from './sim';

const LB_PER_KG = 2.20462;

/**
 * Passenger seats per payload station (PAYLOAD STATION WEIGHT index, 1-based) of the F27-500, from flight_model.cfg station_load.3..15
 * (rows 1..13). v10.11 (user: "ajustar também o F27 para 52 passageiros", his SimBrief airframe): 13 rows of four, 2 + 2, the F27-500's
 * 52-seat cabin; the author's default load (165 lb a seat) leaves rows 1, 8, 9 and 13 half full, 44 passengers. The crew stations
 * (pilot, copilot, crew x3) are never touched.
 */
export const SEAT_ROWS: ReadonlyArray<readonly [number, number]> = [
  [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [15, 4], [16, 4],
];
export const SEATS = SEAT_ROWS.reduce((n, [, s]) => n + s, 0);
/** Holds: the front one (station 19, "BaggageFront") and the rear one, which shares station 16 with row 13. */
const HOLD_FRONT = 19, HOLD_REAR = 16, FRONT_SHARE = 320 / (320 + 210);
/** Bags and freight split between the front and rear holds, in pounds. */
export const holdsLb = (cargoLb: number): [number, number] => [cargoLb * FRONT_SHARE, cargoLb * (1 - FRONT_SHARE)];

/** Structural weight limits (the user's F27-500 checklist; MTOW = flight_model.cfg max_gross_weight), pounds. */
export const LIMITS_LB = { mzfw: 38470, mtow: 43500, mlw: 41000 };
/** The same limits as the checklist gives them in kilograms (shown as such in kg instead of converted pounds). */
export const LIMITS_KG = { mzfw: 17450, mtow: 19730, mlw: 18600 };
/** CG range, % MAC (flight_model.cfg CG_forward_limit / CG_aft_limit). */
export const CG_LIMITS_MAC: readonly [number, number] = [20, 38];

/** Whole passengers per row for `pax` on board: spread in proportion to the seats (largest remainders), so the CG stays where the rows put it. */
export function paxPerRow(pax: number): number[] {
  const share = SEAT_ROWS.map(([, seats]) => (pax * seats) / SEATS);
  const count = share.map(Math.floor);
  let left = pax - count.reduce((a, b) => a + b, 0);
  const order = share.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) {
      break;
    }
    if (count[i] < SEAT_ROWS[i][1]) {
      count[i]++;
      left--;
    }
  }
  return count;
}

/**
 * "Real" rates, an F27 at a stand with airstairs and a fuel truck (v10.3, user: "3 min pra embarcar? ... abastecer em 1 min?"):
 * boarding 5 passengers a minute (people walking out, climbing the stairs, stowing bags: 40 take 8 min), deboarding 8 a minute,
 * bags and freight 150 kg a minute through the cargo door at the same time. Fuel (v10.6, from the F27 maintenance training manual:
 * pressure refuelling at 60 psi takes up to 570 litres a minute) 320 kg a minute, some 400 litres of Jet A: 2,000 kg in about 6 min,
 * the 4,100 kg tanks from empty in about 13.
 */
export const RATES = { boardPaxPerMin: 5, deboardPaxPerMin: 8, cargoKgPerMin: 150, fuelKgPerMin: 320 };

/** Standard passenger with carry-on (EASA), used when no OFP says otherwise. */
export const DEFAULT_PAX_KG = 84;
/** Most bags and freight the two holds take (front 145 kg + rear ~95 kg by the author's defaults, real F27 holds take far more). */
export const MAX_CARGO_KG = 1500;

export type LoadMode = 'real' | 'instant';

/** Passengers and cargo on board, and where they are heading. */
export interface PayloadState {
  pax: number;
  paxTarget: number;
  cargoLb: number;
  cargoTargetLb: number;
  active: boolean;
}

/** Fuel on board (main tanks + collectors) and where it is heading. */
export interface FuelState {
  fuelLb: number;
  targetLb: number;
  active: boolean;
}

/**
 * Boarding, deboarding and refuelling, at once or at real-life pace (advanced on simulation time, so a paused sim pauses them).
 * Payload goes into the passenger rows (spread in proportion to their seats, so the CG stays where the rows put it) and the two holds;
 * fuel into the two main tanks of the author's fuel system (FUELSYSTEM TANK QUANTITY 1 and 2; the collectors fill from them).
 */
export class Loader {
  public readonly mode = Subject.create<LoadMode>('real');
  public readonly payload = Subject.create<PayloadState>({ pax: 0, paxTarget: 0, cargoLb: 0, cargoTargetLb: 0, active: false });
  public readonly fuel = Subject.create<FuelState>({ fuelLb: 0, targetLb: 0, active: false });
  private paxWeightLb = DEFAULT_PAX_KG * LB_PER_KG;
  /** The weight of one passenger the loader boards with (the OFP's, or the standard one), pounds. */
  public get paxLb(): number {
    return this.paxWeightLb;
  }
  private lastSimTime = -1;
  private synced = false;

  /**
   * @param sim Where the payload stations and fuel tanks are written.
   */
  constructor(private readonly sim: SimBridge) { }

  /**
   * Brings the cabin to `pax` passengers (at most the 52 seats) and the holds to `cargoLb` of bags and freight, from what is on board
   * now: boarding, deboarding or both at once.
   */
  public board(pax: number, paxWeightLb: number, cargoLb: number): void {
    this.syncFromSim();
    this.paxWeightLb = paxWeightLb > 0 ? paxWeightLb : this.paxWeightLb;
    const p = this.payload.get();
    const target = { paxTarget: Math.max(0, Math.min(SEATS, Math.round(pax))), cargoTargetLb: Math.max(0, Math.min(MAX_CARGO_KG * LB_PER_KG, cargoLb)) };
    if (this.mode.get() === 'instant') {
      this.payload.set({ pax: target.paxTarget, cargoLb: target.cargoTargetLb, ...target, active: false });
      this.writePayload();
    } else {
      this.payload.set({ ...p, ...target, active: true });
    }
  }

  /** Everyone and everything off. */
  public deboard(): void {
    this.syncFromSim();
    const p = this.payload.get();
    if (this.mode.get() === 'instant') {
      this.payload.set({ ...p, pax: 0, cargoLb: 0, paxTarget: 0, cargoTargetLb: 0, active: false });
      this.writePayload();
    } else {
      this.payload.set({ ...p, paxTarget: 0, cargoTargetLb: 0, active: true });
    }
  }

  /** Brings the fuel on board to `targetLb` (refuelling or defuelling), split evenly between the two main tanks. */
  public refuel(targetLb: number): void {
    const now = this.readFuelLb();
    const target = Math.max(0, Math.min(this.capacityLb(), targetLb));
    if (this.mode.get() === 'instant') {
      this.fuel.set({ fuelLb: target, targetLb: target, active: false });
      this.writeFuel(target);
    } else {
      this.fuel.set({ fuelLb: now, targetLb: target, active: true });
    }
  }

  /** Stops whatever is running where it is. */
  public stop(): void {
    this.payload.set({ ...this.payload.get(), active: false });
    this.fuel.set({ ...this.fuel.get(), active: false });
  }

  /** Seconds a real-pace boarding of `pax` passengers and `cargoLb` would take (bags load while people board). */
  public static boardSeconds(pax: number, cargoLb: number): number {
    return Math.max((Math.min(SEATS, pax) / RATES.boardPaxPerMin) * 60, (cargoLb / LB_PER_KG / RATES.cargoKgPerMin) * 60);
  }

  /** Seconds a real-pace refuelling between the two quantities would take. */
  public static fuelSeconds(fromLb: number, toLb: number): number {
    return (Math.abs(toLb - fromLb) / LB_PER_KG / RATES.fuelKgPerMin) * 60;
  }

  /**
   * Reads what is on board before the tablet first loads anything: the author's stations hold 165 lb a seat (44 passengers) and his
   * holds 320 lb in front and 200 lb behind row 13, so a fresh flight starts with 44 passengers and 520 lb of bags. The rear hold
   * shares its station with row 13: its bags are taken in the front hold's proportion, the one the tablet loads them in (v10.11: with
   * four seats in row 13 its weight alone no longer tells passengers from bags).
   */
  public syncFromSim(): void {
    if (this.synced) {
      return;
    }
    this.synced = true;
    const frontLb = this.sim.get(`PAYLOAD STATION WEIGHT:${HOLD_FRONT}`, 'pounds');
    const rearLb = Math.min(this.sim.get(`PAYLOAD STATION WEIGHT:${HOLD_REAR}`, 'pounds'), (frontLb * (1 - FRONT_SHARE)) / FRONT_SHARE);
    let seatsLb = 0;
    SEAT_ROWS.forEach(([station]) => {
      seatsLb += this.sim.get(`PAYLOAD STATION WEIGHT:${station}`, 'pounds') - (station === HOLD_REAR ? rearLb : 0);
    });
    const cargoLb = frontLb + rearLb;
    const pax = Math.max(0, Math.min(SEATS, Math.round(seatsLb / 165)));
    this.paxWeightLb = pax > 0 ? Math.max(100, seatsLb / pax) : this.paxWeightLb;
    this.payload.set({ pax, paxTarget: pax, cargoLb, cargoTargetLb: cargoLb, active: false });
  }

  /** Fuel on board now (main tanks + collectors), in pounds. */
  public readFuelLb(): number {
    const perGal = this.sim.get('FUEL WEIGHT PER GALLON', 'pounds');
    let gal = 0;
    for (let i = 1; i <= 4; i++) {
      gal += this.sim.get(`FUELSYSTEM TANK QUANTITY:${i}`, 'gallons');
    }
    return gal * perGal;
  }

  /**
   * Advances a real-pace load. Called with every poll; stops (keeping what is on board) if the aircraft starts to move.
   * @param simTime Simulation time, seconds.
   * @param stopped Whether the aircraft is on the ground and stopped.
   */
  public tick(simTime: number, stopped: boolean): void {
    this.syncFromSim();
    const dt = this.lastSimTime < 0 ? 0 : Math.max(0, Math.min(5, simTime - this.lastSimTime));
    this.lastSimTime = simTime;
    const p = this.payload.get(), f = this.fuel.get();
    if ((p.active || f.active) && !stopped) {
      this.stop();
      return;
    }
    if (p.active && dt > 0) {
      const boarding = p.paxTarget >= p.pax;
      const paxRate = (boarding ? RATES.boardPaxPerMin : RATES.deboardPaxPerMin) / 60;
      const cargoRate = (RATES.cargoKgPerMin * LB_PER_KG) / 60;
      const pax = approach(p.pax, p.paxTarget, paxRate * dt);
      const cargoLb = approach(p.cargoLb, p.cargoTargetLb, cargoRate * dt);
      this.payload.set({ ...p, pax, cargoLb, active: pax !== p.paxTarget || cargoLb !== p.cargoTargetLb });
      this.writePayload();
    }
    if (f.active && dt > 0) {
      const fuelLb = approach(f.fuelLb, f.targetLb, ((RATES.fuelKgPerMin * LB_PER_KG) / 60) * dt);
      this.fuel.set({ ...f, fuelLb, active: fuelLb !== f.targetLb });
      this.writeFuel(fuelLb);
    } else if (!f.active) {
      this.fuel.set({ ...f, fuelLb: this.readFuelLb() });
    }
  }

  /** Writes the rows (whole passengers, spread in proportion to the seats) and the two holds. */
  private writePayload(): void {
    const p = this.payload.get();
    const count = paxPerRow(Math.floor(p.pax + 1e-6));
    SEAT_ROWS.forEach(([station], i) => {
      const extra = station === HOLD_REAR ? p.cargoLb * (1 - FRONT_SHARE) : 0;
      this.sim.set(`PAYLOAD STATION WEIGHT:${station}`, 'pounds', count[i] * this.paxWeightLb + extra);
    });
    this.sim.set(`PAYLOAD STATION WEIGHT:${HOLD_FRONT}`, 'pounds', p.cargoLb * FRONT_SHARE);
  }

  /** Puts `totalLb` on board: the collectors keep what they hold, the rest goes half into each main tank. */
  private writeFuel(totalLb: number): void {
    const perGal = this.sim.get('FUEL WEIGHT PER GALLON', 'pounds');
    if (perGal <= 0) {
      return;
    }
    const collectorsGal = this.sim.get('FUELSYSTEM TANK QUANTITY:3', 'gallons') + this.sim.get('FUELSYSTEM TANK QUANTITY:4', 'gallons');
    const sideGal = Math.max(0, (totalLb / perGal - collectorsGal) / 2);
    this.sim.set('FUELSYSTEM TANK QUANTITY:1', 'gallons', Math.min(sideGal, this.sim.get('FUELSYSTEM TANK CAPACITY:1', 'gallons') || sideGal));
    this.sim.set('FUELSYSTEM TANK QUANTITY:2', 'gallons', Math.min(sideGal, this.sim.get('FUELSYSTEM TANK CAPACITY:2', 'gallons') || sideGal));
  }

  /** All four tanks' capacity, in pounds. */
  public fuelCapacityLb(): number {
    return this.capacityLb();
  }

  /** All four tanks' capacity, in pounds. */
  private capacityLb(): number {
    let gal = 0;
    for (let i = 1; i <= 4; i++) {
      gal += this.sim.get(`FUELSYSTEM TANK CAPACITY:${i}`, 'gallons');
    }
    return gal > 0 ? gal * this.sim.get('FUEL WEIGHT PER GALLON', 'pounds') : Infinity;
  }
}

/** Moves `v` toward `target` by at most `step`. */
function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
