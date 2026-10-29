/**
 * What the tablet reads from and writes to the simulator. In the sim it is the SimVar API and the sim's data store (realSim); the
 * browser preview (tablet-preview\) passes a fake one, so the whole app can be designed and checked outside the sim.
 */
export interface SimBridge {
  /** Reads a numeric SimVar / L:var / E:var. */
  get(name: string, unit: string): number;
  /** Reads a string SimVar. */
  getString(name: string): string;
  /** Writes an L:var or triggers a K: event. */
  set(name: string, unit: string, value: number): void;
  /** Reads a persisted tablet setting (null when never saved). */
  load(key: string): string | null;
  /** Persists a tablet setting across flights. */
  save(key: string, value: string): void;
}

// from /JS/dataStorage.js, which the tablet's html loads
declare function GetStoredData(key: string): string;
declare function SetStoredData(key: string, value: string): void;

/** The simulator itself. */
export const realSim: SimBridge = {
  get: (name, unit) => SimVar.GetSimVarValue(name, unit),
  getString: (name) => SimVar.GetSimVarValue(name, 'string'),
  set: (name, unit, value) => { SimVar.SetSimVarValue(name, unit, value); },
  load: (key) => { const v = GetStoredData(key); return v ? v : null; },
  save: (key, value) => SetStoredData(key, value),
};
