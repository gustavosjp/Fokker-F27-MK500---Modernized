import { ComponentProps, DisplayComponent, FSComponent, NodeReference, VNode } from '@microsoft/msfs-sdk';

import { DART, DartState, Level, oilPressureLevel, oilTempLevel, rpmLevel, tgtLevel } from './dart';

/**
 * EICAS page for the two Rolls-Royce Dart 532 turboprops of the Fokker F27-500: six digital rows (torque, TGT, rpm, fuel flow, oil
 * pressure, oil temperature), one column per engine, with a bar for each. It fills the full-width x 185 px band at the top of the WT21
 * MFD (#EngineInstruments, the same band the CJ4 uses for its own EIS). Every number comes straight from a simulator variable, polled
 * 10 times a second.
 *
 * v10.6: in the F27's own gauges' units and scales (the author's variables: torque 0-600 psi, rpm, TGT in °C) and coloured by the
 * Dart's limits from the F27 maintenance training manual (dart.ts): TGT amber above the limit for the rpm band and red above take-off
 * (or above the start's 930 °C), rpm red above take-off + 50 and amber in the 13,000-13,400 ground band, oil pressure red below the
 * warning light's 6 psi and amber below the 12,000 rpm minimum, oil temperature red above 120 °C.
 */

type EngineIndex = 1 | 2;

interface EisRow {
  /** Label shown in the centre column. */
  label: string;
  /** Unit shown under the label ('W' and 'W/H' for a weight / a flow in the tablet's unit, kg or lb). */
  unit: string;
  /** Value at the right end of the bar (for one engine / side). */
  max: number | ((engine: EngineIndex) => number);
  /** Reads the value for one engine (fuel page: 1 = left, 2 = right), weights in pounds. */
  read: (engine: EngineIndex) => number;
  /** The value's colour from the engine's state (always normal when absent). */
  level?: (s: DartState) => Level;
}

