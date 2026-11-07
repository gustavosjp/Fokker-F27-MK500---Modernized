import { Subject } from '@microsoft/msfs-sdk';

import { BOOK_VARS, CalcResult, CALC_LIMITS, fuelCalculator, RefSpeeds, referenceSpeeds } from './booklet';
import { SimBridge } from './sim';

/** Which weight unit (the tablet's and the booklets'). */
type Unit = 'kg' | 'lb';

/**
 * v11.6: the tablet side of the author's booklets. Every setting the booklets keep in an L:var is read each update and written when the pilot changes it
 * here, so the two always show the same: the fuel unit (one with the tablet's own weight unit), the decals, the GPS, and the fuel calculator's inputs.
 * A change on the booklet side is told apart from ours by remembering what each variable last read.
 */
export class BookletState {
  public readonly weightKg = Subject.create(0);
  public readonly fuelKg = Subject.create(0);
  public readonly oatC = Subject.create(15);
  public readonly isaDev = Subject.create(0);
  public readonly groundFt = Subject.create(0);
  public readonly pressureAltFt = Subject.create(0);
  public readonly flapsIndex = Subject.create(0);
  public readonly gpsDistanceNm = Subject.create(0);
  /** The fuel trim selector, 0 to 10 (tens of percent). */
  public readonly fuelTrim = Subject.create(0);

  public readonly decalsHidden = Subject.create(false);
  public readonly gpsVisible = Subject.create(true);
  /** The calculator's dialed distance (nm, 0 = none: the GPS flight plan's), flight level and destination. */
  public readonly distanceNm = Subject.create(0);
  public readonly flightLevel = Subject.create(0);
  public readonly highTraffic = Subject.create(false);

  public readonly speeds = Subject.create<RefSpeeds>({ vref: 0, vapp: 0 });
  public readonly calc = Subject.create<CalcResult>({ distanceNm: 0, totalKg: 0, totalLb: 0, tripKg: 0, climbNm: 0, descentNm: 0, error: 'distance' });

  private readonly seen = new Map<string, number>();
  /** When we last wrote each variable: the sim may hand back the old value for a frame or two, which is not a change from the booklet. */
  private readonly wroteAt = new Map<string, number>();

  /**
   * @param sim Where the aircraft and the booklets' variables are read and written.
   * @param units The tablet's weight unit, which is the booklets' fuel unit too.
   */
  constructor(private readonly sim: SimBridge, private readonly units: Subject<Unit>) {
    // the tablet's saved unit wins when the flight starts; after that, either side can change it
    this.write(BOOK_VARS.unitIsKg, units.get() === 'kg' ? 1 : 0);
    units.sub((u) => this.write(BOOK_VARS.unitIsKg, u === 'kg' ? 1 : 0));
  }

