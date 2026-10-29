import { Subject } from '@microsoft/msfs-sdk';

import { DART } from '../dart';
import { SimBridge } from './sim';

/** A checklist line: the item, what it should read, and optionally how the aircraft shows it is done. */
export interface ChecklistItem {
  item: string;
  action: string;
  /** True when the aircraft is in that state; the item then ticks itself while its section is open. */
  auto?: (sim: SimBridge) => boolean;
}

/** A checklist section. */
export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

const on = (name: string) => (s: SimBridge): boolean => s.get(name, 'bool') !== 0;
const off = (name: string) => (s: SimBridge): boolean => s.get(name, 'bool') === 0;
const all = (...fs: ((s: SimBridge) => boolean)[]) => (s: SimBridge): boolean => fs.every((f) => f(s));
const flaps = (min: number, max: number) => (s: SimBridge): boolean => {
  const a = s.get('TRAILING EDGE FLAPS LEFT ANGLE', 'degrees');
  return a >= min && a <= max;
};
const gearDown = all((s) => s.get('GEAR HANDLE POSITION', 'bool') !== 0, (s) => s.get('GEAR TOTAL PCT EXTENDED', 'percent over 100') > 0.99);
const gearUp = all((s) => s.get('GEAR HANDLE POSITION', 'bool') === 0, (s) => s.get('GEAR TOTAL PCT EXTENDED', 'percent over 100') < 0.01);
const powerIdle = (s: SimBridge): boolean => s.get('GENERAL ENG THROTTLE LEVER POSITION:1', 'percent') < 10 && s.get('GENERAL ENG THROTTLE LEVER POSITION:2', 'percent') < 10;
const altStd = (s: SimBridge): boolean => Math.abs(s.get('KOHLSMAN SETTING HG:1', 'inches of mercury') - 29.92) < 0.015;
// the doors the tablet works (front exit, aft and cargo doors: the author's own variables)
const doorsClosed = (s: SimBridge): boolean =>
  s.get('INTERACTIVE POINT OPEN:0', 'percent over 100') < 0.05 && s.get('L:f275_AftDoor_Sw', 'bool') === 0 && s.get('L:f275_CargoDoor_Sw', 'bool') === 0;

/**
 * The F27-500 normal checklist the user supplied (v10.3, "uma parte para o checklist, que ele seja interativo"), in its own words,
 * section by section, then the limitations it lists. Items with `auto` tick themselves when the aircraft shows them done (only the
 * standard sim variables the author's systems drive, plus the doors the tablet itself works).
 */
