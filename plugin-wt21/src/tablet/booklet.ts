/**
 * v11.6 (user: "tem essas informações também, podemos adicionar elas ao tablet, e sincronizar"): what the author's two cockpit booklets show, for the
 * tablet's Booklet page. The booklets keep their settings and the fuel calculator's inputs in L:vars (his systems gauge reads and writes them), so the
 * tablet shares the very same variables: a change on either side shows on both.
 *
 * The figures (fuel calculator tables, reference speed tables, fuel trim charts, limitations) are the F27 Mk500 data the booklets give; the tablet works
 * them out itself. Checked offline against the author's own systems gauge on a grid of inputs (see docs/DEVELOPMENT.md, v11.6).
 */

/** The booklets' L:vars (his systems gauge reads and writes them; clicks on the booklet pages write them too). */
export const BOOK_VARS = {
  unitIsKg: 'L:f275_unit_is_kg',
  decalsHidden: 'L:Decals_isHidden',
  gpsVisible: 'L:GPS_isVisible',
  calcFl: 'L:f275_FuelCalc_FL',
  calcHundreds: 'L:f275_FuelCalc_DistHun',
  calcTens: 'L:f275_FuelCalc_DistDiz',
  calcUnits: 'L:f275_FuelCalc_DistUnit',
  calcHighTraffic: 'L:f275_FuelCalc_Airpt',
  calcEnter: 'L:f275_FuelCalc_Enter',
} as const;

/** The fuel calculator's limits, as the booklet's click areas keep them. */
export const CALC_LIMITS = { flMin: 50, flMax: 250, flStep: 5, distMax: 1299 };

/**
 * Linear through (x0, y0) and (x1, y1), not clamped, with the slope and the offset kept in single precision as the booklet does (so the rounding of
 * distances to whole miles comes out the same).
 */
function lin(x: number, x0: number, x1: number, y0: number, y1: number): number {
  const a = x1 !== x0 ? Math.fround((y1 - y0) / (x1 - x0)) : 0;
  const b = Math.fround(y1 - a * x1);
  return a * x + b;
}

/** A table of [from, to, yFrom, yTo] rows tried in order with `x < to`; past the last row, `last`. */
type Rows = readonly (readonly [number, number, number, number])[];
function table(x: number, rows: Rows, last: number): number {
  for (const [x0, x1, y0, y1] of rows) {
    if (x < x1) {
      return lin(x, x0, x1, y0, y1);
    }
  }
  return last;
}

const u32 = (v: number): number => (v >= 0 && v < 4294967296 ? Math.trunc(v) : 0);

// ---------------------------------------------------------------------------------------------------------------------------------- fuel calculator

/** Climb flight level correction for the temperature: cold (below 5 °C) and hot (from 35 °C), by flight level. */
const CLIMB_FL_COLD: Rows = [[0, 50, 0, -2.5], [50, 100, -2.5, -5], [100, 160, -5, -10]];
const CLIMB_FL_HOT: Rows = [[0, 50, 0, 15], [50, 100, 15, 20], [100, 160, 20, 50], [160, 190, 50, 60]];
/** Climb fuel (kg) and distance (nm) by the corrected flight level. */
const CLIMB_FUEL: Rows = [[0, 50, 0, 180], [50, 100, 180, 250], [100, 125, 250, 290], [125, 150, 290, 330], [150, 175, 330, 380], [175, 200, 380, 435],
  [200, 220, 435, 480], [220, 230, 480, 520], [230, 240, 520, 560], [240, 250, 560, 600]];
const CLIMB_DIST: Rows = [[0, 50, 0, 10], [50, 100, 10, 22], [100, 125, 22, 30], [125, 150, 30, 38], [150, 175, 38, 52], [175, 200, 52, 65],
  [200, 220, 65, 80], [220, 230, 80, 92], [230, 240, 92, 110], [240, 250, 110, 140]];
/** Climb fuel and distance corrections for a light (14 t and less) and a heavy (20 t and more) aircraft, by flight level. */
const CLIMB_FUEL_LIGHT: Rows = [[0, 100, 0, -50], [100, 150, -50, -75], [150, 200, -75, -115], [200, 220, -115, -135]];
const CLIMB_DIST_LIGHT: Rows = [[0, 100, 0, -8], [100, 150, -5, -12], [150, 200, -12, -23], [200, 220, -23, -32], [220, 240, -32, -60]];
const CLIMB_FUEL_HEAVY: Rows = [[0, 100, 0, 30], [100, 150, 30, 50], [150, 200, 50, 95], [200, 220, 95, 120]];
const CLIMB_DIST_HEAVY: Rows = [[0, 100, 0, 4], [100, 150, 4, 10], [150, 200, 10, 19], [200, 220, 19, 31]];
/** Descent fuel (kg) and distance (nm) by flight level (from the top). */
const DESCENT: readonly (readonly [number, number, number, number, number, number])[] = [
  [200, 250, 110, 156, 56, 78], [180, 200, 97, 110, 50, 56], [150, 180, 80, 97, 40, 50], [100, 150, 51, 80, 25, 40], [0, 100, 0, 51, 0, 25]];
