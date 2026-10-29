import { DisplayComponent, FSComponent, MappedSubject, NodeReference, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { formatDate, Lang, StringKey } from './i18n';
import { TabletModel, WxSource } from './model';
import { AppId, hhmm, onTap, TabletProps } from './ui';

/** The apps on Home: title, colour and a 24 x 24 glyph. */
const APPS: { id: AppId; key: StringKey; color: string; icon: string }[] = [
  { id: 'flight', key: 'tabFlight', color: '#2f7de1', icon: 'M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm14 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8.5v4A3.5 3.5 0 0 0 9.5 16H14a1.5 1.5 0 0 1 0 3h-3v2h3a3.5 3.5 0 0 0 0-7H9.5A1.5 1.5 0 0 1 8 12.5V9.5A1.5 1.5 0 0 1 9.5 8H17v2l3-3-3-3v2H9.5c-.6 0-1.1.1-1.6.3A3 3 0 0 0 6 8.5z' },
  { id: 'charts', key: 'tabCharts', color: '#14978f', icon: 'M15 4 9 2 3 4v18l6-2 6 2 6-2V2zm-1 15.3-4-1.3V4.7l4 1.3z' },
  { id: 'checklist', key: 'tabChecklist', color: '#36985a', icon: 'M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1zm0 2v2h6V4zm1.2 12.6 6-6-1.4-1.4-4.6 4.6-2-2-1.4 1.4z' },
  { id: 'ground', key: 'tabGround', color: '#de8a2c', icon: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z' },
  { id: 'weights', key: 'tabWeights', color: '#7b58cc', icon: 'M12 2.5a2 2 0 0 0-1.9 1.5H5.6L2.5 12a3.6 3.6 0 0 0 7 0L6.9 6h3.3v13.5H7V21h10v-1.5h-3.2V6h3.3L14.5 12a3.6 3.6 0 0 0 7 0L18.4 4h-4.5A2 2 0 0 0 12 2.5zM6 8l1.8 4H4.2zm12 0 1.8 4h-3.6z' },
  { id: 'systems', key: 'tabSystems', color: '#c4473f', icon: 'M3.34 18A10 10 0 1 1 20.66 18L18.93 17A8 8 0 1 0 5.07 17zM16.5 8 12.9 13.8 11.1 12.2zM12 11.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z' },
  { id: 'settings', key: 'tabSettings', color: '#5b6774', icon: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.3 7.3 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.3 7.3 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z' },
];

/**
 * Home (v10.5, user: the Hawker 800XP tablet as an example): the time, the METAR where the aircraft is (or of the OFP's destination in
 * flight; the sim's own weather; v10.6: or of the OFP's origin, destination or alternate, as the pilot picks), the apps, and the
 * aircraft's state at a glance.
 */
export class HomePage extends DisplayComponent<TabletProps & { open: (app: AppId) => void; shown: Subscribable<boolean> }> {
  private readonly appRefs: { id: AppId; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly wxRef = FSComponent.createRef<HTMLDivElement>();
  private readonly srcRefs: { src: WxSource; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly statusRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    type Info = NonNullable<ReturnType<typeof m.metar.get>>;
    // a METAR field as text, in the tablet's language (number separators); '' while there is no METAR
    const metarText = (f: (x: Info, lang: Lang) => string): Subscribable<string> => MappedSubject.create(([x, l]) => (x ? f(x, l) : ''), m.metar, m.lang);
    const kv = (label: string | Subscribable<string>, value: Subscribable<string>): VNode => <div class="wx-kv"><span>{label}</span><b>{value}</b></div>;
    const num = (v: Subscribable<number>, unit: string): Subscribable<string> => MappedSubject.create(([x, l]) => `${TabletModel.weight(x, 'lb', l)} ${unit}`, v, m.lang);
    const wind = MappedSubject.create(([x]) => {
      if (!x) {
        return '';
      }
      const dir = x.windDir === null ? i18n.now('wxVariable') : `${String(Math.round(x.windDir) % 360 || 360).padStart(3, '0')}°`;
      return x.windKt < 1 ? i18n.now('calm') : `${dir} / ${x.windKt}${x.gustKt ? `G${x.gustKt}` : ''} kt`;
    }, m.metar, m.lang);
    // ISA deviation at the field: only on the ground with the METAR of the airport the aircraft is at, whose altitude is the aircraft's
    const isa = MappedSubject.create(([x, g, alt, src]) => {
      if (!x || x.tempC === null || !g || src !== 'nearest') {
        return '—';
      }
      const dev = Math.round(x.tempC - (15 - (1.98 * alt) / 1000));
      return `${dev >= 0 ? '+' : ''}${dev} °C`;
    }, m.metar, m.onGround, m.altitudeFt, m.wxSource);
    const wxMsg = MappedSubject.create(([st, apt]) => {
      switch (st) {
        case 'loading': return i18n.now('wxLoading');
        case 'none': return apt ? i18n.now('wxNone') : i18n.now('wxNoAirport');
        case 'error': return i18n.now('wxError');
        default: return st === 'ok' ? '' : i18n.now('wxLoading');
      }
    }, m.wxState, m.wxAirport, m.lang);
    const weight = (lb: Subscribable<number>): Subscribable<string> => MappedSubject.create(([v, u, l]) => `${TabletModel.weight(v, u, l)} ${u}`, lb, m.units, m.lang);
    const stat = (label: string | Subscribable<string>, value: Subscribable<string>): VNode => <div class="hstat"><span>{label}</span><b>{value}</b></div>;
    const pill = (key: StringKey, on: Subscribable<boolean>, cls: string): VNode => <div class={{ pill: true, [cls]: true, on }}>{i18n.t(key)}</div>;
    const anyDoor = MappedSubject.create(([a, b, c]) => a || b || c, m.doorFwdOpen, m.doorCargoOpen, m.doorAftOpen);
    const anyStair = MappedSubject.create(([a, b]) => a || b, m.stairFwd, m.stairAft);
    const anyCover = MappedSubject.create(([a, b]) => a || b, m.pitotCovers, m.engineCovers);
    const coversWarn = MappedSubject.create(([run, a, b, c]) => run && (a || b || c), m.enginesRunning, m.pitotCovers, m.engineCovers, m.gearPins);
    // whose METAR: the nearest airport, or the OFP's origin, destination, alternate (shown once an OFP is loaded)
    const src = (s: WxSource, key: StringKey): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.srcRefs.push({ src: s, ref });
      const hidden = s === 'altn' ? m.ofp.map((o) => !o || !o.altn) : false;
      return <div ref={ref} class={{ 'wx-src': true, active: m.wxSource.map((x) => x === s), hidden }}>{i18n.t(key)}</div>;
    };
    return (
      <div class="home">
        <div class="home-left">
          <div class="hclock">
            <div class="hc-time">{m.zuluSeconds.map(hhmm)}<span class="hc-unit">UTC</span></div>
            <div class="hc-sub"><b>{m.localSeconds.map(hhmm)}</b> LCL · {MappedSubject.create(([l, d]) => formatDate(l, d), m.lang, m.localDate)}</div>
          </div>
          <div ref={this.wxRef} class="card wx">
            <div class="wx-head">
              <span class="wx-apt">{m.wxAirport.map((a) => a || '----')}</span>
              <span class="wx-obs">{metarText((x) => x.observed)}</span>
            </div>
            <div class={{ 'wx-srcs': true, hidden: m.ofp.map((o) => !o) }}>
              {src('nearest', 'wxNrst')}{src('origin', 'wxOrig')}{src('dest', 'wxDest')}{src('altn', 'wxAltn')}
            </div>
            <div class={{ 'wx-grid': true, hidden: m.wxState.map((s) => s !== 'ok') }}>
              {kv(i18n.t('wxTemp'), metarText((x) => (x.tempC === null ? '—' : `${x.tempC} / ${x.dewC ?? '—'} °C`)))}
              {kv('ISA', isa)}
              {kv(i18n.t('wind'), wind)}
              {kv(i18n.t('wxVis'), metarText((x, l) => (x.cavok ? 'CAVOK' : x.visM === null ? '—' : x.visM >= 9999 ? '10 km+' : `${TabletModel.weight(x.visM, 'lb', l)} m`)))}
              {kv('QNH  hPa / inHg', metarText((x) => (x.qnhHpa === null ? '—' : `${x.qnhHpa} / ${(x.qnhHpa / 33.8639).toFixed(2)}`)))}
              {kv(i18n.t('wxCeiling'), metarText((x, l) => (x.ceilingFt === null ? '—' : `${TabletModel.weight(x.ceilingFt, 'lb', l)} ft`)))}
            </div>
            <div class={{ 'wx-raw': true, hidden: m.wxState.map((s) => s !== 'ok') }}>{metarText((x) => x.raw)}</div>
            <div class={{ 'wx-msg': true, hidden: wxMsg.map((s) => s === '') }}>{wxMsg}</div>
            <div class="wx-hint">{i18n.t('wxTapRefresh')}</div>
          </div>
        </div>
        <div class="home-right">
          <div class="apps">
            {APPS.map((app) => {
              const ref = FSComponent.createRef<HTMLDivElement>();
              this.appRefs.push({ id: app.id, ref });
              return (
                <div ref={ref} class="app">
                  <div class="app-icon" style={`background-color: ${app.color}`}>
                    <svg class="app-glyph" viewBox="0 0 24 24"><path d={app.icon} /></svg>
                  </div>
                  <div class="app-label">{i18n.t(app.key)}</div>
                </div>
              );
            })}
          </div>
          <div ref={this.statusRef} class="card hstatus">
            <div class="hstats">
              {stat('GS', m.groundSpeedKt.map((v) => `${Math.round(v)} kt`))}
              {stat('IAS', m.iasKt.map((v) => (v < 30 ? '—' : `${Math.round(v)} kt`)))}
              {stat('ALT', num(m.altitudeFt, 'ft'))}
              {stat(i18n.t('weight'), weight(m.totalWeightLb))}
              {stat(i18n.t('fuel'), weight(m.fuelLb))}
            </div>
            <div class="hpills">
              {pill('pillDoors', anyDoor, 'door')}
              {pill('pillStairs', anyStair, 'stair')}
              {pill('chocks', m.chocks, 'chock')}
              {pill('pillCovers', anyCover, 'cover')}
              {pill('gearPins', m.gearPins, 'cover')}
              {pill('groundPower', m.powerSelector.map((v) => v === 2), 'gpu')}
            </div>
            <div class={{ hwarn: true, hidden: coversWarn.map((w) => !w) }}>{i18n.t('coversWarning')}</div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    const { model: m } = this.props;
    for (const { id, ref } of this.appRefs) {
      onTap(ref.instance, () => this.props.open(id));
    }
    onTap(this.statusRef.instance, () => this.props.open('ground'));
    onTap(this.wxRef.instance, () => void m.refreshWeather(true));
    for (const { src, ref } of this.srcRefs) {
      onTap(ref.instance, () => m.pickWeather(src), true);
    }
    this.props.shown.sub((v) => {
      if (v) {
        void m.refreshWeather();
      }
    }, true);
    // the airport changed (picked, or taking off with an OFP): its METAR at once
    m.wxSource.sub(() => {
      if (this.props.shown.get()) {
        void m.refreshWeather();
      }
    });
  }
}