export const CHECKLIST: ChecklistSection[] = [
  {
    title: 'Cockpit inspection', items: [
      { item: 'Alternators', action: 'OFF' }, { item: 'Warning lights', action: 'CHECKED' }, { item: 'Fasten seat belts', action: 'OFF' },
      { item: 'No smoking', action: 'ON' }, { item: 'Emergency evac lights', action: 'ON' }, { item: 'Nav lights', action: 'AS REQD' },
      { item: 'Anti collision light', action: 'OFF', auto: off('LIGHT BEACON') }, { item: 'Power source', action: 'EXT PWR' },
      { item: 'Generators', action: 'OFF' }, { item: 'Emergency power', action: 'NORMAL' }, { item: 'Inverter 1-2', action: 'ON' },
      { item: 'Inverter 3', action: 'TESTED, NORMAL' }, { item: 'Battery amps', action: 'ZERO' }, { item: 'Start warning', action: 'OFF' },
      { item: 'Engine start master', action: 'NEUTRAL' }, { item: 'Engine start selector', action: 'STBD' }, { item: 'Master radio 1-2', action: 'ON' },
      { item: 'Isolation valves', action: 'TESTED' }, { item: 'Fuel pumps', action: 'OFF' }, { item: 'Water/meth pumps', action: 'OFF' },
      { item: 'Water/meth indicators', action: 'CHECKED' }, { item: 'Fuel filter heat', action: 'OFF' },
      { item: 'Pitot heat', action: 'OFF', auto: off('PITOT HEAT') }, { item: 'Flight rec warn', action: 'ON' }, { item: 'De-ice', action: 'ALL OFF' },
      { item: 'Prop warning lights', action: '5 ON' }, { item: 'AP warning lights', action: 'TESTED' }, { item: 'Instruments', action: 'CHECKED' },
      { item: 'ADI', action: 'TESTED' }, { item: 'RMI vs HSI', action: 'CHECKED' }, { item: 'Ext temp', action: 'CHECKED' },
      { item: 'Engine indications', action: 'CHECKED' }, { item: 'Eng oil press warning', action: 'ON' }, { item: 'Fuel used', action: 'ZERO' },
      { item: 'Landing gear', action: 'DOWN, 3 GREEN', auto: gearDown }, { item: 'Flaps', action: '0 SET AND INDICATED', auto: flaps(-1, 0.5) },
      { item: 'Fuel quantity', action: 'TESTED' }, { item: 'Pressurization', action: 'SET & CHECKED' }, { item: 'AP channel switches', action: '4 ON' },
      { item: 'AP & FD', action: 'OFF', auto: all(off('AUTOPILOT MASTER'), off('AUTOPILOT FLIGHT DIRECTOR ACTIVE:1')) },
      { item: 'HP levers', action: 'H.P.C. SHUT' }, { item: 'Power levers', action: 'IDLE', auto: powerIdle }, { item: 'Flaps asym warn', action: 'OFF' },
    ],
  },
  {
    title: 'Preflight', items: [
      { item: 'Fuel quantity', action: 'CHECKED' }, { item: 'ATIS', action: 'OBTAINED' }, { item: 'CRS/HDG', action: 'SET' },
      { item: 'CRS radio sel', action: 'SET' }, { item: 'Altimeters', action: 'SET & X-CHECKED' },
    ],
  },
  {
    title: 'Before start', items: [
      { item: 'Parking brake', action: 'SET', auto: on('BRAKE PARKING POSITION') }, { item: 'V-speeds', action: 'CHECKED & SET' },
      { item: 'Anti collision light', action: 'ON', auto: on('LIGHT BEACON') }, { item: 'Fuel pumps', action: 'ON' },
      { item: 'Doors', action: 'CLOSED, LIGHTS OUT', auto: doorsClosed }, { item: 'Radio altimeters', action: 'ON' },
      { item: 'Power levers', action: 'IDLE', auto: powerIdle }, { item: 'HP levers', action: 'H.P.C. SHUT' }, { item: 'Fuel trim', action: 'SET FOR START' },
      { item: 'Clearance', action: 'RECEIVED' }, { item: 'Propeller area', action: 'CLEAR' },
    ],
  },
  {
    title: 'After start', items: [
      { item: 'Start warning', action: 'OFF' }, { item: 'Engine start master', action: 'NEUTRAL' }, { item: 'Engine start selector', action: 'STBD' },
      { item: 'Green light', action: 'OFF' }, { item: 'Generators', action: 'ON' }, { item: 'Elec power', action: 'CHECKED' }, { item: 'Alternators', action: 'ON' },
      { item: 'Fasten seat belts', action: 'ON' }, { item: 'Wing lights', action: 'ON', auto: on('LIGHT WING') }, { item: 'Prop warning lights', action: '5 ON' },
      { item: 'Oil pressure & temp', action: 'CHECKED' }, { item: 'HP levers', action: 'LOCK OUT' }, { item: 'Fuel trim', action: 'SET FOR TAKEOFF' },
      { item: 'Warnings', action: 'OFF' }, { item: 'Brake pressures', action: 'CHECKED' }, { item: 'Flight director', action: 'AS REQD' },
    ],
  },
  {
    title: 'Before takeoff', items: [
      { item: 'Water/meth pumps', action: 'ON' }, { item: 'Fuel pumps', action: 'ON' }, { item: 'Fuel filter heat', action: 'OFF' },
      { item: 'Pitot heat', action: 'ON, CHECKED', auto: on('PITOT HEAT') }, { item: 'Windshield de-icing', action: 'LOW' },
      { item: 'Engine de-icing', action: 'AS REQD' }, { item: 'Elevator trim', action: 'SET FOR TAKEOFF' }, { item: 'Rudder, aileron trim', action: 'NEUTRAL' },
      { item: 'Flaps', action: '11.5' },
    ],
  },
  {
    title: 'After takeoff', items: [
      { item: 'Landing gear', action: 'UP, LIGHTS OFF', auto: gearUp }, { item: 'Flaps', action: '0', auto: flaps(-1, 0.5) },
      { item: 'Climb thrust', action: '14,200 RPM' }, { item: 'Prop sync', action: 'ON', auto: on('PROP SYNC ACTIVE:1') }, { item: 'HP levers', action: 'OPEN' },
      { item: 'Water/meth pumps', action: 'OFF' }, { item: 'Engine indications', action: 'CHECKED' },
      { item: 'Landing, taxi, wing lights', action: 'OFF', auto: all(off('LIGHT LANDING'), off('LIGHT TAXI'), off('LIGHT WING')) },
      { item: 'Altimeters', action: 'STANDARD', auto: altStd }, { item: 'Radio altimeters', action: 'OFF' }, { item: 'Cabin pressure', action: 'CHECKED' },
      { item: 'Anti ice', action: 'AS REQD' },
    ],
  },
  {
    title: 'Cruise', items: [
      { item: 'Fuel trim', action: 'TGT MAX 730' }, { item: 'Alternators', action: 'ON' }, { item: 'Elec power', action: 'CHECKED' },
      { item: 'Windshield de-icing', action: 'CHECKED' }, { item: 'Engine indications', action: 'CHECKED' }, { item: 'Cabin pressure', action: 'CHECKED' },
      { item: 'Anti-ice', action: 'TESTED' },
    ],
  },
  {
    title: 'Before descent', items: [
      { item: 'Speed bugs', action: 'SET' }, { item: 'Fasten seat belts', action: 'ON' }, { item: 'Decision height', action: 'SET' },
      { item: 'Pressurization', action: 'SET & CHECKED' },
    ],
  },
  {
    title: 'Descent', items: [
      { item: 'Prop sync', action: 'OFF', auto: off('PROP SYNC ACTIVE:1') }, { item: 'Throttle', action: '11,000 RPM' }, { item: 'Cabin pressure rate', action: 'CHECKED' },
    ],
  },
  {
    title: 'Approach', items: [
      { item: 'Altimeters', action: 'SET & X-CHECKED' }, { item: 'No smoking', action: 'ON' },
      { item: 'Landing, taxi, wing lights', action: 'ON', auto: all(on('LIGHT LANDING'), on('LIGHT TAXI'), on('LIGHT WING')) },
      { item: 'Fuel filter heat', action: 'AS REQD' }, { item: 'Radio altimeters', action: 'ON' }, { item: 'ILS dev lights', action: 'CHECKED' },
      { item: 'Standby attitude ind', action: 'CHECKED' }, { item: 'Fuel trim', action: 'SET FOR TAKEOFF' },
    ],
  },
  {
    title: 'Before landing', items: [
      { item: 'HP levers', action: 'LOCK OUT' }, { item: 'Prop warns 32', action: 'ON' }, { item: 'Fuel filter heat', action: 'OFF' },
      { item: 'Water/meth pumps', action: 'ON' }, { item: 'Landing gear', action: 'DOWN, 3 GREEN', auto: gearDown },
      { item: 'Flaps', action: '26.5 OR 40', auto: flaps(26, 41) },
    ],
  },
  {
    title: 'After landing', items: [
      { item: 'Prop warns', action: '5 ON' }, { item: 'Flaps', action: '0', auto: flaps(-1, 0.5) }, { item: 'Landing lights', action: 'OFF', auto: off('LIGHT LANDING') },
      { item: 'Water/meth pumps', action: 'OFF' }, { item: 'Pitot heat', action: 'OFF', auto: off('PITOT HEAT') }, { item: 'Windshield de-icing', action: 'OFF' },
      { item: 'Radio altimeters', action: 'OFF' }, { item: 'Flight director', action: 'OFF', auto: off('AUTOPILOT FLIGHT DIRECTOR ACTIVE:1') },
    ],
  },
  {
    title: 'Parking', items: [
      { item: 'Taxi & wing lights', action: 'OFF', auto: all(off('LIGHT TAXI'), off('LIGHT WING')) }, { item: 'Parking brake', action: 'SET', auto: on('BRAKE PARKING POSITION') },
      { item: 'HP levers', action: 'H.P.C. SHUT' }, { item: 'Anti collision light', action: 'OFF', auto: off('LIGHT BEACON') }, { item: 'Fasten seat belts', action: 'OFF' },
    ],
  },
  {
    title: 'Securing', items: [
      { item: 'Power source', action: 'EXT PWR' }, { item: 'Nav lights', action: 'AS REQD' }, { item: 'Generators', action: 'OFF' }, { item: 'Alternators', action: 'OFF' },
      { item: 'Inverters 1-2', action: 'OFF' }, { item: 'Master radio 1-2', action: 'OFF' }, { item: 'Fuel used', action: 'CHECKED' },
    ],
  },
];