/** Cruise fuel flow per engine (kg/h) and true airspeed (kt) by flight level: ISA, cold, hot. */
const FF_ISA: Rows = [[70, 100, 485, 452], [100, 125, 452, 423], [125, 150, 423, 396], [150, 175, 396, 369], [175, 200, 369, 341], [200, 225, 341, 315], [225, 250, 315, 295]];
const FF_COLD: Rows = [[70, 100, 496, 466], [100, 125, 466, 437], [125, 150, 437, 407], [150, 175, 407, 377], [175, 200, 377, 346], [200, 225, 346, 321], [225, 250, 321, 295]];
const FF_HOT: Rows = [[70, 100, 415, 387], [100, 125, 387, 363], [125, 150, 363, 337], [150, 175, 337, 314], [175, 200, 314, 290], [200, 225, 290, 267], [225, 250, 262, 245]];
const TAS_ISA: Rows = [[70, 100, 240, 242], [100, 125, 242, 243], [125, 150, 243, 240], [150, 175, 240, 238], [175, 200, 238, 237], [200, 225, 237, 231], [225, 250, 231, 225]];
const TAS_COLD: Rows = [[70, 100, 235, 244], [100, 125, 244, 247], [125, 150, 247, 246], [150, 175, 246, 247], [175, 200, 247, 243], [200, 225, 243, 238], [225, 250, 238, 230]];
const TAS_HOT: Rows = [[70, 100, 204, 203], [100, 125, 203, 200], [125, 150, 200, 197], [150, 175, 197, 192], [175, 200, 192, 187], [200, 225, 187, 178], [225, 250, 178, 164]];
/** Holding and alternate allowance at the destination (kg): regional, high traffic; plus the final reserve, and 5 % of the trip for contingency. */
const DEST_RESERVE = { regional: 360, highTraffic: 500 };
const FINAL_RESERVE = 540;
/** The booklet gives up above the maximum take-off weight, tonnes. */
const MTOW_T = 19.73;

export type CalcError = 'distance' | 'reduce-fl' | 'too-heavy';
export interface CalcResult {
  /** Distance the calculation used, nm (the dialed one, or the GPS flight plan's when none is dialed). */
  distanceNm: number;
  totalKg: number;
  totalLb: number;
  tripKg: number;
  climbNm: number;
  descentNm: number;
  /** Set when the booklet would show a message instead of the fuel. */
  error?: CalcError;
}

/**
 * The booklet's FUEL CALCULATOR. A first pass at 18 t gives the take-off weight (the zero fuel weight plus that fuel), and the fuel is worked out again at
 * that weight, as the booklet does over two frames.
 * @param distanceNm Dialed distance, nm (0: none dialed).
 * @param gpsDistanceNm The GPS flight plan's total distance, nm, used when none is dialed.
 * @param fl Cruise flight level (50 to 250).
 * @param oatC Outside air temperature now, °C.
 * @param highTraffic Destination: high traffic (more holding fuel) or regional.
 * @param zeroFuelKg Zero fuel weight now, kg (total weight less the fuel on board).
 */
