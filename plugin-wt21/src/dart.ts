/**
 * v10.6: the Rolls-Royce Dart RDa.7's limits on the F27, as the F27 maintenance training manual gives them (80.20 "Limitations": engine
 * power limits, lubrication, fuel, water/methanol, propeller, internal battery starting and starter; 77.00 for the low oil pressure
 * warning; 61.00 for auto-feathering). Shared by the MFD's engine band (F27Eis) and the tablet (Systems app, Limitations page).
 */
export const DART = {
  /** Ground idling: 7,000 rpm (± 500), TGT 550 °C at most; continuous ground running below it is to be avoided. */
  groundIdleRpm: 7000,
  /** Take-off: 15,000 rpm (+50, -0) for 5 minutes at most, TGT 940 °C wet (water/methanol), 910 °C dry. */
  takeOffRpm: 15000,
  takeOffRpmTolerance: 50,
  takeOffTgtWet: 940,
  takeOffTgtDry: 910,
  /** Starting or relighting: TGT 930 °C at most, momentary. */
  startTgt: 930,
  /** Up to 1,000 °C is permissible for a few seconds above 940 °C (every exceedance is reported in the engine log). */
  tgtAbsolute: 1000,
  /** Other conditions: from this rpm on (highest band first), this TGT at most (°C). */
  tgtBands: [[14000, 800], [13000, 760], [10400, 730], [0, 550]] as readonly (readonly [number, number])[],
  /** Overspeed: 17,000 rpm, 20 s at most. */
  overspeedRpm: 17000,
  /** No ground running or taxiing between these. */
  groundAvoidRpm: [13000, 13400] as const,
  /** The low oil pressure warning lights below 5 to 6 psi. */
  oilLowPsi: 6,
  /** Oil temperature: -30 °C at least to start, -15 °C to open up, +50 °C for wet take-off power, +120 °C at most. */
  oilStartC: -30,
  oilOpenUpC: -15,
  oilWetTakeOffC: 50,
  oilMaxC: 120,
  /** Torquemeter 0 to 600 psi; with the power lever at take-off the propeller auto-feathers when the torque falls to 50 psi. */
  torqueGaugePsi: 600,
  autoFeatherPsi: 50,
  /** Asymmetric fuel load between the wing tanks in flight: 1,100 lb at most. */
  fuelAsymmetryLb: 1100,
  /** Water/methanol: not to be selected above 14,500 rpm (except in an emergency; it flows on at take-off); a 150 litre tank in each nacelle. */
  wmMaxRpm: 14500,
  wmTankL: 150,
  /** The feathering pumps: 3 minutes per hour at most. */
  featherMinPerHour: 3,
  /** Starter: 30 s at most; 6 consecutive starts or motoring cycles on external power, 4 on the batteries, then 15 minutes' rest. */
  starterMaxS: 30,
  starterCyclesExt: 6,
  starterCyclesBatt: 4,
  starterRestMin: 15,
  /** Starting on the aircraft's batteries: OAT above -10 °C, 24 V at least. */
  batteryStartOatC: -10,
  batteryStartV: 24,
};

/** The highest TGT outside take-off and starting at an rpm (°C). */
export function tgtLimit(rpm: number): number {
  const band = DART.tgtBands.find(([from]) => rpm >= from);
  return band ? band[1] : 550;
}

/** The lowest acceptable oil pressure at 12,000 rpm and above (psi): 13.5 with the oil below 55 °C, down to 12 at 120 °C. */
export function minOilPsi(oilC: number): number {
  return oilC <= 55 ? 13.5 : 13.5 - 1.5 * Math.min(1, (oilC - 55) / 65);
}

export type Level = 'ok' | 'amber' | 'red';

/** What an engine's colours depend on. */
export interface DartState {
  rpm: number;
  tgt: number;
  oilPsi: number;
  oilC: number;
  /** Burning fuel. */
  running: boolean;
  /** Starter engaged, or burning but not yet at ground idle (less its tolerance): the start's TGT limit applies. */
  starting: boolean;
  /** Water/methanol flowing (the take-off TGT limit is the wet one). */
  wet: boolean;
  onGround: boolean;
}

/** Overspeed beyond the take-off tolerance is red; the ground resonance band amber while on the ground. */
export function rpmLevel(s: DartState): Level {
  if (s.rpm > DART.takeOffRpm + DART.takeOffRpmTolerance) {
    return 'red';
  }
  return s.onGround && s.rpm >= DART.groundAvoidRpm[0] && s.rpm <= DART.groundAvoidRpm[1] ? 'amber' : 'ok';
}

/** The TGT's amber (above the limit for the rpm: the 5 minute take-off zone, or idle) and red (above take-off, or the start's) limits. */
export function tgtLimits(s: DartState): { amber: number; red: number } {
  if (s.starting) {
    return { amber: DART.startTgt, red: DART.startTgt };
  }
  return { amber: tgtLimit(s.rpm), red: s.wet ? DART.takeOffTgtWet : DART.takeOffTgtDry };
}

export function tgtLevel(s: DartState): Level {
  const l = tgtLimits(s);
  return s.tgt > l.red ? 'red' : s.tgt > l.amber ? 'amber' : 'ok';
}

/** Red below the warning light's pressure with the engine running; amber below the minimum from 12,000 rpm on. */
export function oilPressureLevel(s: DartState): Level {
  if (s.running && !s.starting && s.oilPsi < DART.oilLowPsi) {
    return 'red';
  }
  return s.rpm >= 12000 && s.oilPsi < minOilPsi(s.oilC) ? 'amber' : 'ok';
}

/** Red above the maximum; amber too cold for wet take-off power, or to open up. */
export function oilTempLevel(s: DartState): Level {
  if (s.oilC > DART.oilMaxC) {
    return 'red';
  }
  if (s.running && s.wet && s.oilC < DART.oilWetTakeOffC) {
    return 'amber';
  }
  return s.running && s.rpm > DART.groundIdleRpm + 500 && s.oilC < DART.oilOpenUpC ? 'amber' : 'ok';
}
