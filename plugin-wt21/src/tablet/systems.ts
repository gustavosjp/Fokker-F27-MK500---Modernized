import { DART, DartState } from '../dart';
import { SimBridge } from './sim';

/** One Dart, as the author's gauges and the sim give it. */
export interface EngineReadings {
  rpm: number;
  tgt: number;
  torquePsi: number;
  fuelFlowLbH: number;
  oilPsi: number;
  oilC: number;
  running: boolean;
  starter: boolean;
  /** The feathering pump runs (its button's light). */
  featherPump: boolean;
  /** Water/methanol switch on, and flowing (its light). */
  wmOn: boolean;
  wmFlow: boolean;
  wmLitres: number;
}

/**
 * The fuel system as the author defines it (flight_model.cfg [FUEL_SYSTEM]): on each side a main tank feeds a collector tank through
 * an isolation valve (valves 1, 2); two electric boost pumps in the collector (pumps 3-4 left, 5-6 right) pressurise the LP line
 * (lines 7 and 19), which goes through the LP cock (fire valve, 3-4) to the engine-driven HP pump (pumps 1-2) and the HP cock (5-6);
 * the crossfeed valves (7-8) join the two LP lines.
 */
export interface FuelReadings {
  /** Left, right. */
  mainLb: [number, number];
  mainCapLb: [number, number];
  collectorLb: [number, number];
  collectorCapLb: [number, number];
  /** Boost pumps left 1, left 2, right 1, right 2: switched on, running, their low pressure light. */
  pumpSwitch: boolean[];
  pumpOn: boolean[];
  pumpWarn: boolean[];
  /** Engine-driven HP pumps 1, 2. */
  hpPump: [boolean, boolean];
  /** Valves 1 to 8 (index 0 to 7) open. */
  valveOpen: boolean[];
  lpPsi: [number, number];
  fuelFlowLbH: [number, number];
  heater: [boolean, boolean];
  crossfeedSwitch: boolean;
}

/** The electrical system (systems.cfg [ELECTRICAL]): 28 V DC from the generators, batteries and GPU; AC from the inverters; the de-icing alternators. */
export interface ElecReadings {
  /** GEN 1, GEN 2 (alternators 1, 2: 28 V, on generator buses 17, 18). */
  genV: [number, number];
  genA: [number, number];
  /** ALT 1, ALT 2 (alternators 3, 4: the 208 V de-icing alternators, phase voltage). */
  altOn: [boolean, boolean];
  altV: [number, number];
  altA: [number, number];
  battV: [number, number];
  /** Discharging is positive. */
  battA: [number, number];
  battPct: [number, number];
  gpuOn: boolean;
  gpuV: number;
  /** Bus voltages by bus number (the sim's, all 28 V-based: the author's AC voltmeter shows the 115 V buses as 4.4 times theirs). */
  busV: Record<number, number>;
  /** L:f275_Sw_Elec_ParcbatSel: 0 BATT BORD, 1 ARRET, 2 PARC. */
  powerSelector: number;
  inverterSwitch: [boolean, boolean];
  /** Warning lights. */
  altFail: [boolean, boolean];
  altHot: [boolean, boolean];
  altOverVolt: [boolean, boolean];
  inverterFail: [boolean, boolean];
  genHot: [boolean, boolean];
  gpuLight: boolean;
  starterLight: boolean;
}

/** Pressurisation and the pneumatic system (gear, brakes, nose wheel steering, and their emergency bottles). */
export interface AirReadings {
  cabinAltFt: number;
  cabinRateFpm: number;
  diffPsi: number;
  dump: boolean;
  /** The author's gauges: normal system (main bottle), brakes, alternate (emergency) bottles, psi. */
  pneuMainPsi: number;
  pneuBrakesPsi: number;
  pneuEmergPsi: number;
  wingDeicePsi: number;
}

export interface SystemsReadings {
  engines: [EngineReadings, EngineReadings];
  fuel: FuelReadings;
  elec: ElecReadings;
  air: AirReadings;
  onGround: boolean;
}

