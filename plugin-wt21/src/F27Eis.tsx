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
  /** Unit shown under the label. */
  unit: string;
  /** Value at the right end of the bar. */
  max: number;
  /** Reads the value for one engine. */
  read: (engine: EngineIndex) => number;
  /** The value's colour from the engine's state (always normal when absent). */
  level?: (s: DartState) => Level;
}

/** Reads a simulator variable, 0 when it is not available. */
function sim(name: string, unit: string): number {
  const v = SimVar.GetSimVarValue(name, unit);
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

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
.f27-eis-head .l { grid-column: 1 / 3; text-align: left; }
.f27-eis-head .r { grid-column: 4 / 6; text-align: right; }
.f27-eis-row { height: 26px; }
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

/** The Dart engine indication page. */
export class F27Eis extends DisplayComponent<ComponentProps> {
  private readonly cells: Cell[][] = ROWS.map(() => [
    { num: FSComponent.createRef<HTMLDivElement>(), fill: FSComponent.createRef<HTMLDivElement>() },
    { num: FSComponent.createRef<HTMLDivElement>(), fill: FSComponent.createRef<HTMLDivElement>() },
  ]);

  private timer = -1;

  /** @inheritdoc */
  public onAfterRender(): void {
    this.update();
    this.timer = window.setInterval(() => this.update(), 100);
  }

  /** Reads every value and writes it to the page. */
  private update(): void {
    ([1, 2] as EngineIndex[]).forEach((engine, e) => {
      const state = engineState(engine);
      ROWS.forEach((row, r) => {
        const value = row.read(engine);
        const lv = row.level ? row.level(state) : 'ok';
        const cell = this.cells[r][e];
        const num = cell.num.getOrDefault();
        const fill = cell.fill.getOrDefault();
        if (num) {
          num.textContent = Math.round(value).toString();
          num.className = `f27-eis-num ${lv}`;
        }
        if (fill) {
          fill.style.width = `${Math.max(0, Math.min(1, value / row.max)) * 100}%`;
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
        <div class="f27-eis-head"><div class="l">ENG 1</div><div class="r">ENG 2</div></div>
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
    );
  }
}