export function fuelCalculator(distanceNm: number, gpsDistanceNm: number, fl: number, oatC: number, highTraffic: boolean, zeroFuelKg: number): CalcResult {
  const dist = distanceNm > 0 ? Math.trunc(distanceNm) : Math.trunc(gpsDistanceNm);
  const oat = Math.trunc(oatC);
  const pass = (weightT: number): CalcResult & { weightT: number } => {
    const cold = table(fl, CLIMB_FL_COLD, -10);
    const hot = table(fl, CLIMB_FL_HOT, 60);
    const corrFl = fl + (oat < 5 ? cold : oat < 15 ? lin(oat, 5, 15, cold, 0) : oat < 35 ? lin(oat, 15, 35, 0, hot) : hot);
    const climbFuelBase = table(corrFl, CLIMB_FUEL, 600);
    const climbDistBase = u32(table(corrFl, CLIMB_DIST, 140));
    const byWeight = (light: number, heavy: number): number =>
      weightT < 14 ? light : weightT < 18 ? lin(weightT, 14, 18, light, 0) : weightT < 20 ? lin(weightT, 18, 20, 0, heavy) : heavy;
    const climbFuel = climbFuelBase + byWeight(table(fl, CLIMB_FUEL_LIGHT, -135), table(fl, CLIMB_FUEL_HEAVY, 120));
    const climbNm = u32(climbDistBase + byWeight(table(fl, CLIMB_DIST_LIGHT, -60), table(fl, CLIMB_DIST_HEAVY, 31)));
    const d = DESCENT.find(([from]) => fl > from) ?? DESCENT[DESCENT.length - 1];
    const descentFuel = u32(lin(fl, d[1], d[0], d[3], d[2]));
    const descentNm = u32(lin(fl, d[1], d[0], d[5], d[4]));
    const ffIsa = u32(table(fl, FF_ISA, 295));
    const ffCold = table(fl, FF_COLD, 295);
    const ffHot = table(fl, FF_HOT, 245);
    const ff = oat < 5 ? ffCold : oat < 15 ? lin(oat, 5, 15, ffCold, ffIsa) : oat < 40 ? lin(oat, 15, 40, ffIsa, ffHot) : ffHot;
    const tasIsa = u32(table(fl, TAS_ISA, 225));
    const tasCold = table(fl, TAS_COLD, 230);
    const tasHot = table(fl, TAS_HOT, 164);
    const tas = oat < -15 ? tasCold : oat < 15 ? lin(oat, -15, 15, tasCold, tasIsa) : oat < 40 ? lin(oat, 15, 40, tasIsa, tasHot) : tasHot;
    // heavier is slower: knots off per tonne over 18
    const over = weightT - 18;
    const slower = over * (fl <= 100 ? (over < 0 ? 1 : 2) : lin(fl, 100, 250, 2, 4));
    const gs = tas - slower;
    const cruiseNm = dist - (climbNm + descentNm);
    const hours = gs !== 0 ? cruiseNm / gs : 0;
    const cruiseFuel = u32(2 * ff * hours);
    const trip = u32(climbFuel + cruiseFuel + descentFuel);
    const total = trip + Math.trunc((trip * 5) / 100) + (highTraffic ? DEST_RESERVE.highTraffic : DEST_RESERVE.regional) + FINAL_RESERVE;
    const result: CalcResult & { weightT: number } = {
      distanceNm: dist, totalKg: total, totalLb: u32(total * 2.20452), tripKg: trip, climbNm, descentNm, weightT: (zeroFuelKg + total) / 1000,
    };
    if (cruiseNm <= 0) {
      result.error = dist === 0 ? 'distance' : 'reduce-fl';
    }
    return result;
  };
  const first = pass(18);
  if (first.error) {
    return first;
  }
  if (first.weightT > MTOW_T) {
    return { ...first, error: 'too-heavy' };
  }
  const second = pass(first.weightT);
  if (!second.error && second.weightT > MTOW_T) {
    second.error = 'too-heavy';
  }
  return second;
}

// ---------------------------------------------------------------------------------------------------------------------------------- reference speeds

export interface RefSpeeds {
  vref: number;
  /** Take-off speeds; undefined with the landing flap setting. */
  v1?: number;
  vr?: number;
  v2?: number;
  v3?: number;
  vapp: number;
}

/** Vref by weight (kg): the table the booklet means (between 18,500 and 19,000 kg and below 18,000 kg the booklet itself shows other figures). */
const VREF: Rows = [[16500, 17000, 96, 97], [17000, 17500, 97, 98], [17500, 18000, 98, 100], [18000, 18500, 100, 101], [18500, 19000, 101, 102]];
/** Take-off V1 and V2 by weight, flaps up (F0) and with take-off flaps (F2); [from, to, F0 V1, F0 V2, F2 V1, F2 V2] at `from` and at `to`. */
const TO_SPEEDS: readonly (readonly [number, number, readonly number[], readonly number[]])[] = [
  [14000, 16000, [86, 97, 77, 93], [95, 104, 85, 94]],
  [16000, 16500, [95, 104, 85, 94], [97, 106, 87, 96]],
  [16500, 18000, [97, 106, 87, 96], [103, 111, 93, 100]],
  [18000, 18500, [103, 111, 93, 100], [105, 112, 95, 101]],
  [18500, 19000, [105, 112, 95, 101], [107, 114, 100, 105]],
  [19000, 19700, [107, 114, 100, 105], [110, 116, 100, 105]],
];