/** The limitations block of the same checklist. */
export const LIMITATIONS: [string, string][] = [
  ['VNE', '254 / 234 (> 20,000 FT)'], ['VMO', '223 / 200 (> 20,000 FT)'], ['VLO/VLE', '168'], ['VFE 16.5', '167'], ['VFE 26.5', '157'],
  ['VFE 40', '144'], ['VB', '179 (MAX WGT) / 161 (EMPTY)'], ['MTOW', '19,730 KG / 43,500 LBS'], ['MLW', '18,600 KG / 41,000 LBS'],
  ['MZFW', '17,450 KG / 38,470 LBS'],
];

/** 15000 -> "15,000" (no toLocaleString: not in every sim browser). */
const k = (v: number): string => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * v10.6: the engines' limits beside the aircraft's, from the F27 maintenance training manual (80.20; dart.ts holds the numbers, which
 * the MFD's engine band and the Systems app colour by).
 */
export const ENGINE_LIMITATIONS: [string, string][] = [
  ['TAKE-OFF', `${k(DART.takeOffRpm)} RPM, 5 MIN`],
  ['T/O TGT', `${DART.takeOffTgtWet} WET / ${DART.takeOffTgtDry} DRY`],
  ...DART.tgtBands.map(([from, tgt], i): [string, string] => [
    from > 0 ? `TGT ${k(from)}+ RPM` : `TGT < ${k(DART.tgtBands[i - 1][0])} RPM`, `${tgt} °C`]),
  ['GROUND IDLE', `${k(DART.groundIdleRpm)} ±500 RPM, TGT 550`],
  ['START TGT', `${DART.startTgt} °C MOMENTARY`],
  ['OVERSPEED', `${k(DART.overspeedRpm)} RPM, 20 S MAX`],
  ['GROUND, AVOID', `${k(DART.groundAvoidRpm[0])}-${k(DART.groundAvoidRpm[1])} RPM`],
  ['OIL P AT 12,000', '13.5 PSI (< 55 °C) TO 12'],
  ['OIL TEMP', `${DART.oilMaxC} °C MAX, ${DART.oilWetTakeOffC} WET T/O`],
  ['FUEL ASYMMETRY', `${k(DART.fuelAsymmetryLb)} LB IN FLIGHT`],
  ['WATER/METHANOL', `SELECT BELOW ${k(DART.wmMaxRpm)} RPM`],
  ['FEATHERING PUMP', `${DART.featherMinPerHour} MIN PER HOUR`],
  ['STARTER', `${DART.starterMaxS} S; ${DART.starterCyclesExt} EXT / ${DART.starterCyclesBatt} BATT, ${DART.starterRestMin} MIN`],
  ['BATTERY START', `OAT ABOVE ${DART.batteryStartOatC} °C, ${DART.batteryStartV} V`],
];

/** Which items are ticked (in memory: a checklist belongs to one flight), the open section, and the self-ticking of `auto` items. */
export class ChecklistState {
  /** One entry per section: ticked flags of its items. */
  public readonly ticked = CHECKLIST.map((sec) => Subject.create<boolean[]>(sec.items.map(() => false)));
  /** Index of the open section; CHECKLIST.length is the limitations page. */
  public readonly open = Subject.create(0);
  /** Items the pilot unticked ("section:item"): their `auto` waits until the section is cleared. */
  private readonly unticked = new Set<string>();

  /**
   * @param sim Where the `auto` conditions are read.
   */
  constructor(private readonly sim: SimBridge) { }

  /** Ticks or unticks one item of a section. */
  public toggle(section: number, item: number): void {
    const t = this.ticked[section].get().slice();
    t[item] = !t[item];
    if (t[item]) {
      this.unticked.delete(`${section}:${item}`);
    } else {
      this.unticked.add(`${section}:${item}`);
    }
    this.ticked[section].set(t);
  }

  /** Unticks a section, or every section. */
  public reset(section?: number): void {
    this.ticked.forEach((s, i) => {
      if (section === undefined || section === i) {
        s.set(CHECKLIST[i].items.map(() => false));
      }
    });
    this.unticked.forEach((key) => {
      if (section === undefined || key.startsWith(`${section}:`)) {
        this.unticked.delete(key);
      }
    });
  }

  /** Ticks the open section's `auto` items the aircraft shows done (called with every poll; they stay ticked). */
  public update(): void {
    const i = this.open.get();
    if (i >= CHECKLIST.length) {
      return;
    }
    const t = this.ticked[i].get();
    let changed = false;
    const next = CHECKLIST[i].items.map((it, k) => {
      if (!t[k] && it.auto && !this.unticked.has(`${i}:${k}`) && it.auto(this.sim)) {
        changed = true;
        return true;
      }
      return t[k];
    });
    if (changed) {
      this.ticked[i].set(next);
    }
  }
}