/** Reads a simulator variable, 0 when it is not available. */
function sim(name: string, unit: string): number {
  const v = SimVar.GetSimVarValue(name, unit);
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

declare function GetStoredData(key: string): string;
const LB_PER_KG = 2.20462;

/** v11.5: which page the band shows; the tablet's Settings write it (0 engines, 1 fuel). */
export const MFD_TOP_VAR = 'L:F27_MFD_TOP';
/** v11.6: the tablet's autothrottle mode, and how the band names it. */
const AT_MODE_VAR = 'L:F27_AT_MODE';
const AT_TEXT: Record<number, string> = { 1: 'A/T SPD', 2: 'A/T CLB', 3: 'A/T DES', 4: 'A/T DISC', 5: 'A/T TGT', 6: 'A/T MIN' };

/** Fuel in one wing's tank in pounds: 1 / 2 the left / right main tank, 3 / 4 the collectors (as the tablet's Systems page reads them). */
const tankLb = (n: number): number => sim(`FUELSYSTEM TANK QUANTITY:${n}`, 'gallons') * sim('FUEL WEIGHT PER GALLON', 'pounds');
const tankCapLb = (n: number): number => Math.max(1, sim(`FUELSYSTEM TANK CAPACITY:${n}`, 'gallons') * sim('FUEL WEIGHT PER GALLON', 'pounds'));

/** v11.5 (a user: the fuel gauges are "all the time hidden during the flight/cruise by the engines controls"): the fuel page. */
const FUEL_ROWS: readonly EisRow[] = [
  { label: 'MAIN', unit: 'W', max: (n) => tankCapLb(n), read: (n) => tankLb(n) },
  { label: 'COLL', unit: 'W', max: (n) => tankCapLb(n + 2), read: (n) => tankLb(n + 2) },
  { label: 'FF', unit: 'W/H', max: 1500, read: (n) => sim(`ENG FUEL FLOW PPH:${n}`, 'pounds per hour') },
  { label: 'USED', unit: 'W', max: (n) => tankCapLb(n) + tankCapLb(n + 2), read: (n) => sim(`GENERAL ENG FUEL USED SINCE START:${n}`, 'pounds') },
];

const ROWS: readonly EisRow[] = [
  { label: 'TRQ', unit: 'PSI', max: DART.torqueGaugePsi, read: (n) => sim(`L:f275_xengtorq_${n}_ind`, 'number') },
  { label: 'TGT', unit: '°C', max: DART.tgtAbsolute, read: (n) => sim(`L:f275_dart_egt_0${n}_ind`, 'number'), level: tgtLevel },
  { label: 'RPM', unit: '', max: 16000, read: (n) => sim(`L:f275_RpmF27_0${n}`, 'number'), level: rpmLevel },
  { label: 'FF', unit: 'PPH', max: 1500, read: (n) => sim(`ENG FUEL FLOW PPH:${n}`, 'pounds per hour') },
  { label: 'OIL P', unit: 'PSI', max: 40, read: (n) => sim(`ENG OIL PRESSURE:${n}`, 'psi'), level: oilPressureLevel },
  { label: 'OIL T', unit: '°C', max: 150, read: (n) => sim(`ENG OIL TEMPERATURE:${n}`, 'celsius'), level: oilTempLevel },
];

/** What one engine's colours depend on. */
function engineState(n: EngineIndex): DartState {
  const rpm = sim(`L:f275_RpmF27_0${n}`, 'number'), running = sim(`GENERAL ENG COMBUSTION:${n}`, 'bool') !== 0;
  return {
    rpm,
    tgt: sim(`L:f275_dart_egt_0${n}_ind`, 'number'),
    oilPsi: sim(`ENG OIL PRESSURE:${n}`, 'psi'),
    oilC: sim(`ENG OIL TEMPERATURE:${n}`, 'celsius'),
    running,
    starting: sim(`GENERAL ENG STARTER ACTIVE:${n}`, 'bool') !== 0 || (running && rpm < DART.groundIdleRpm - 500),
    wet: sim(`L:f275_W_WaterMeth0${n}`, 'bool') !== 0,
    onGround: sim('SIM ON GROUND', 'bool') !== 0,
  };
}

/** CSS of the page, embedded in the plugin script so nothing else has to be shipped. */
export const F27_EIS_CSS = `
.f27-eis {
  width: 100%;
  height: 185px;
  box-sizing: border-box;
  padding: 3px 14px 0 14px;
  background-color: var(--wt21-colors-black, black);
  color: var(--wt21-colors-white, white);
  font-family: var(--wt21-fonts-family-general, sans-serif);
  font-size: 20px;
  line-height: 1;
  border-bottom: 2px solid var(--wt21-colors-dark-gray, #999);
}
.f27-eis-head, .f27-eis-row {
  display: grid;
  grid-template-columns: 78px 1fr 92px 1fr 78px;
  align-items: center;
  column-gap: 10px;
}
.f27-eis-head { height: 21px; color: var(--wt21-colors-cyan, cyan); }
/* v11.5: every head cell on row 1 (the centre one shares columns with the sides, and auto-placement put it on a second row, over the fuel rows) */
.f27-eis-head > div { grid-row: 1; }
.f27-eis-head .l { grid-column: 1 / 3; text-align: left; }
.f27-eis-head .r { grid-column: 4 / 6; text-align: right; }
.f27-eis-head .c { grid-column: 2 / 5; text-align: center; color: var(--wt21-colors-white, white); }
.f27-eis-head .c.on { color: var(--wt21-colors-green, #49e700); }
.f27-eis-head .c.amber { color: var(--wt21-colors-amber, orange); }
.f27-eis-row { height: 26px; }
/* v11.5 (test: the fuel labels ran into each other): the fuel page has 4 rows, so each has room for its label and unit */
.f27-eis-row.tall { height: 37px; }
/* the engine page has 6 rows of 26 px: its unit goes beside the label (below, it ran into the next row) */
.f27-eis-row:not(.tall) .f27-eis-label small { display: inline; margin: 0 0 0 4px; }
.f27-eis-num { text-align: right; }
.f27-eis-num.ok { color: var(--wt21-colors-green, #49e700); }
.f27-eis-num.amber { color: var(--wt21-colors-amber, orange); }
.f27-eis-num.red { color: var(--wt21-colors-red, red); }
.f27-eis-label { text-align: center; }
.f27-eis-label small { display: block; font-size: 13px; color: var(--wt21-colors-gray, #b3b3b3); margin-top: 1px; }
.f27-eis-bar { position: relative; height: 12px; border: 1px solid var(--wt21-colors-dark-gray, #999); }
.f27-eis-bar > div { position: absolute; left: 0; top: 0; bottom: 0; width: 0; }
.f27-eis-bar.r > div { left: auto; right: 0; }
.f27-eis-bar > div.ok { background-color: var(--wt21-colors-green, #49e700); }
.f27-eis-bar > div.amber { background-color: var(--wt21-colors-amber, orange); }
.f27-eis-bar > div.red { background-color: var(--wt21-colors-red, red); }
`;

/** Injects the page CSS once. */
export function injectEisCss(): void {
  const id = 'f27-eis-css';
  if (document.getElementById(id)) { return; }
  const tag = document.createElement('style');
  tag.id = id;
  tag.textContent = F27_EIS_CSS;
  document.head.append(tag);
}

/** Refs to the DOM elements of one engine's cell in a row. */
interface Cell {
  num: NodeReference<HTMLDivElement>;
  fill: NodeReference<HTMLDivElement>;
}

const newCells = (rows: readonly EisRow[]): Cell[][] => rows.map(() => [
  { num: FSComponent.createRef<HTMLDivElement>(), fill: FSComponent.createRef<HTMLDivElement>() },
  { num: FSComponent.createRef<HTMLDivElement>(), fill: FSComponent.createRef<HTMLDivElement>() },
]);

/** The Dart engine indication page, and (v11.5) the fuel page in its place when the tablet asks for it. */
export class F27Eis extends DisplayComponent<ComponentProps> {
  private readonly cells = newCells(ROWS);
  private readonly fuelCells = newCells(FUEL_ROWS);
  private readonly units: NodeReference<HTMLElement>[] = FUEL_ROWS.map(() => FSComponent.createRef<HTMLElement>());
  private readonly engBlock = FSComponent.createRef<HTMLDivElement>();
  private readonly fuelBlock = FSComponent.createRef<HTMLDivElement>();
  private readonly headL = FSComponent.createRef<HTMLDivElement>();
  private readonly headR = FSComponent.createRef<HTMLDivElement>();
  private readonly headC = FSComponent.createRef<HTMLDivElement>();

  private timer = -1;
  private ticks = 0;
  private kg = false;

  /** @inheritdoc */
  public onAfterRender(): void {
    this.update();
    this.timer = window.setInterval(() => this.update(), 100);
  }

  /** Reads every value and writes it to the page. */
  private update(): void {
    const fuel = sim(MFD_TOP_VAR, 'number') === 1;
    if (this.ticks++ % 10 === 0) {
      try { this.kg = typeof GetStoredData === 'function' && GetStoredData('F27TAB_units') !== 'lb'; } catch { this.kg = true; }
    }
    this.engBlock.instance.style.display = fuel ? 'none' : '';
    this.fuelBlock.instance.style.display = fuel ? '' : 'none';
    this.headL.instance.textContent = fuel ? 'FUEL L' : 'ENG 1';
    this.headR.instance.textContent = fuel ? 'FUEL R' : 'ENG 2';
    const w = (lb: number): number => (this.kg ? lb / LB_PER_KG : lb);
    // v11.6: the tablet's autothrottle mode (L:F27_AT_MODE: 1 SPD, 2 CLB, 3 DES, 4 disconnected, 5 held back by the TGT or torque limit, 6 holding the minimum speed), beside the fuel
    // total on the fuel page
    const at = AT_TEXT[sim(AT_MODE_VAR, 'number')] ?? '';
    const total = fuel ? `${Math.round(w(sim('FUEL TOTAL QUANTITY WEIGHT', 'pounds')))} ${this.kg ? 'KG' : 'LB'}` : '';
    this.headC.instance.textContent = [at, total].filter((t) => t).join('  ');
    this.headC.instance.className = sim(AT_MODE_VAR, 'number') >= 4 ? 'c amber' : at ? 'c on' : 'c';
    if (fuel) {
      FUEL_ROWS.forEach((row, r) => {
        this.units[r].instance.textContent = row.unit === 'W/H' ? (this.kg ? 'KG/H' : 'PPH') : (this.kg ? 'KG' : 'LB');
      });
    }
    const rows = fuel ? FUEL_ROWS : ROWS;
    const cells = fuel ? this.fuelCells : this.cells;
    ([1, 2] as EngineIndex[]).forEach((engine, e) => {
      const state = engineState(engine);
      rows.forEach((row, r) => {
        const raw = row.read(engine);
        const max = typeof row.max === 'number' ? row.max : row.max(engine);
        const lv = row.level ? row.level(state) : 'ok';
        const cell = cells[r][e];
        const num = cell.num.getOrDefault();
        const fill = cell.fill.getOrDefault();
        if (num) {
          num.textContent = Math.round(fuel ? w(raw) : raw).toString();
          num.className = `f27-eis-num ${lv}`;
        }
        if (fill) {
          fill.style.width = `${Math.max(0, Math.min(1, raw / max)) * 100}%`;
          fill.className = lv;
        }
      });
    });
  }

  /** @inheritdoc */
  public destroy(): void {
    if (this.timer >= 0) { window.clearInterval(this.timer); }
    super.destroy();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="f27-eis">
        <div class="f27-eis-head"><div class="l" ref={this.headL}>ENG 1</div><div class="c" ref={this.headC} /><div class="r" ref={this.headR}>ENG 2</div></div>
        <div ref={this.engBlock}>
          {ROWS.map((row, r) => (
            <div class="f27-eis-row">
              <div class="f27-eis-num" ref={this.cells[r][0].num} />
              <div class="f27-eis-bar"><div ref={this.cells[r][0].fill} /></div>
              <div class="f27-eis-label">{row.label}<small>{row.unit}</small></div>
              <div class="f27-eis-bar r"><div ref={this.cells[r][1].fill} /></div>
              <div class="f27-eis-num" ref={this.cells[r][1].num} />
            </div>
          ))}
        </div>
        <div ref={this.fuelBlock} style="display: none">
          {FUEL_ROWS.map((row, r) => (
            <div class="f27-eis-row tall">
              <div class="f27-eis-num" ref={this.fuelCells[r][0].num} />
              <div class="f27-eis-bar"><div ref={this.fuelCells[r][0].fill} /></div>
              <div class="f27-eis-label">{row.label}<small ref={this.units[r]}>{row.unit}</small></div>
              <div class="f27-eis-bar r"><div ref={this.fuelCells[r][1].fill} /></div>
              <div class="f27-eis-num" ref={this.fuelCells[r][1].num} />
            </div>
          ))}
        </div>
      </div>
    );
  }
}