/**
 * The booklet's REFERENCE SPEEDS for the weight, the temperature's deviation from ISA, the ground elevation and the flap handle position.
 * Matches the author's booklet except where his code leaves a figure unset or reads the wrong row of a table (Vref between 18,500 and 19,000 kg, some
 * flap 26.5 corrections at the band edges).
 * @param weightKg Total weight, kg.
 * @param isaDev Outside temperature less the standard one, °C.
 * @param groundFt Ground elevation, ft.
 * @param flapsIndex Flap handle position (0 up, 1, 2 take-off settings, 3 and more landing).
 */
export function referenceSpeeds(weightKg: number, isaDev: number, groundFt: number, flapsIndex: number): RefSpeeds {
  const w = weightKg;
  const d = isaDev;
  const z = groundFt;
  const vref = w >= 19000 ? 102 : w < 16500 ? 96 : table(w, VREF, 102);
  const row = w < 14000 ? TO_SPEEDS[0] : TO_SPEEDS.find(([from, to]) => w >= from && w <= to) ?? TO_SPEEDS[TO_SPEEDS.length - 1];
  const at = w < 14000 ? 0 : Math.min(1, (w - row[0]) / (row[1] - row[0]));
  const base = row[2].map((v, i) => lin(row[0] + at * (row[1] - row[0]), row[0], row[1], v, row[3][i]));
  const [f0v1Base, f0v2, f2v1Base, f2v2Base] = base;
  // flaps up: V1 1 kt lower in the cold, 1 kt higher in the warm; V2 unchanged
  const f0v1 = d <= -20 ? f0v1Base - 1 : d <= -10 ? lin(d, -20, -10, f0v1Base - 1, f0v1Base) : d <= 0 ? f0v1Base : f0v1Base + 1;
  // take-off flaps: V1 and V2 by temperature, for the heavy (19 t and more) and the light end, blended over 18.5 to 19 t (18 to 18.5 t when warm)
  const a = f2v1Base;
  const b = f2v2Base;
  let v1Heavy: number; let v1Light: number; let v2Heavy: number; let v2Light: number; let blendFrom = 18500; let blendTo = 19000;
  if (d <= -10) {
    const dd = Math.max(d, -20);
    v1Heavy = lin(dd, -20, -10, a - 4, a - 3); v1Light = lin(dd, -20, -10, a - 1, a);
    v2Heavy = b - 3; v2Light = d <= -20 ? b - 3 : b;
  } else if (d <= 0) {
    v1Heavy = lin(d, -10, 0, a - 3, a); v1Light = a;
    v2Heavy = lin(d, -10, 0, b - 3, b); v2Light = b;
  } else if (d <= 10) {
    v1Heavy = lin(d, 0, 10, a, a + 1); v1Light = w >= 18500 ? lin(d, 0, 10, a, a + 2) : lin(d, 0, 10, a, a + 1);
    v2Heavy = lin(d, 0, 10, b, b + 7); v2Light = w >= 18500 ? lin(d, 0, 10, b, b + 1) : b;
  } else if (d <= 20) {
    v1Heavy = lin(d, 10, 20, a, a + 7);
    v2Heavy = b + 7;
    if (w >= 18500) {
      v1Light = v1Heavy; v2Light = lin(d, 10, 20, b + 1, b + 5);
    } else {
      blendFrom = 18000; blendTo = 18500;
      v1Light = lin(d, 10, 20, a + 1, a + 2); v2Light = b;
      v1Heavy = lin(d, 10, 20, a + 2, a + 7); v2Heavy = lin(d, 10, 20, b + 1, b + 5);
    }
  } else {
    v1Heavy = a + 7; v2Heavy = b + 7;
    if (w >= 18500) {
      v1Light = a + 7; v2Light = b + 5;
    } else {
      blendFrom = 18000; blendTo = 18500;
      v1Light = a + 2;
      v2Light = w < 18000 ? b : z < 500 ? b : z < 1000 ? lin(z, 500, 1000, b, b + 3) : z < 1500 ? lin(z, 1000, 1500, b + 3, b + 7) : b + 7;
      v1Heavy = a + 7; v2Heavy = b + 5;
    }
  }
  const blend = (light: number, heavy: number): number => (w >= blendTo ? heavy : w >= blendFrom ? lin(w, blendFrom, blendTo, light, heavy) : light);
  const f2v1Temp = blend(v1Light, v1Heavy);
  const f2v2 = blend(v2Light, v2Heavy);
  // take-off flaps V1 by ground elevation: up to 1 kt to 500 ft, then 3 kt (heavy) or 2 kt (light) from 1,500 ft
  const up = (light: number, heavy: number): number => (w >= 18500 ? heavy : w >= 18000 ? lin(w, 18000, 18500, light, heavy) : light);
  const f2v1 = z <= 500 ? lin(z, 0, 500, f2v1Temp, f2v1Temp + 1)
    : z < 1000 ? up(f2v1Temp + 1, lin(z, 500, 1000, f2v1Temp + 1, f2v1Temp + 3))
      : z < 1500 ? up(lin(z, 1000, 1500, f2v1Temp + 1, f2v1Temp + 2), f2v1Temp + 3)
        : up(f2v1Temp + 2, f2v1Temp + 3);
  if (flapsIndex >= 3) {
    return { vref, vapp: flapsIndex === 3 ? vref : vref - 3 };
  }
  const v1 = flapsIndex === 0 ? f0v1 : flapsIndex === 2 ? f2v1 : (f0v1 + f2v1) / 2;
  const v2 = flapsIndex === 0 ? f0v2 : flapsIndex === 2 ? f2v2 : (f0v2 + f2v2) / 2;
  return { vref, v1, vr: (v1 + v2) / 2, v2, v3: v2 + (flapsIndex === 0 ? 4 : 5), vapp: flapsIndex === 0 ? 110 : flapsIndex === 2 ? 100 : 105 };
}