  /** Reads the aircraft and the booklets (called with the model's update). */
  public update(): void {
    const s = this.sim;
    this.weightKg.set(s.get('TOTAL WEIGHT', 'kilograms'));
    this.fuelKg.set(s.get('FUEL TOTAL QUANTITY WEIGHT', 'kilograms'));
    const oat = s.get('AMBIENT TEMPERATURE', 'celsius');
    this.oatC.set(oat);
    this.isaDev.set(oat - s.get('STANDARD ATM TEMPERATURE', 'celsius'));
    this.groundFt.set(s.get('GROUND ALTITUDE', 'feet'));
    this.pressureAltFt.set(s.get('PRESSURE ALTITUDE', 'feet'));
    this.flapsIndex.set(Math.round(s.get('FLAPS HANDLE INDEX', 'number')));
    this.gpsDistanceNm.set(s.get('GPS FLIGHTPLAN TOTAL DISTANCE', 'nautical miles'));
    this.fuelTrim.set(s.get('L:f275_FuelDatum_Sel', 'number'));

    // the booklets' settings: a value that differs from what we last read was changed there
    const kg = this.read(BOOK_VARS.unitIsKg);
    if (kg !== undefined) {
      this.units.set(kg ? 'kg' : 'lb');
    }
    const decals = this.read(BOOK_VARS.decalsHidden);
    if (decals !== undefined) {
      this.decalsHidden.set(decals !== 0);
    }
    const gps = this.read(BOOK_VARS.gpsVisible);
    if (gps !== undefined) {
      this.gpsVisible.set(gps !== 0);
    }
    const parts = [BOOK_VARS.calcHundreds, BOOK_VARS.calcTens, BOOK_VARS.calcUnits].map((v) => this.read(v));
    if (parts.some((p) => p !== undefined)) {
      const [h, t, u] = [BOOK_VARS.calcHundreds, BOOK_VARS.calcTens, BOOK_VARS.calcUnits].map((v) => this.seen.get(v) ?? 0);
      this.distanceNm.set(h * 100 + t * 10 + u);
    }
    const fl = this.read(BOOK_VARS.calcFl);
    if (fl !== undefined) {
      this.flightLevel.set(fl);
    }
    const ht = this.read(BOOK_VARS.calcHighTraffic);
    if (ht !== undefined) {
      this.highTraffic.set(ht !== 0);
    }

    this.speeds.set(referenceSpeeds(this.weightKg.get(), this.isaDev.get(), this.groundFt.get(), this.flapsIndex.get()));
    const level = Math.min(CALC_LIMITS.flMax, Math.max(CALC_LIMITS.flMin, this.flightLevel.get()));
    this.calc.set(fuelCalculator(this.distanceNm.get(), this.gpsDistanceNm.get(), level, oat, this.highTraffic.get(), this.weightKg.get() - this.fuelKg.get()));
  }

  /** @param hidden The decals hidden (the booklet's Hide Decals). */
  public setDecalsHidden(hidden: boolean): void {
    this.write(BOOK_VARS.decalsHidden, hidden ? 1 : 0);
    this.decalsHidden.set(hidden);
  }

  /** @param visible The GPS shown (the booklet's Hide GPS, inverted). */
  public setGpsVisible(visible: boolean): void {
    this.write(BOOK_VARS.gpsVisible, visible ? 1 : 0);
    this.gpsVisible.set(visible);
  }

  /** @param nm The calculator's distance, nm (0 to 1,299; 0 = the GPS flight plan's), written as the booklet's three digits. */
  public setDistance(nm: number): void {
    const d = Math.max(0, Math.min(CALC_LIMITS.distMax, Math.round(nm)));
    this.write(BOOK_VARS.calcHundreds, Math.floor(d / 100));
    this.write(BOOK_VARS.calcTens, Math.floor(d / 10) % 10);
    this.write(BOOK_VARS.calcUnits, d % 10);
    this.distanceNm.set(d);
  }

  /** @param fl The calculator's flight level (50 to 250, in fives as the booklet's buttons). */
  public setFlightLevel(fl: number): void {
    const v = Math.max(CALC_LIMITS.flMin, Math.min(CALC_LIMITS.flMax, Math.round(fl / CALC_LIMITS.flStep) * CALC_LIMITS.flStep));
    this.write(BOOK_VARS.calcFl, v);
    this.flightLevel.set(v);
  }

  /** @param on High traffic destination (more holding fuel) rather than regional. */
  public setHighTraffic(on: boolean): void {
    this.write(BOOK_VARS.calcHighTraffic, on ? 1 : 0);
    this.highTraffic.set(on);
  }

  /** Presses the booklet's CALCUL, so its page shows the result too (it works it out once its fuel calculator page is open). */
  public calculateInBooklet(): void {
    this.sim.set(BOOK_VARS.calcEnter, 'bool', 1);
  }

  /**
   * @param name An L:var.
   * @returns Its value if it changed since we last read or wrote it, else undefined.
   */
  private read(name: string): number | undefined {
    const v = this.sim.get(name, 'number');
    if (this.seen.get(name) === v) {
      return undefined;
    }
    const wrote = this.wroteAt.get(name);
    if (wrote !== undefined && Date.now() - wrote < 1500) {
      return undefined;
    }
    this.seen.set(name, v);
    return v;
  }

  /**
   * @param name An L:var.
   * @param value What to write, remembered as read so it does not come back as a change from the booklet.
   */
  private write(name: string, value: number): void {
    this.sim.set(name, 'number', value);
    this.seen.set(name, value);
    this.wroteAt.set(name, Date.now());
  }
}