/** The buses shown (systems.cfg numbers). */
export const BUSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16];

/**
 * v10.6 Systems app (the manual items left from v10.5): everything it shows, read in one go a few times a second while the app is
 * open (nothing is read while it is closed).
 */
export function readSystems(s: SimBridge): SystemsReadings {
  const b = (name: string): boolean => s.get(name, 'bool') !== 0;
  const pair = <T>(f: (n: 1 | 2) => T): [T, T] => [f(1), f(2)];
  const perGal = s.get('FUEL WEIGHT PER GALLON', 'pounds');
  const tank = (n: number): number => s.get(`FUELSYSTEM TANK QUANTITY:${n}`, 'gallons') * perGal;
  const tankCap = (n: number): number => Math.max(1, s.get(`FUELSYSTEM TANK CAPACITY:${n}`, 'gallons') * perGal);
  const busV: Record<number, number> = {};
  for (const n of BUSES) {
    busV[n] = s.get(`ELECTRICAL MAIN BUS VOLTAGE:${n}`, 'volts');
  }
  return {
    engines: pair((n) => ({
      rpm: s.get(`L:f275_RpmF27_0${n}`, 'number'),
      tgt: s.get(`L:f275_dart_egt_0${n}_ind`, 'number'),
      torquePsi: s.get(`L:f275_xengtorq_${n}_ind`, 'number'),
      fuelFlowLbH: s.get(`ENG FUEL FLOW PPH:${n}`, 'pounds per hour'),
      oilPsi: s.get(`ENG OIL PRESSURE:${n}`, 'psi'),
      oilC: s.get(`ENG OIL TEMPERATURE:${n}`, 'celsius'),
      running: b(`GENERAL ENG COMBUSTION:${n}`),
      starter: b(`GENERAL ENG STARTER ACTIVE:${n}`),
      featherPump: b(`L:F275bgt_warn_FeatherPump0${n}`),
      wmOn: b(`L:f275_Sw_WaterMeth0${n}_pos`),
      wmFlow: b(`L:f275_W_WaterMeth0${n}`),
      wmLitres: s.get(`L:f275_WaterMeth_Aig0${n}`, 'number'),
    })),
    fuel: {
      mainLb: [tank(1), tank(2)],
      mainCapLb: [tankCap(1), tankCap(2)],
      collectorLb: [tank(3), tank(4)],
      collectorCapLb: [tankCap(3), tankCap(4)],
      pumpSwitch: ['Left01', 'Left02', 'Right01', 'Right02'].map((p) => b(`L:f275_Sw_FuelPump${p}_pos`)),
      pumpOn: [3, 4, 5, 6].map((n) => b(`FUELSYSTEM PUMP ACTIVE:${n}`)),
      pumpWarn: ['11', '12', '21', '22'].map((p) => b(`L:F275bgt_Warn_FuelPump${p}`)),
      hpPump: pair((n) => b(`FUELSYSTEM PUMP ACTIVE:${n}`)),
      valveOpen: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => s.get(`FUELSYSTEM VALVE OPEN:${n}`, 'percent over 100') > 0.5),
      lpPsi: [s.get('FUELSYSTEM LINE FUEL PRESSURE:7', 'psi'), s.get('FUELSYSTEM LINE FUEL PRESSURE:19', 'psi')],
      fuelFlowLbH: pair((n) => s.get(`ENG FUEL FLOW PPH:${n}`, 'pounds per hour')),
      heater: pair((n) => b(`L:f275_Sw_FuelHeat0${n}`)),
      crossfeedSwitch: b('L:f275_Fuel_Cross_Rotac'),
    },
    elec: {
      genV: pair((n) => s.get(`ELECTRICAL GENALT BUS VOLTAGE:${n}`, 'volts')),
      genA: pair((n) => s.get(`ELECTRICAL GENALT BUS AMPS:${n}`, 'amperes')),
      altOn: pair((n) => b(`GENERAL ENG MASTER ALTERNATOR:${n + 2}`)),
      altV: pair((n) => s.get(`ELECTRICAL GENALT BUS VOLTAGE:${n + 2}`, 'volts')),
      altA: pair((n) => s.get(`ELECTRICAL GENALT BUS AMPS:${n + 2}`, 'amperes')),
      battV: pair((n) => s.get(`ELECTRICAL BATTERY VOLTAGE:${n}`, 'volts')),
      battA: pair((n) => s.get(`ELECTRICAL BATTERY LOAD:${n}`, 'amperes')),
      battPct: pair((n) => s.get(`ELECTRICAL BATTERY ESTIMATED CAPACITY PCT:${n}`, 'percent')),
      gpuOn: b('EXTERNAL POWER ON:1'),
      gpuV: s.get('ELECTRICAL EXTERNAL POWER VOLTAGE:1', 'volts'),
      busV,
      powerSelector: Math.round(s.get('L:f275_Sw_Elec_ParcbatSel', 'number')),
      inverterSwitch: pair((n) => b(`L:f275_Sw_Conv0${n}_pos`)),
      altFail: pair((n) => b(`L:f275_warn_alt0${n}`)),
      altHot: pair((n) => b(`L:f275_warn_Alt0${n}_OverHeat`)),
      altOverVolt: pair((n) => b(`L:f275_warn_Alt0${n}_OverVolt`)),
      inverterFail: pair((n) => b(`L:f275_warn_conv0${n}`)),
      // the author's GEN overheat light: above 180 on his generator temperature
      genHot: pair((n) => s.get(`L:F275bgt_Gen_Temp0${n}`, 'number') > 180),
      gpuLight: b('L:f275_warn_gpu'),
      starterLight: b('L:f275_warn_starter'),
    },
    air: {
      cabinAltFt: s.get('PRESSURIZATION CABIN ALTITUDE', 'feet'),
      cabinRateFpm: s.get('PRESSURIZATION CABIN ALTITUDE RATE', 'feet per minute'),
      diffPsi: s.get('PRESSURIZATION PRESSURE DIFFERENTIAL', 'psi'),
      dump: b('L:f275_Sw_Depress'),
      pneuMainPsi: s.get('L:F275bgt_PneuPress_Ppl', 'number'),
      pneuBrakesPsi: s.get('L:F275bgt_PneuPress_Brakes', 'number'),
      pneuEmergPsi: s.get('L:F275bgt_PneuPress_Emerg', 'number'),
      // the author's wing de-ice gauge shows 18 psi while the boots are pressurised
      wingDeicePsi: b('L:F275bgt_deicepneu_press_is_on') ? 18 : 0,
    },
    onGround: b('SIM ON GROUND'),
  };
}

/** An engine's readings as the Dart's limits see them. */
export function dartState(e: EngineReadings, onGround: boolean): DartState {
  return {
    rpm: e.rpm, tgt: e.tgt, oilPsi: e.oilPsi, oilC: e.oilC, running: e.running,
    starting: e.starter || (e.running && e.rpm < DART.groundIdleRpm - 500), wet: e.wmFlow, onGround,
  };
}

/**
 * The pneumatic system's pressures (F27 maintenance training manual 36.00): the supply regulated at 2,800 to 2,900 psi, relief valves
 * at 3,500 psi; before take-off at least 1,500 psi in the main and brake bottles and 1,750 psi in the alternate (emergency) ones.
 */
export const PNEUMATIC = { normalPsi: 2900, reliefPsi: 3500, minMainPsi: 1500, minBrakesPsi: 1500, minEmergPsi: 1750, gaugePsi: 4000 };

/** Pressurisation (the manual's cabin pressure control): the differential is held at 4.16 psi at most; the safety valve opens at 4.22. */
export const CABIN_DIFF = { maxPsi: 4.16, safetyPsi: 4.22, gaugePsi: 5 };