// ---------------------------------------------------------------------------------------------------------------------------------- fuel trim charts

/**
 * The booklet's FUEL TRIM POSITION charts (engine start, take-off): straight, parallel lines of equal trim over outside air temperature and pressure
 * altitude. Read off the booklet page: a line drops 2.5 °C per 1,000 ft; at sea level the engine start chart runs from 0 % at 31.1 °C down to 50 % at
 * 3.9 °C, the take-off chart from 45 % at 44.3 °C down to 100 % at 14.9 °C.
 */
export const FUEL_TRIM_CHARTS = {
  start: { trimAtSeaLevel: [0, 50], oatAtSeaLevel: [31.14, 3.92], oatAxis: [-5, 32], zpAxis: [0, 2000] },
  takeOff: { trimAtSeaLevel: [45, 100], oatAtSeaLevel: [44.26, 14.94], oatAxis: [8, 45], zpAxis: [0, 2000] },
  lapsePer1000Ft: 2.5,
} as const;

/**
 * Fuel trim (%) a chart gives for a temperature and a pressure altitude (not clamped to the chart's lines: the caller decides).
 * @param chart Which chart.
 * @param oatC Outside air temperature, °C.
 * @param zpFt Pressure altitude, ft.
 */
export function fuelTrimPercent(chart: 'start' | 'takeOff', oatC: number, zpFt: number): number {
  const c = FUEL_TRIM_CHARTS[chart];
  const seaLevelOat = oatC + (FUEL_TRIM_CHARTS.lapsePer1000Ft * zpFt) / 1000;
  return lin(seaLevelOat, c.oatAtSeaLevel[0], c.oatAtSeaLevel[1], c.trimAtSeaLevel[0], c.trimAtSeaLevel[1]);
}

// ---------------------------------------------------------------------------------------------------------------------------------- limitations

/** The booklets' limitation pages, as figures (the page lays them out). */
export const LIMITS = {
  speeds: { vneLow: 254, vneHigh: 234, vmoLow: 223, vmoHigh: 200, vmoChangeFt: 20000, vloVle: 168, vfe: [[40, 144], [26.5, 157], [16.5, 167]], vbMax: 179, vbEmpty: 161 },
  engines: { startTgt: 960, takeOffRpm: 15000, takeOffTgtDry: 810, takeOffTgtWet: 860, wetMinutes: 5, climbCruiseRpm: 14200, climbCruiseTgt: 730 },
  general: {
    mtowKg: 19730, mtowLb: 43500, mlwKg: 18600, mlwLb: 41000, mzfwKg: 17450, mzfwLb: 38470, terrainMinFt: -1000, terrainMaxFt: 9000, slopePct: 2,
    oatMin: -49, oatMax: 50, tailwindKt: 10, crosswindDryKt: 30, crosswindWetKt: 22, maxCruiseFt: 25000, maxDiffPressFt: 20000, cabinFt: 8000,
  },
} as const;
