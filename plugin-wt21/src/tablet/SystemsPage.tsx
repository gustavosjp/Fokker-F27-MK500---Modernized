import { DisplayComponent, FSComponent, MappedSubject, NodeReference, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { DART, Level, minOilPsi, oilPressureLevel, oilTempLevel, rpmLevel, tgtLevel, tgtLimits } from '../dart';
import { Lang, StringKey } from './i18n';
import { TabletModel } from './model';
import { AirReadings, CABIN_DIFF, dartState, EngineReadings, PNEUMATIC } from './systems';
import { AppId, onTap, TabletProps } from './ui';

type SysTab = 'engines' | 'fuel' | 'elec' | 'air';
const TABS: { id: SysTab; key: StringKey }[] = [
  { id: 'engines', key: 'sysEngines' }, { id: 'fuel', key: 'sysFuel' }, { id: 'elec', key: 'sysElec' }, { id: 'air', key: 'sysAir' },
];

/** A coloured stretch of a gauge's scale, in the gauge's units. */
interface Zone {
  from: number;
  to: number;
  cls: 'green' | 'amber' | 'red';
}
const MAX_ZONES = 4;

/** A horizontal gauge: its name and unit, the value in its level's colour, a bar over the coloured zones of its scale. */
interface Gauge {
  name: string | Subscribable<string>;
  unit: string | Subscribable<string>;
  min: number;
  max: number;
  value: Subscribable<number>;
  text: Subscribable<string>;
  level?: Subscribable<Level>;
  zones?: Zone[] | Subscribable<Zone[]>;
  /** Where the bar starts (a rate's zero); the scale's minimum by default. */
  origin?: number;
  /** Marks on the scale: value, label. */
  ticks?: [number, string][];
  /** The bar's colour while normal (default white). */
  fill?: string;
}

/** An integer with the language's thousands separator. */
const int = (v: number, lang: Lang): string => TabletModel.weight(v, 'lb', lang);
/** The author's AC voltmeter shows the 115 V buses (28 V-based in the sim) as 4.4 times their voltage. */
const AC_SCALE = 4.4;

/** Draws a gauge (see Gauge). */
function gauge(g: Gauge): VNode {
  const pct = (v: number): number => Math.max(0, Math.min(100, ((v - g.min) / (g.max - g.min)) * 100));
  const zones = g.zones === undefined ? Subject.create<Zone[]>([]) : Array.isArray(g.zones) ? Subject.create(g.zones) : g.zones;
  const level = g.level ?? Subject.create<Level>('ok');
  const o = pct(g.origin ?? g.min);
  return (
    <div class="gauge">
      <div class="g-name"><span>{g.name}</span><small>{g.unit}</small></div>
      <div class={level.map((l) => `g-val ${l}`)}>{g.text}</div>
      <div class="g-track">
        {Array.from({ length: MAX_ZONES }, (_, i) => (
          <div class={zones.map((z) => `g-zone ${z[i] ? z[i].cls : ''}`)}
            style={zones.map((z) => (z[i] ? `left: ${pct(z[i].from)}%; width: ${pct(z[i].to) - pct(z[i].from)}%;` : 'display: none;'))} />
        ))}
        <div class={level.map((l) => `g-fill ${l === 'ok' ? g.fill ?? '' : l}`)}
          style={g.value.map((v) => `left: ${Math.min(o, pct(v))}%; width: ${Math.abs(pct(v) - o)}%;`)} />
        {(g.ticks ?? []).map(([v, label]) => <div class="g-tick" style={`left: ${pct(v)}%;`}><span>{label}</span></div>)}
      </div>
    </div>
  );
}

/**
 * Systems (v10.6, the manual items left from v10.5): the engines with the Dart's limits, the fuel system, the electrical system, the
 * pressurisation and pneumatics, drawn from the aircraft's own variables (the author's gauges and the sim's systems) and coloured by
 * the limits of the F27 maintenance training manual. The aircraft is read for it only while it is open.
 */
export class SystemsPage extends DisplayComponent<TabletProps & { open: (app: AppId) => void; shown: Subscribable<boolean> }> {
  private readonly tab = Subject.create<SysTab>('engines');
  private readonly tabRefs: { id: SysTab; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly refuelRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public render(): VNode {
    const { i18n } = this.props;
    const body = (id: SysTab, content: VNode): VNode => <div class={{ 'sys-body': true, hidden: this.tab.map((t) => t !== id) }}>{content}</div>;
    return (
      <div class="systems">
        <div class="segmented sys-tabs">
          {TABS.map((t) => {
            const ref = FSComponent.createRef<HTMLDivElement>();
            this.tabRefs.push({ id: t.id, ref });
            return <div ref={ref} class={{ opt: true, active: this.tab.map((x) => x === t.id) }}>{i18n.t(t.key)}</div>;
          })}
        </div>
        {body('engines', <div class="sys-engines">{this.engineCard(0)}{this.engineCard(1)}</div>)}
        {body('fuel', this.fuelTab())}
        {body('elec', this.elecTab())}
        {body('air', this.airTab())}
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    for (const { id, ref } of this.tabRefs) {
      onTap(ref.instance, () => this.tab.set(id));
    }
    onTap(this.refuelRef.instance, () => this.props.open('weights'));
    this.props.shown.sub((v) => { this.props.model.systemsShown = v; }, true);
  }

  /** One engine: rpm, TGT, torque, fuel flow, oil pressure and temperature, water/methanol, each against the Dart's limits. */
  private engineCard(i: 0 | 1): VNode {
    const { model: m, i18n } = this.props;
    const e = m.systems.map((s) => s.engines[i]);
    const st = m.systems.map((s) => dartState(s.engines[i], s.onGround));
    const num = (f: (x: EngineReadings) => number): Subscribable<number> => e.map(f);
    const txt = (v: Subscribable<number>): Subscribable<string> => MappedSubject.create(([x, l]) => int(x, l), v, m.lang);
    const flag = (label: string, on: Subscribable<boolean>, cls: string): VNode => <div class={{ eflag: true, [cls]: true, on }}>{label}</div>;
    const rpm = num((x) => x.rpm), tgt = num((x) => x.tgt), torque = num((x) => x.torquePsi), ff = num((x) => x.fuelFlowLbH);
    const oilP = num((x) => x.oilPsi), oilT = num((x) => x.oilC), wm = num((x) => x.wmLitres);
    const onGround = m.systems.map((s) => s.onGround);
    const tgtNote = MappedSubject.create(([s]) => {
      if (s.starting) {
        return i18n.now('sysTgtStart');
      }
      return `${i18n.now('sysTgtLimit')}: ${tgtLimits(s).amber} °C · ${i18n.now('sysTakeOff')}`;
    }, st, m.lang);
    return (
      <div class="card eng">
        <div class="eng-head">
          <span class="eng-title">{i18n.t('engine').map((t) => `${t} ${i + 1}`)}</span>
          <div class="eflags">
            {flag('RUN', e.map((x) => x.running), 'run')}
            {flag('START', e.map((x) => x.starter), 'start')}
            {flag('FEATHER', e.map((x) => x.featherPump), 'feather')}
            {flag('W/M', e.map((x) => x.wmFlow), 'wm')}
          </div>
        </div>
        {gauge({
          name: 'RPM', unit: 'rpm', min: 0, max: DART.overspeedRpm, value: rpm, text: txt(rpm), level: st.map(rpmLevel),
          zones: onGround.map((g): Zone[] => [
            { from: DART.groundIdleRpm - 500, to: DART.takeOffRpm + DART.takeOffRpmTolerance, cls: 'green' },
            ...(g ? [{ from: DART.groundAvoidRpm[0], to: DART.groundAvoidRpm[1], cls: 'amber' as const }] : []),
            { from: DART.takeOffRpm + DART.takeOffRpmTolerance, to: DART.overspeedRpm, cls: 'red' },
          ]),
          ticks: [[DART.groundIdleRpm, 'IDLE'], [DART.takeOffRpm, 'T/O']],
        })}
        {gauge({
          name: 'TGT', unit: '°C', min: 0, max: DART.tgtAbsolute, value: tgt, text: txt(tgt), level: st.map(tgtLevel),
          zones: st.map((s): Zone[] => {
            const l = tgtLimits(s);
            return [{ from: 0, to: l.amber, cls: 'green' }, { from: l.amber, to: l.red, cls: 'amber' }, { from: l.red, to: DART.tgtAbsolute, cls: 'red' }];
          }),
        })}
        {gauge({ name: 'TORQUE', unit: 'psi', min: 0, max: DART.torqueGaugePsi, value: torque, text: txt(torque) })}
        {gauge({
          name: 'FUEL FLOW', unit: m.units.map((u) => `${u}/h`), min: 0, max: 1500, value: ff,
          text: MappedSubject.create(([v, u, l]) => TabletModel.weight(v, u, l), ff, m.units, m.lang),
        })}
        {gauge({
          name: 'OIL PRESS', unit: 'psi', min: 0, max: 40, value: oilP, text: txt(oilP), level: st.map(oilPressureLevel),
          zones: st.map((s): Zone[] => {
            const min = s.rpm >= 12000 ? minOilPsi(s.oilC) : DART.oilLowPsi;
            return [{ from: 0, to: DART.oilLowPsi, cls: 'red' }, { from: DART.oilLowPsi, to: min, cls: 'amber' }, { from: min, to: 40, cls: 'green' }];
          }),
        })}
        {gauge({
          name: 'OIL TEMP', unit: '°C', min: -30, max: 150, value: oilT, text: txt(oilT), level: st.map(oilTempLevel),
          zones: st.map((s): Zone[] => [
            { from: -30, to: s.wet ? DART.oilWetTakeOffC : DART.oilOpenUpC, cls: 'amber' },
            { from: s.wet ? DART.oilWetTakeOffC : DART.oilOpenUpC, to: DART.oilMaxC, cls: 'green' },
            { from: DART.oilMaxC, to: 150, cls: 'red' },
          ]),
        })}
        {gauge({ name: 'W/M', unit: 'L', min: 0, max: DART.wmTankL, value: wm, text: txt(wm), fill: 'cyan' })}
        <div class="eng-note">{tgtNote}</div>
      </div>
    );
  }

  /** The fuel system as the author built it (see FuelReadings), and the totals. */
  private fuelTab(): VNode {
    const { model: m, i18n } = this.props;
    const f = m.systems.map((s) => s.fuel);
    const weight = (lb: Subscribable<number>): Subscribable<string> => MappedSubject.create(([v, u, l]) => TabletModel.weight(v, u, l), lb, m.units, m.lang);
    const and = (a: Subscribable<boolean>, b: Subscribable<boolean>): Subscribable<boolean> => MappedSubject.create(([x, y]) => x && y, a, b);
    const line = (d: string, live: Subscribable<boolean>): VNode => <path class={live.map((l) => (l ? 'fs-line live' : 'fs-line'))} d={d} />;
    const valve = (x: number, y: number, vertical: boolean, open: Subscribable<boolean>): VNode => (
      <g class={open.map((o) => (o ? 'fs-valve open' : 'fs-valve shut'))}>
        <circle cx={x} cy={y} r={15} />
        <path d={open.map((o) => (o === vertical ? `M${x} ${y - 10}V${y + 10}` : `M${x - 10} ${y}H${x + 10}`))} />
      </g>
    );
    const pump = (x: number, y: number, on: Subscribable<boolean>, warn: Subscribable<boolean>): VNode => (
      <g class={MappedSubject.create(([o, w]) => `fs-pump${o ? ' on' : ''}${w ? ' warn' : ''}`, on, warn)}>
        <circle cx={x} cy={y} r={17} />
        <path d={`M${x - 8} ${y + 6}L${x} ${y - 9}L${x + 8} ${y + 6}Z`} />
      </g>
    );
    // one side of the diagram, centred on cx (outer: the side away from the middle, for the labels)
    const side = (i: 0 | 1): VNode => {
      const cx = i === 0 ? 205 : 615, out = i === 0 ? -1 : 1, anchor = i === 0 ? 'end' : 'start';
      const main = f.map((x) => x.mainLb[i]), cap = f.map((x) => x.mainCapLb[i]), coll = f.map((x) => x.collectorLb[i]);
      const level = MappedSubject.create(([v, c]) => Math.max(0, Math.min(1, v / c)) * 108, main, cap);
      const tankLive = main.map((v) => v > 1), isol = f.map((x) => x.valveOpen[i]);
      const collLive = coll.map((v) => v > 0.5);
      const p = [0, 1].map((k) => f.map((x) => x.pumpOn[2 * i + k]));
      const pw = [0, 1].map((k) => f.map((x) => x.pumpWarn[2 * i + k]));
      const lpLive = f.map((x) => x.lpPsi[i] > 2), lpCock = f.map((x) => x.valveOpen[2 + i]);
      const hpPump = f.map((x) => x.hpPump[i]), hpCock = f.map((x) => x.valveOpen[4 + i]);
      return (
        <g>
          <rect class="fs-tank" x={cx - 115} y={18} width={230} height={112} rx={10} />
          <rect class="fs-level" x={cx - 113} width={226} y={level.map((h) => 128 - h)} height={level} />
          <text class="fs-name" x={cx} y={42} text-anchor="middle">{i18n.t(i === 0 ? 'fsLeftMain' : 'fsRightMain')}</text>
          <text class="fs-qty" x={cx} y={86} text-anchor="middle">{weight(main)}</text>
          <text class="fs-unit" x={cx} y={112} text-anchor="middle">{m.units}</text>
          {line(`M${cx} 130V152`, tankLive)}
          {valve(cx, 167, true, isol)}
          <text class="fs-tag" x={cx + out * 24} y={172} text-anchor={anchor}>ISOL</text>
          {line(`M${cx} 182V204`, and(tankLive, isol))}
          <rect class="fs-tank" x={cx - 80} y={204} width={160} height={58} rx={8} />
          <text class="fs-name small" x={cx} y={226} text-anchor="middle">{i18n.t('fsCollector')}</text>
          <text class="fs-qty small" x={cx} y={252} text-anchor="middle">{MappedSubject.create(([v, u, l]) => `${TabletModel.weight(v, u, l)} ${u}`, coll, m.units, m.lang)}</text>
          {[0, 1].map((k) => {
            const x = cx + (k === 0 ? -32 : 32);
            return (
              <g>
                {line(`M${x} 262V283`, collLive)}
                {pump(x, 300, p[k], pw[k])}
                {line(`M${x} 317V340H${cx}`, p[k])}
                <text class="fs-tag" x={x + (k === 0 ? -24 : 24)} y={305} text-anchor={k === 0 ? 'end' : 'start'}>{`${k + 1}`}</text>
              </g>
            );
          })}
          {line(`M${cx} 340V395`, lpLive)}
          <text class="fs-tag" x={cx + out * 14} y={378} text-anchor={anchor}>
            {MappedSubject.create(([x, l]) => `${i18n.now('fsLpShort')} ${int(x.lpPsi[i], l)} psi`, f, m.lang)}
          </text>
          {valve(cx, 410, true, lpCock)}
          <text class="fs-tag" x={cx + out * 24} y={415} text-anchor={anchor}>LP</text>
          {line(`M${cx} 425V444`, and(lpLive, lpCock))}
          {pump(cx, 461, hpPump, Subject.create(false))}
          <text class="fs-tag" x={cx + out * 26} y={466} text-anchor={anchor}>HP</text>
          {line(`M${cx} 478V501`, hpPump)}
          {valve(cx, 516, true, hpCock)}
          <text class="fs-tag" x={cx + out * 24} y={521} text-anchor={anchor}>HP</text>
          {line(`M${cx} 531V546`, and(hpPump, hpCock))}
          <rect class={hpCock.map((o) => (o ? 'fs-eng on' : 'fs-eng'))} x={cx - 80} y={546} width={160} height={58} rx={8} />
          <text class="fs-name small" x={cx} y={568} text-anchor="middle">{i18n.t('engine').map((t) => `${t.toUpperCase()} ${i + 1}`)}</text>
          <text class="fs-qty small" x={cx} y={594} text-anchor="middle">
            {MappedSubject.create(([x, u, l]) => `${TabletModel.weight(x.fuelFlowLbH[i], u, l)} ${u}/h`, f, m.units, m.lang)}
          </text>
        </g>
      );
    };
    const xL = f.map((x) => x.valveOpen[6]), xR = f.map((x) => x.valveOpen[7]);
    const lpAny = f.map((x) => x.lpPsi[0] > 2 || x.lpPsi[1] > 2);
    const sideLb = (i: 0 | 1): Subscribable<number> => f.map((x) => x.mainLb[i] + x.collectorLb[i]);
    const total = f.map((x) => x.mainLb[0] + x.mainLb[1] + x.collectorLb[0] + x.collectorLb[1]);
    const imbalance = f.map((x) => Math.abs(x.mainLb[0] + x.collectorLb[0] - x.mainLb[1] - x.collectorLb[1]));
    const kv = (label: Subscribable<string>, value: Subscribable<string>, warn?: Subscribable<boolean>): VNode => (
      <div class={{ kv: true, warn: warn ?? false }}><span>{label}</span><b>{value}</b></div>
    );
    const onOff = (v: boolean): string => i18n.now(v ? 'on' : 'off');
    return (
      <div class="fuelsys">
        <svg class="fs-plan" viewBox="0 0 820 610">
          {side(0)}{side(1)}
          {line('M205 352H330', and(lpAny, xL))}
          {valve(345, 352, false, xL)}
          {line('M360 352H460', MappedSubject.create(([a, b, l]) => a && b && l, xL, xR, lpAny))}
          {valve(475, 352, false, xR)}
          {line('M490 352H615', and(lpAny, xR))}
          <text class="fs-tag" x={410} y={336} text-anchor="middle">{i18n.t('fsXfeed')}</text>
        </svg>
        <div class="fs-side">
          <div class="card fs-card">
            <div class="card-title">{i18n.t('sysFuel')}</div>
            {kv(i18n.t('fsTotal'), weight(total))}
            {kv(i18n.t('left'), weight(sideLb(0)))}
            {kv(i18n.t('right'), weight(sideLb(1)))}
            {kv(i18n.t('fsImbalance'), weight(imbalance), imbalance.map((v) => v > DART.fuelAsymmetryLb))}
            <div class="fs-note">
              {MappedSubject.create(([u, l]) => `${i18n.now('fsMaxInFlight')}: ${TabletModel.weight(DART.fuelAsymmetryLb, u, l)} ${u}`, m.units, m.lang)}
            </div>
            <div class="fs-units">{m.units}</div>
          </div>
          <div class="card fs-card">
            {kv(i18n.t('fsLp'), MappedSubject.create(([x, l]) => `${int(x.lpPsi[0], l)} / ${int(x.lpPsi[1], l)} psi`, f, m.lang))}
            {kv(i18n.t('fsCrossfeed'), MappedSubject.create(([x]) => i18n.now(x.valveOpen[6] && x.valveOpen[7] ? 'open' : 'closed'), f, m.lang))}
            {kv(i18n.t('fsHeaters'), MappedSubject.create(([x]) => `1 ${onOff(x.heater[0])} · 2 ${onOff(x.heater[1])}`, f, m.lang))}
          </div>
          <div class="button primary" ref={this.refuelRef}>{i18n.t('goWeights')}</div>
          <div class="fs-note">{i18n.t('fsPumpsNote')}</div>
        </div>
      </div>
    );
  }

  /** The DC sources and buses as a diagram; the AC side and the de-icing alternators as tiles; the system's warning lights. */
  private elecTab(): VNode {
    const { model: m, i18n } = this.props;
    const el = m.systems.map((s) => s.elec);
    const live = (v: number): boolean => v > 20;
    const bus = (n: number): Subscribable<number> => el.map((x) => x.busV[n] ?? 0);
    const volts = (v: Subscribable<number>): Subscribable<string> => v.map((x) => (live(x) ? `${x.toFixed(1)} V` : 'OFF'));
    const line = (d: string, on: Subscribable<boolean>): VNode => <path class={on.map((l) => (l ? 'el-line live' : 'el-line'))} d={d} />;
    const box = (x: number, y: number, on: Subscribable<boolean>, name: string | Subscribable<string>, l1: Subscribable<string>, l2: Subscribable<string>): VNode => (
      <g class={on.map((o) => (o ? 'el-box on' : 'el-box'))}>
        <rect x={x} y={y} width={180} height={80} rx={10} />
        <text class="el-name" x={x + 90} y={y + 22} text-anchor="middle">{name}</text>
        <text class="el-v" x={x + 90} y={y + 50} text-anchor="middle">{l1}</text>
        <text class="el-sub" x={x + 90} y={y + 70} text-anchor="middle">{l2}</text>
      </g>
    );
    const amps = (v: number): string => `${Math.round(v)} A`;
    const gen = (i: 0 | 1): VNode => {
      const v = el.map((x) => x.genV[i]);
      return box(i === 0 ? 20 : 1024, 8, v.map(live), `GEN ${i + 1}`, volts(v), el.map((x) => (live(x.genV[i]) ? amps(x.genA[i]) : '')));
    };
    const batt = (i: 0 | 1): VNode => {
      const v = el.map((x) => x.battV[i]);
      const sub = MappedSubject.create(([x]) => {
        const a = x.battA[i];
        return `${a < -0.5 ? `${i18n.now('elCharging')} ${amps(-a)}` : amps(a)} · ${Math.round(x.battPct[i])} %`;
      }, el, m.lang);
      return box(i === 0 ? 400 : 644, 244, v.map((x) => x > 18), `BATT ${i + 1}`, v.map((x) => `${x.toFixed(1)} V`), sub);
    };
    const selector = ['BATT BORD', 'ARRET', 'PARC'];
    const main = bus(1), battBus = bus(2);
    const tile = (name: string, on: Subscribable<boolean>, value: Subscribable<string>): VNode => (
      <div class={{ etile: true, on }}><span>{name}</span><b>{value}</b></div>
    );
    const ac = (n: number): Subscribable<string> => bus(n).map((v) => (live(v) ? `${Math.round(v * AC_SCALE)} V` : 'OFF'));
    const alt = (i: 0 | 1): Subscribable<boolean> => el.map((x) => x.altOn[i] && live(x.altV[i]));
    const light = (name: string, on: Subscribable<boolean>, cls = 'amber'): VNode => <div class={{ elight: true, [cls]: true, on }}>{name}</div>;
    return (
      <div class="elecsys">
        <svg class="el-plan" viewBox="0 0 1224 330">
          {line('M110 88V124', el.map((x) => live(x.genV[0])))}
          {line('M1114 88V124', el.map((x) => live(x.genV[1])))}
          {line('M612 88V124', el.map((x) => x.gpuOn))}
          <path class={main.map((v) => (live(v) ? 'el-bus live' : 'el-bus'))} d="M40 128H1184" />
          <text class="el-label" x={330} y={116}>{main.map((v) => `MAIN BUS  ${v.toFixed(1)} V`)}</text>
          {line('M110 132V178', bus(3).map(live))}
          {line('M1114 132V178', bus(4).map(live))}
          {line('M612 132V196', MappedSubject.create(([a, b]) => live(a) && live(b), main, battBus))}
          <path class={battBus.map((v) => (live(v) ? 'el-bus live' : 'el-bus'))} d="M420 200H804" />
          <text class="el-label" x={430} y={188}>{battBus.map((v) => `BATT BUS  ${v.toFixed(1)} V`)}</text>
          {line('M490 204V244', el.map((x) => x.battV[0] > 18))}
          {line('M734 204V244', el.map((x) => x.battV[1] > 18))}
          {gen(0)}{gen(1)}
          {box(522, 8, el.map((x) => x.gpuOn), 'GPU', el.map((x) => (x.gpuOn ? `${Math.max(x.gpuV, 28).toFixed(1)} V` : 'OFF')),
            el.map((x) => selector[x.powerSelector] ?? ''))}
          {box(20, 178, bus(3).map(live), 'EMERG 1', volts(bus(3)), Subject.create(''))}
          {box(1024, 178, bus(4).map(live), 'EMERG 2', volts(bus(4)), Subject.create(''))}
          {batt(0)}{batt(1)}
        </svg>
        <div class="card-title">{i18n.t('elAc')}</div>
        <div class="etiles">
          {[1, 2, 3, 4, 5].map((n) => tile(`INV ${n}`, bus(11 + n).map(live), bus(11 + n).map((v) => (live(v) ? 'ON' : 'OFF'))))}
          {tile('115 V BUS 1', bus(5).map(live), ac(5))}
          {tile('115 V BUS 5', bus(9).map(live), ac(9))}
          {tile('ESS 115 V', bus(6).map(live), ac(6))}
          {([0, 1] as const).map((i) => tile(`ALT ${i + 1}`, alt(i),
            el.map((x) => (x.altOn[i] && live(x.altV[i]) ? `${Math.round(x.altV[i])} V ${amps(x.altA[i])}` : 'OFF'))))}
        </div>
        <div class="card-title">{i18n.t('elWarnings')}</div>
        <div class="elights">
          {light('ALT 1', el.map((x) => x.altFail[0]))}{light('ALT 2', el.map((x) => x.altFail[1]))}
          {light('ALT 1 HOT', el.map((x) => x.altHot[0]), 'red')}{light('ALT 2 HOT', el.map((x) => x.altHot[1]), 'red')}
          {light('ALT 1 O/V', el.map((x) => x.altOverVolt[0]))}{light('ALT 2 O/V', el.map((x) => x.altOverVolt[1]))}
          {light('INV 1', el.map((x) => x.inverterFail[0]))}{light('INV 2', el.map((x) => x.inverterFail[1]))}
          {light('GEN 1 HOT', el.map((x) => x.genHot[0]), 'red')}{light('GEN 2 HOT', el.map((x) => x.genHot[1]), 'red')}
          {light('GPU', el.map((x) => x.gpuLight), 'green')}{light('STARTER', el.map((x) => x.starterLight))}
        </div>
      </div>
    );
  }

  /** Pressurisation and the pneumatic system's bottles. */
  private airTab(): VNode {
    const { model: m, i18n } = this.props;
    const a = m.systems.map((s) => s.air);
    const n = (f: (x: AirReadings) => number): Subscribable<number> => a.map(f);
    const txt = (v: Subscribable<number>): Subscribable<string> => MappedSubject.create(([x, l]) => int(x, l), v, m.lang);
    const cabin = n((x) => x.cabinAltFt), rate = n((x) => x.cabinRateFpm), diff = n((x) => x.diffPsi), deice = n((x) => x.wingDeicePsi);
    const bottle = (name: StringKey, v: Subscribable<number>, min: number): VNode => gauge({
      name: i18n.t(name), unit: 'psi', min: 0, max: PNEUMATIC.gaugePsi, value: v, text: txt(v),
      level: v.map((p) => (p > PNEUMATIC.reliefPsi ? 'red' : p < min ? 'amber' : 'ok')),
      zones: [{ from: 0, to: min, cls: 'amber' }, { from: min, to: PNEUMATIC.reliefPsi, cls: 'green' }, { from: PNEUMATIC.reliefPsi, to: PNEUMATIC.gaugePsi, cls: 'red' }],
      ticks: [[min, 'MIN']],
    });
    return (
      <div class="airsys">
        <div class="card air">
          <div class="card-title">{i18n.t('airPress')}</div>
          {gauge({ name: i18n.t('airCabinAlt'), unit: 'ft', min: 0, max: 10000, value: cabin, text: txt(cabin) })}
          {gauge({
            name: i18n.t('airCabinRate'), unit: 'ft/min', min: -2000, max: 2000, origin: 0, value: rate,
            text: MappedSubject.create(([x, l]) => `${x > 0.5 ? '+' : ''}${int(x, l)}`, rate, m.lang), ticks: [[0, '0']],
          })}
          {gauge({
            name: i18n.t('airDiff'), unit: 'psi', min: 0, max: CABIN_DIFF.gaugePsi, value: diff, text: diff.map((x) => x.toFixed(2)),
            level: diff.map((x) => (x > CABIN_DIFF.safetyPsi ? 'red' : x > CABIN_DIFF.maxPsi ? 'amber' : 'ok')),
            zones: [{ from: 0, to: CABIN_DIFF.maxPsi, cls: 'green' }, { from: CABIN_DIFF.maxPsi, to: CABIN_DIFF.safetyPsi, cls: 'amber' },
              { from: CABIN_DIFF.safetyPsi, to: CABIN_DIFF.gaugePsi, cls: 'red' }],
            ticks: [[CABIN_DIFF.maxPsi, '4.16']],
          })}
          <div class="kv"><span>{i18n.t('airDump')}</span><b class={a.map((x) => (x.dump ? 'warn-text' : ''))}>{MappedSubject.create(([x]) => i18n.now(x.dump ? 'airArmed' : 'airDumpOff'), a, m.lang)}</b></div>
          <div class="kv"><span>{i18n.t('airAircraftAlt')}</span><b>{MappedSubject.create(([v, l]) => `${int(v, l)} ft`, m.altitudeFt, m.lang)}</b></div>
        </div>
        <div class="card air">
          <div class="card-title">{i18n.t('airPneu')}</div>
          {bottle('airPneuMain', n((x) => x.pneuMainPsi), PNEUMATIC.minMainPsi)}
          {bottle('airPneuBrakes', n((x) => x.pneuBrakesPsi), PNEUMATIC.minBrakesPsi)}
          {bottle('airPneuEmerg', n((x) => x.pneuEmergPsi), PNEUMATIC.minEmergPsi)}
          {gauge({ name: i18n.t('airWingDeice'), unit: 'psi', min: 0, max: 40, value: deice, text: txt(deice) })}
          <div class="air-note">{i18n.t('airPneuNote')}</div>
        </div>
      </div>
    );
  }
}
