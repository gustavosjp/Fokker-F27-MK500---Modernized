import { DisplayComponent, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { CALC_LIMITS, FUEL_TRIM_CHARTS, fuelTrimPercent, LIMITS } from './booklet';
import { Lang, StringKey } from './i18n';
import { TabletModel } from './model';
import { onTap, TabletProps } from './ui';

type BookTab = 'speeds' | 'limits' | 'fuel' | 'trim' | 'options';
const TABS: { id: BookTab; key: StringKey }[] = [
  { id: 'speeds', key: 'bkSpeeds' }, { id: 'limits', key: 'bkLimits' }, { id: 'fuel', key: 'bkFuel' }, { id: 'trim', key: 'bkTrim' }, { id: 'options', key: 'bkOptions' },
];

const int = (v: number, lang: Lang): string => TabletModel.weight(v, 'lb', lang);
const kt = (v: number | undefined): string => (v === undefined ? '—' : `${Math.round(v)} kt`);

/** One chart's drawing box inside the SVG, px. */
const CH = { w: 330, h: 400, top: 40, left: 70, gap: 200 };

/**
 * v11.6 (user: "tem essas informações também, podemos adicionar elas ao tablet, e sincronizar, ao mexer no tablet, faz no caderninho também"): the
 * author's two cockpit booklets on the tablet. Reference speeds, limitations, the fuel calculator and the fuel trim charts with a dot where the
 * aircraft is now; the booklets' own settings and the calculator's inputs are the very same L:vars, so either side shows the other's changes.
 */
export class BookletPage extends DisplayComponent<TabletProps> {
  private readonly tab = Subject.create<BookTab>('speeds');
  private readonly taps: { node: VNode; fn: () => void }[] = [];

  /** @inheritdoc */
  public render(): VNode {
    const { i18n } = this.props;
    const body = (id: BookTab, content: VNode): VNode => <div class={{ 'bk-body': true, hidden: this.tab.map((t) => t !== id) }}>{content}</div>;
    return (
      <div class="booklet">
        <div class="segmented sys-tabs">
          {TABS.map((t) => this.tap(<div class={{ opt: true, active: this.tab.map((x) => x === t.id) }}>{i18n.t(t.key)}</div>, () => this.tab.set(t.id)))}
        </div>
        {body('speeds', this.speedsTab())}
        {body('limits', this.limitsTab())}
        {body('fuel', this.fuelTab())}
        {body('trim', this.trimTab())}
        {body('options', this.optionsTab())}
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    for (const { node, fn } of this.taps) {
      onTap(node.instance as Element, fn, true);
    }
  }

  /**
   * @param el An element.
   * @param fn What a tap on it does.
   * @returns The element, tappable once rendered (an element's VNode holds its DOM node).
   */
  private tap(el: VNode, fn: () => void): VNode {
    this.taps.push({ node: el, fn });
    return el;
  }

  /** A label / value row. */
  private row(label: string | Subscribable<string>, value: string | Subscribable<string>): VNode {
    return <div class="bk-row"><span>{label}</span><b>{value}</b></div>;
  }

  /** The reference speeds for now, and the speed limits. */
  private speedsTab(): VNode {
    const { model: m, i18n } = this.props;
    const b = m.booklet;
    const sp = b.speeds;
    const landing = b.flapsIndex.map((f) => f >= 3);
    const big = (name: string, v: Subscribable<string>): VNode => <div class="bk-speed"><span>{name}</span><b>{v}</b></div>;
    return (
      <div class="bk-two">
        <div class="card">
          <div class="card-title">{i18n.t('bkRefSpeeds')}</div>
          <div class="bk-inputs">
            {this.row(i18n.t('bkWeight'), MappedSubject.create(([w, l]) => `${int(w, l)} kg / ${int(w * 2.20462, l)} lb`, b.weightKg, m.lang))}
            {this.row(i18n.t('bkFlaps'), b.flapsIndex.map((f) => ['0', '16.5', '26.5', '40'][f] ?? String(f)))}
            {this.row(i18n.t('bkIsa'), b.isaDev.map((d) => `${d >= 0 ? '+' : ''}${Math.round(d)} °C`))}
            {this.row(i18n.t('bkElevation'), MappedSubject.create(([z, l]) => `${int(z, l)} ft`, b.groundFt, m.lang))}
          </div>
          <div class="bk-speeds">
            {big('Vref', sp.map((s) => kt(s.vref)))}
            {big('V1', sp.map((s) => kt(s.v1)))}
            {big('VR', sp.map((s) => kt(s.vr)))}
            {big('V2', sp.map((s) => kt(s.v2)))}
            {big('V3', sp.map((s) => kt(s.v3)))}
            {big('VAPP', sp.map((s) => kt(s.vapp)))}
          </div>
          <div class={{ 'dim-text': true, hidden: landing.map((x) => !x) }}>{i18n.t('bkLandingFlaps')}</div>
          <div class="dim-text">{i18n.t('bkSpeedsNote')}</div>
        </div>
        <div class="card">
          <div class="card-title">{i18n.t('bkSpeedLimits')}</div>
          {this.row(i18n.t('bkVne'), `${LIMITS.speeds.vneLow} kt · ${LIMITS.speeds.vneHigh} kt > 20,000 ft`)}
          {this.row(i18n.t('bkVmo'), `${LIMITS.speeds.vmoLow} kt · ${LIMITS.speeds.vmoHigh} kt > 20,000 ft`)}
          {this.row(i18n.t('bkVle'), `${LIMITS.speeds.vloVle} kt`)}
          {LIMITS.speeds.vfe.map(([f, v]) => this.row(i18n.t('bkVfe').map((t) => `${t} ${f}`), `${v} kt`))}
          {this.row(i18n.t('bkVb').map((t) => t), MappedSubject.create(([x]) => `${LIMITS.speeds.vbMax} / ${LIMITS.speeds.vbEmpty} kt (${x})`, i18n.t('bkMaxEmpty')))}
        </div>
      </div>
    );
  }

  /** The engine and general limitations. */
  private limitsTab(): VNode {
    const { model: m, i18n } = this.props;
    const e = LIMITS.engines;
    const g = LIMITS.general;
    const n = (v: number): Subscribable<string> => m.lang.map((l) => int(v, l));
    return (
      <div class="bk-two">
        <div class="card">
          <div class="card-title">{i18n.t('bkEngineLimits')}</div>
          {this.row(i18n.t('bkStart'), MappedSubject.create(([t]) => `TGT ${e.startTgt} °C (${t})`, i18n.t('bkTemporary')))}
          <div class="bk-sub">{i18n.t('bkTakeOffGa')}</div>
          {this.row(i18n.t('bkDry'), MappedSubject.create(([r]) => `${r} rpm / ${e.takeOffTgtDry} °C`, n(e.takeOffRpm)))}
          {this.row(i18n.t('bkWet'), MappedSubject.create(([r]) => `${r} rpm / ${e.takeOffTgtWet} °C`, n(e.takeOffRpm)))}
          {this.row(i18n.t('bkClimbCruise'), MappedSubject.create(([r]) => `${r} rpm / ${e.climbCruiseTgt} °C`, n(e.climbCruiseRpm)))}
        </div>
        <div class="card">
          <div class="card-title">{i18n.t('bkGeneralLimits')}</div>
          {this.row('MTOW', MappedSubject.create(([a, b2]) => `${a} kg / ${b2} lb`, n(g.mtowKg), n(g.mtowLb)))}
          {this.row('MLW', MappedSubject.create(([a, b2]) => `${a} kg / ${b2} lb`, n(g.mlwKg), n(g.mlwLb)))}
          {this.row('MZFW', MappedSubject.create(([a, b2]) => `${a} kg / ${b2} lb`, n(g.mzfwKg), n(g.mzfwLb)))}
          {this.row(i18n.t('bkTerrain'), MappedSubject.create(([a, b2]) => `${a} / ${b2} ft`, n(g.terrainMinFt), n(g.terrainMaxFt)))}
          {this.row(i18n.t('bkSlope'), `−${g.slopePct} / +${g.slopePct} %`)}
          {this.row(i18n.t('bkOat'), `${g.oatMin} / +${g.oatMax} °C`)}
          {this.row(i18n.t('bkTailwind'), `${g.tailwindKt} kt`)}
          {this.row(i18n.t('bkCrosswind'), `${g.crosswindDryKt} / ${g.crosswindWetKt} kt`)}
          {this.row(i18n.t('bkMaxCruise'), MappedSubject.create(([a]) => `${a} ft`, n(g.maxCruiseFt)))}
          {this.row(i18n.t('bkDiffPress'), MappedSubject.create(([a, c, t]) => `${a} ft (${t} ${c} ft)`, n(g.maxDiffPressFt), n(g.cabinFt), i18n.t('bkCabin')))}
        </div>
      </div>
    );
  }

  /** The fuel calculator: the booklet's inputs, shared, and the result worked out here. */
  private fuelTab(): VNode {
    const { model: m, i18n } = this.props;
    const b = m.booklet;
    const btn = (label: string | Subscribable<string>, fn: () => void, cls = ''): VNode => this.tap(<div class={`button bk-btn ${cls}`}>{label}</div>, fn);
    const stepDist = (d: number): void => b.setDistance((b.distanceNm.get() || Math.round(b.calc.get().distanceNm)) + d);
    const stepFl = (d: number): void => { const cur = b.flightLevel.get(); b.setFlightLevel(cur < CALC_LIMITS.flMin ? 200 : cur + d); };
    const fromOfp = (): void => {
      const o = m.ofp.get();
      if (o) {
        b.setDistance(o.distanceNm);
        b.setFlightLevel(o.cruiseFt / 100);
      }
    };
    const c = b.calc;
    const errKey = c.map((r): StringKey | null => (r.error === 'distance' ? 'bkErrDistance' : r.error === 'reduce-fl' ? 'bkErrReduceFl' : r.error === 'too-heavy' ? 'bkErrHeavy' : null));
    const opt = (label: Subscribable<string>, active: Subscribable<boolean>, fn: () => void): VNode => this.tap(<div class={{ opt: true, active }}>{label}</div>, fn);
    return (
      <div class="bk-two">
        <div class="card">
          <div class="card-title">{i18n.t('bkCalc')}</div>
          <div class="bk-field">
            <span>{i18n.t('bkDistance')}</span>
            <b>{MappedSubject.create(([d, r, l]) => `${int(d || r.distanceNm, l)} nm / ${int((d || r.distanceNm) * 1.852, l)} km`, b.distanceNm, c, m.lang)}</b>
            <span class={{ 'bk-gps': true, hidden: b.distanceNm.map((d) => d > 0) }}>{i18n.t('bkDistGps')}</span>
          </div>
          <div class="bk-steps">
            {btn('−100', () => stepDist(-100))}{btn('−10', () => stepDist(-10))}{btn('−1', () => stepDist(-1))}
            {btn('+1', () => stepDist(1))}{btn('+10', () => stepDist(10))}{btn('+100', () => stepDist(100))}
          </div>
          <div class="bk-field">
            <span>{i18n.t('bkFlightLevel')}</span>
            <b>{b.flightLevel.map((f) => (f < CALC_LIMITS.flMin ? '—' : `FL ${String(f).padStart(3, '0')}`))}</b>
          </div>
          <div class="bk-steps">{btn('−5', () => stepFl(-5))}{btn('+5', () => stepFl(5))}</div>
          <div class="card-title second">{i18n.t('bkDest')}</div>
          <div class="segmented">
            {opt(i18n.t('bkRegional'), b.highTraffic.map((h) => !h), () => b.setHighTraffic(false))}
            {opt(i18n.t('bkHighTraffic'), b.highTraffic, () => b.setHighTraffic(true))}
          </div>
          <div class="bk-steps">
            {btn(i18n.t('bkFromOfp'), fromOfp)}
            {btn(i18n.t('bkCalcBook'), () => b.calculateInBooklet())}
          </div>
        </div>
        <div class="card">
          <div class="card-title">{i18n.t('bkTotalFuel')}</div>
          <div class={{ 'bk-total': true, hidden: errKey.map((k) => k !== null) }}>
            {MappedSubject.create(([r, l]) => `${int(r.totalKg, l)} kg`, c, m.lang)}
            <span>{MappedSubject.create(([r, l]) => `${int(r.totalLb, l)} lb`, c, m.lang)}</span>
          </div>
          <div class={{ 'bk-error': true, hidden: errKey.map((k) => k === null) }}>{MappedSubject.create(([k]) => (k ? i18n.now(k) : ''), errKey, m.lang)}</div>
          {this.row(i18n.t('bkTrip'), MappedSubject.create(([r, l]) => (r.error ? '—' : `${int(r.tripKg, l)} kg`), c, m.lang))}
          {this.row(i18n.t('bkClimbDesc'), c.map((r) => (r.error ? '—' : `${r.climbNm} / ${r.descentNm} nm`)))}
          <div class="dim-text">{i18n.t('bkCalcNote')}</div>
        </div>
      </div>
    );
  }

  /** The two fuel trim charts, with a dot at the outside temperature and pressure altitude now. */
  private trimTab(): VNode {
    const { model: m, i18n } = this.props;
    const b = m.booklet;
    const pct = (chart: 'start' | 'takeOff'): Subscribable<string> => MappedSubject.create(([oat, zp, l]) => {
      const c = FUEL_TRIM_CHARTS[chart];
      const p = fuelTrimPercent(chart, oat, zp);
      const off = zp < c.zpAxis[0] - 100 || zp > c.zpAxis[1] + 100 || p < c.trimAtSeaLevel[0] - 2.5 || p > c.trimAtSeaLevel[1] + 2.5;
      return `${Math.round(p)} %${off ? ` (${i18n.now('bkOffChart')})` : ''}`;
    }, b.oatC, b.pressureAltFt, m.lang);
    return (
      <div class="card bk-trim">
        <div class="card-title">{i18n.t('bkTrimTitle')}</div>
        <svg class="bk-charts" viewBox={`0 0 ${CH.left * 2 + CH.w * 2 + CH.gap} ${CH.top + CH.h + 60}`}>
          {this.chart('start', CH.left, i18n.t('bkTrimStart'))}
          {this.chart('takeOff', CH.left * 2 + CH.w + CH.gap - CH.left, i18n.t('bkTrimTakeOff'))}
        </svg>
        <div class="bk-trim-values">
          {this.row(i18n.t('bkTrimStart'), pct('start'))}
          {this.row(i18n.t('bkTrimTakeOff'), pct('takeOff'))}
          {this.row(i18n.t('bkTrimNow'), b.fuelTrim.map((v) => `${Math.round(v * 10)} %`))}
          {this.row('OAT / Zp', MappedSubject.create(([o, z, l]) => `${Math.round(o)} °C / ${int(z, l)} ft`, b.oatC, b.pressureAltFt, m.lang))}
        </div>
        <div class="dim-text">{i18n.t('bkTrimNote')}</div>
      </div>
    );
  }

  /**
   * One fuel trim chart: grid, lines of equal trim, labels and the dot.
   * @param chart Which chart.
   * @param x0 Left edge of its box in the SVG.
   * @param title Its title.
   * @returns The chart's SVG group.
   */
  private chart(chart: 'start' | 'takeOff', x0: number, title: Subscribable<string>): VNode {
    const b = this.props.model.booklet;
    const c = FUEL_TRIM_CHARTS[chart];
    const [oatBottom, oatTop] = c.oatAxis;
    const y0 = CH.top;
    const toX = (z: number): number => x0 + (z / 2000) * CH.w;
    const toY = (oat: number): number => y0 + ((oatTop - oat) / (oatTop - oatBottom)) * CH.h;
    const seaOat = (p: number): number => c.oatAtSeaLevel[0] + ((p - c.trimAtSeaLevel[0]) / (c.trimAtSeaLevel[1] - c.trimAtSeaLevel[0])) * (c.oatAtSeaLevel[1] - c.oatAtSeaLevel[0]);
    const lapse = FUEL_TRIM_CHARTS.lapsePer1000Ft * 2;
    const clip = `bkclip-${chart}`;
    const lines: VNode[] = [];
    const labels: VNode[] = [];
    const first = chart === 'start' ? 0 : 40;
    const last = chart === 'start' ? 50 : 100;
    for (let p = first; p <= last; p += 5) {
      const a = seaOat(p);
      lines.push(<line class="bk-tl" x1={String(toX(0))} y1={String(toY(a))} x2={String(toX(2000))} y2={String(toY(a - lapse))} />);
      const endY = toY(a - lapse);
      if ((chart === 'start' || p % 10 === 0) && endY >= y0 - 2 && endY <= y0 + CH.h + 2) {
        labels.push(<text class="bk-tlabel" x={String(toX(2000) + 8)} y={String(endY + 5)}>{`${p}%`}</text>);
      }
    }
    const grid: VNode[] = [];
    for (let z = 0; z <= 2000; z += 500) {
      grid.push(<line class="bk-grid" x1={String(toX(z))} y1={String(y0)} x2={String(toX(z))} y2={String(y0 + CH.h)} />);
      grid.push(<text class="bk-axis" x={String(toX(z))} y={String(y0 + CH.h + 22)} text-anchor="middle">{String(z)}</text>);
    }
    for (let t = Math.ceil(oatBottom / 5) * 5; t <= oatTop; t += 5) {
      grid.push(<line class="bk-grid" x1={String(x0)} y1={String(toY(t))} x2={String(x0 + CH.w)} y2={String(toY(t))} />);
      grid.push(<text class="bk-axis" x={String(x0 - 10)} y={String(toY(t) + 5)} text-anchor="end">{String(t)}</text>);
    }
    const dot = MappedSubject.create(([oat, zp]) => [toX(Math.max(-100, Math.min(2100, zp))), toY(oat), zp >= -100 && zp <= 2100 && oat >= oatBottom && oat <= oatTop] as const, b.oatC, b.pressureAltFt);
    return (
      <g>
        <defs><clipPath id={clip}><rect x={String(x0)} y={String(y0)} width={String(CH.w)} height={String(CH.h)} /></clipPath></defs>
        <text class="bk-ctitle" x={String(x0 + CH.w / 2)} y={String(y0 - 14)} text-anchor="middle">{title}</text>
        <rect class="bk-box" x={String(x0)} y={String(y0)} width={String(CH.w)} height={String(CH.h)} />
        {grid}
        <g clip-path={`url(#${clip})`}>{lines}</g>
        {labels}
        <circle class="bk-dot" visibility={dot.map((d) => (d[2] ? 'visible' : 'hidden'))} cx={dot.map((d) => String(d[0]))} cy={dot.map((d) => String(d[1]))} r="11" />
      </g>
    );
  }

  /** The booklets' own options, shared both ways. */
  private optionsTab(): VNode {
    const { model: m, i18n } = this.props;
    const b = m.booklet;
    const opt = (label: string | Subscribable<string>, active: Subscribable<boolean>, fn: () => void): VNode =>
      this.tap(<div class={{ opt: true, active }}>{label}</div>, fn);
    return (
      <div class="bk-two">
        <div class="card">
          <div class="card-title">{i18n.t('bkFuelUnit')}</div>
          <div class="segmented">
            {opt('kg', m.units.map((u) => u === 'kg'), () => m.units.set('kg'))}
            {opt('lb', m.units.map((u) => u === 'lb'), () => m.units.set('lb'))}
          </div>
          <div class="card-title second">{i18n.t('bkHideDecals')}</div>
          <div class="segmented">
            {opt(i18n.t('bkShow'), b.decalsHidden.map((h) => !h), () => b.setDecalsHidden(false))}
            {opt(i18n.t('bkHide'), b.decalsHidden, () => b.setDecalsHidden(true))}
          </div>
          <div class="card-title second">{i18n.t('bkHideGps')}</div>
          <div class="segmented">
            {opt(i18n.t('bkShow'), b.gpsVisible, () => b.setGpsVisible(true))}
            {opt(i18n.t('bkHide'), b.gpsVisible.map((v) => !v), () => b.setGpsVisible(false))}
          </div>
          <div class="dim-text">{i18n.t('bkSyncNote')}</div>
        </div>
        <div class="card">
          <div class="card-title">{i18n.t('bkOptions')}</div>
          <div class="dim-text">{i18n.t('bkFailNote')}</div>
        </div>
      </div>
    );
  }
}
