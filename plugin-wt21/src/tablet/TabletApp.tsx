import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, NodeReference, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { ChartFix, ChartGroup, onChart } from './charts';
import { CHECKLIST, ENGINE_LIMITATIONS, LIMITATIONS } from './checklist';
import { GroundPage } from './GroundPage';
import { HomePage } from './HomePage';
import { I18n, Lang, LANGUAGES, StringKey } from './i18n';
import { TabletMap } from './map';
import { TabletModel } from './model';
import { SystemsPage } from './SystemsPage';
import { AppId, Card, hhmm, KeyboardFn, onTap, TabletProps } from './ui';
import { WeightsPage } from './WeightsPage';

type Page = 'home' | AppId;

const PAGE_TITLES: Record<Page, StringKey> = {
  home: 'tabHome', flight: 'tabFlight', ground: 'tabGround', weights: 'tabWeights', systems: 'tabSystems', checklist: 'tabChecklist', charts: 'tabCharts',
  settings: 'tabSettings',
};

/**
 * The whole tablet: status bar, the pages, the on-screen keyboard and the screen-off cover. v10.5 (user: the Hawker 800XP tablet as an
 * example): it opens on Home, whose app icons replace the tab bar (more apps fit, and the pages get its height); a Home button in the
 * status bar comes back.
 */
export class TabletApp extends DisplayComponent<TabletProps & { map: TabletMap }> {
  private readonly page = Subject.create<Page>('home');
  private readonly homeRef = FSComponent.createRef<HTMLDivElement>();
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private readonly offRef = FSComponent.createRef<HTMLDivElement>();
  private readonly keyboardRef = FSComponent.createRef<Keyboard>();
  /** Opens the on-screen keyboard (created in render after the pages that call this). */
  private readonly keyboard: KeyboardFn = (title, value, done, upper) => this.keyboardRef.instance.open(title, value, done, upper);
  private readonly open = (app: AppId): void => this.page.set(app);

  /** @inheritdoc */
  public render(): VNode {
    const { model, i18n } = this.props;
    // recomputed when the language changes too (i18n.now reads it)
    const title = MappedSubject.create(([p]) => i18n.now(PAGE_TITLES[p]), this.page, model.lang);
    const onHome = this.page.map((p) => p === 'home');
    const page = (p: Page, content: VNode): VNode => <div class={{ page: true, hidden: this.page.map((cur) => cur !== p) }}>{content}</div>;
    return (
      <div class="tab-root" ref={this.rootRef}>
        <div class="topbar">
          <div class="brand">
            <div ref={this.homeRef} class={{ 'home-btn': true, hidden: onHome }}>
              <svg class="home-icon" viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z" /></svg>
              <span>{i18n.t('tabHome')}</span>
            </div>
            <span class={{ 'brand-type': true, hidden: onHome.map((h) => !h) }}>F27-500</span>
            <span class="reg">{model.registration}</span>
          </div>
          <div class="title">{title}</div>
          <div class="clock">
            <span class="clk-label">UTC</span><span class="clk">{model.zuluSeconds.map(hhmm)}</span>
            <span class="clk-label">LCL</span><span class="clk">{model.localSeconds.map(hhmm)}</span>
          </div>
        </div>
        <div class="pages">
          {page('home', <HomePage model={model} i18n={i18n} open={this.open} shown={onHome} />)}
          {page('flight', <FlightPage model={model} i18n={i18n} keyboard={this.keyboard} />)}
          {page('ground', <GroundPage model={model} i18n={i18n} open={this.open} />)}
          {page('weights', <WeightsPage model={model} i18n={i18n} keyboard={this.keyboard} />)}
          {page('systems', <SystemsPage model={model} i18n={i18n} open={this.open} shown={this.page.map((p) => p === 'systems')} />)}
          {page('checklist', <ChecklistPage model={model} i18n={i18n} />)}
          {page('charts', <ChartsPage model={model} i18n={i18n} keyboard={this.keyboard} map={this.props.map} shown={this.page.map((p) => p === 'charts')} />)}
          {page('settings', <SettingsPage model={model} i18n={i18n} />)}
        </div>
        <Keyboard ref={this.keyboardRef} i18n={i18n} />
        <div class={{ off: true, hidden: model.screenOn }} ref={this.offRef}><div class="wake">{i18n.t('tapToWake')}</div></div>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    onTap(this.homeRef.instance, () => this.page.set('home'));
    // dimming = the page's opacity over the screen texture's black background (no overlay: it could catch the clicks)
    this.props.model.brightness.sub((b) => { this.rootRef.instance.style.opacity = b.toFixed(2); }, true);
    onTap(this.offRef.instance, () => this.props.model.screenOn.set(true));
  }
}

/** Settings: brightness, screen off, weight units, language, the cockpit (v10.9), about. */
class SettingsPage extends DisplayComponent<TabletProps> {
  private readonly track = FSComponent.createRef<HTMLDivElement>();
  private readonly offBtn = FSComponent.createRef<HTMLDivElement>();
  private readonly stowBtn = FSComponent.createRef<HTMLDivElement>();
  private readonly seg = new Map<string, NodeReference<HTMLDivElement>>();
  private readonly langRef = FSComponent.createRef<HTMLDivElement>();
  private readonly langOpts: { id: Lang; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly langOpen = Subject.create(false);
  /** A cockpit change was refused (in flight or moving): the note shows for a few seconds. */
  private readonly cockpitRefused = Subject.create(false);
  private refusedTimer = 0;

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    const opt = (id: string, label: string, active: Subscribable<boolean>): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.seg.set(id, ref);
      return <div ref={ref} class={{ opt: true, active }}>{label}</div>;
    };
    return (
      <div class="settings">
        <Card title={i18n.t('screen')}>
          <div class="kv"><span>{i18n.t('brightness')}</span><b>{m.brightness.map((b) => `${Math.round(b * 100)} %`)}</b></div>
          <div class="slider" ref={this.track}>
            <div class="slider-fill" style={m.brightness.map((b) => `width: ${((b - 0.2) / 0.8) * 100}%`)}></div>
          </div>
          <div class="button" ref={this.offBtn}>{i18n.t('screenOff')}</div>
          <div class="button second" ref={this.stowBtn}>{MappedSubject.create(([st]) => i18n.now(st ? 'unstow' : 'stow'), m.stowed, m.lang)}</div>
        </Card>
        <Card title={i18n.t('units')}>
          <div class="segmented">
            {opt('kg', 'kg', m.units.map((u) => u === 'kg'))}
            {opt('lb', 'lb', m.units.map((u) => u === 'lb'))}
          </div>
          <div class="card-title second">{i18n.t('language')}</div>
          <div class="select-wrap">
            <div ref={this.langRef} class={{ select: true, open: this.langOpen }}>
              <span class="select-value">{m.lang.map((l) => LANGUAGES.find((x) => x.id === l)?.name ?? l)}</span>
              <span class="select-caret">{this.langOpen.map((o) => (o ? '▴' : '▾'))}</span>
            </div>
            <div class={{ 'select-list': true, hidden: this.langOpen.map((o) => !o) }}>
              {LANGUAGES.map((lang) => {
                const ref = FSComponent.createRef<HTMLDivElement>();
                this.langOpts.push({ id: lang.id, ref });
                return <div ref={ref} class={{ 'select-opt': true, active: m.lang.map((l) => l === lang.id) }}>{lang.name}</div>;
              })}
            </div>
          </div>
        </Card>
        <Card title={i18n.t(m.classic ? 'about' : 'cockpit')}>
          <div class={{ hidden: m.classic }}>
            <div class="segmented">
              {opt('modern', 'Modernized', m.cockpit.map((c) => c === 'modern'))}
              {opt('classic', 'Classic', m.cockpit.map((c) => c === 'classic'))}
            </div>
            <div class="dim-text">{i18n.t('cockpitHint')}</div>
            <div class={{ note: true, warn: true, hidden: this.cockpitRefused.map((r) => !r) }}>{i18n.t('cockpitGround')}</div>
            <div class="card-title second">{i18n.t('about')}</div>
          </div>
          <div class="about">{i18n.t('aboutLine1')}</div>
          <div class="about dim-text">{MappedSubject.create(([noFms]) => i18n.now(noFms ? 'aboutLine2Classic' : 'aboutLine2'), m.noFms, m.lang)}</div>
        </Card>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    const m = this.props.model;
    const el = this.track.instance;
    let drag = false;
    const setFrom = (x: number): void => {
      const r = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width)));
      m.brightness.set(Math.round((0.2 + 0.8 * t) * 100) / 100);
    };
    el.addEventListener('mousedown', (e) => { drag = true; setFrom((e as MouseEvent).clientX); });
    el.addEventListener('mousemove', (e) => { if (drag) { setFrom((e as MouseEvent).clientX); } });
    el.addEventListener('mouseup', () => { drag = false; });
    el.addEventListener('mouseleave', () => { drag = false; });
    onTap(this.offBtn.instance, () => m.screenOn.set(false));
    onTap(this.stowBtn.instance, () => m.toggleStowed());
    onTap(this.seg.get('kg')!.instance, () => m.units.set('kg'));
    onTap(this.seg.get('lb')!.instance, () => m.units.set('lb'));
    for (const c of ['modern', 'classic'] as const) {
      onTap(this.seg.get(c)!.instance, () => {
        const ok = m.setCockpit(c);
        this.cockpitRefused.set(!ok);
        window.clearTimeout(this.refusedTimer);
        if (!ok) {
          this.refusedTimer = window.setTimeout(() => this.cockpitRefused.set(false), 4000);
        }
      });
    }
    onTap(this.langRef.instance, () => this.langOpen.set(!this.langOpen.get()));
    for (const { id, ref } of this.langOpts) {
      onTap(ref.instance, () => {
        m.lang.set(id);
        this.langOpen.set(false);
      });
    }
  }
}

/** The on-screen keyboard (the tablet has no physical one): letters, digits and the characters of SimBrief usernames. */
class Keyboard extends DisplayComponent<ComponentProps & { i18n: I18n }> {
  private readonly shown = Subject.create(false);
  private readonly title = Subject.create<StringKey>('sbUser');
  private readonly value = Subject.create('');
  private done: (v: string) => void = () => { /* set by open() */ };
  /** Capitals (ICAO codes) instead of the lower case of SimBrief usernames. */
  private upper = false;
  private readonly keys: { k: string; ref: NodeReference<HTMLDivElement> }[] = [];

  /** Shows the keyboard with a starting value; `done` gets the text on OK. */
  public open(title: StringKey, value: string, done: (v: string) => void, upper = false): void {
    this.upper = upper;
    this.title.set(title);
    this.value.set(value);
    this.done = done;
    this.shown.set(true);
  }

  /** @inheritdoc */
  public render(): VNode {
    const i18n = this.props.i18n;
    const key = (k: string, label: string | Subscribable<string> = k, cls = ''): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.keys.push({ k, ref });
      return <div ref={ref} class={`key ${cls}`}>{label}</div>;
    };
    const row = (chars: string): VNode => <div class="krow">{chars.split('').map((c) => key(c))}</div>;
    return (
      <div class={{ kb: true, hidden: this.shown.map((v) => !v) }}>
        <div class="kb-box">
          <div class="card-title">{MappedSubject.create(([t]) => i18n.now(t), this.title, i18n.lang)}</div>
          <div class="kb-input">{this.value}<span class="caret">|</span></div>
          {row('1234567890')}
          {row('QWERTYUIOP')}
          {row('ASDFGHJKL_')}
          <div class="krow">{'ZXCVBNM.-'.split('').map((c) => key(c))}{key('BACK', '⌫', 'wide')}</div>
          <div class="krow">{key('CANCEL', i18n.t('kbCancel'), 'act')}{key('OK', i18n.t('kbOk'), 'act primary')}</div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    for (const { k, ref } of this.keys) {
      onTap(ref.instance, () => {
        if (k === 'BACK') {
          this.value.set(this.value.get().slice(0, -1));
        } else if (k === 'CANCEL') {
          this.shown.set(false);
        } else if (k === 'OK') {
          this.shown.set(false);
          this.done(this.value.get().trim());
        } else if (this.value.get().length < 32) {
          this.value.set(this.value.get() + (this.upper ? k : k.toLowerCase()));
        }
      });
    }
  }
}

type LoadedOfp = NonNullable<ReturnType<TabletModel['ofp']['get']>>;

/** Flight: the latest SimBrief OFP (route, fuel, weights) and sending its route to the FMS. */
class FlightPage extends DisplayComponent<TabletProps & { keyboard: (title: StringKey, value: string, done: (v: string) => void) => void }> {
  private readonly buttons: { act: () => void; ref: NodeReference<HTMLDivElement> }[] = [];

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    const button = (label: Subscribable<string>, act: () => void, cls: string | Subscribable<string> = ''): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.buttons.push({ act, ref });
      return <div ref={ref} class={typeof cls === 'string' ? `button ${cls}` : cls.map((c) => `button ${c}`)}>{label}</div>;
    };
    const askUser = (): void => this.props.keyboard('sbUser', m.simbriefUser.get(), (v) => {
      m.simbriefUser.set(v);
      if (v) {
        void m.loadOfp();
      }
    });
    const ofp = (f: (o: LoadedOfp) => string): Subscribable<string> => m.ofp.map((o) => (o ? f(o) : ''));
    const w = (f: (o: LoadedOfp) => number): Subscribable<string> =>
      MappedSubject.create(([o, u, l]) => (o ? `${TabletModel.weight(f(o), u, l)} ${u}` : ''), m.ofp, m.units, m.lang);
    const hm = (s: number): string => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;
    // recomputed on a language change too (i18n.now reads it)
    const status = MappedSubject.create(([st, err]) => {
      if (st === 'loading') {
        return i18n.now('sbFetching');
      }
      return st === 'error' ? (err === 'net' ? i18n.now('sbErrNet') : `${i18n.now('sbErr')} ${err}`) : '';
    }, m.ofpState, m.ofpError, m.lang);
    const sendText = MappedSubject.create(([st, progress, r]) => {
      if (st === 'sending') {
        return `${i18n.now('sbSending')} ${progress[0]}/${progress[1]}`;
      }
      if (st === 'sent' && r) {
        const coords = r.byCoordinates ? ` (${r.byCoordinates} ${i18n.now('sbByCoords')})` : '';
        return `${i18n.now('sbSent')} ${r.legs} ${i18n.now('sbPoints')}${coords}. ${i18n.now('sbCheckFpln')}`;
      }
      return st === 'error' ? i18n.now('sbSendErr') : '';
    }, m.sendState, m.sendProgress, m.sendResult, m.lang);
    const noOfp = m.ofp.map((o) => o === null);
    return (
      <div class="flight">
        <div class={{ 'sb-empty': true, hidden: noOfp.map((v) => !v) }}>
          <div class="sb-logo">SimBrief</div>
          <div class={{ 'sb-msg': true, hidden: m.simbriefUser.map((u) => u !== '') }}>{i18n.t('sbNoUser')}</div>
          <div class={{ 'sb-user': true, hidden: m.simbriefUser.map((u) => u === '') }}>{i18n.t('sbUser')}: <b>{m.simbriefUser}</b></div>
          <div class="sb-actions">
            <div class={{ 'sb-fetch': true, hidden: m.simbriefUser.map((u) => u === '') }}>{button(i18n.t('sbFetch'), () => void m.loadOfp(), 'primary')}</div>
            {button(MappedSubject.create(([u]) => i18n.now(u ? 'sbChangeUser' : 'sbSetUser'), m.simbriefUser, m.lang), askUser)}
          </div>
          <div class="sb-status">{status}</div>
        </div>
        <div class={{ 'sb-ofp': true, hidden: noOfp }}>
          <div class="row">
            <Card title={i18n.t('sbRoute')} class="sb-route">
              <div class="sb-pair">{ofp((o) => `${o.origin} ${o.originRwy}`)}<span class="sb-arrow">{'→'}</span>{ofp((o) => `${o.dest} ${o.destRwy}`)}</div>
              <div class="sub">{ofp((o) => `${o.originName} → ${o.destName}`)}</div>
              <div class="sb-text">{ofp((o) => o.routeText)}</div>
              <div class="sb-stats">
                <div class="stat"><span>{i18n.t('sbAltn')}</span><b>{ofp((o) => o.altn || '-')}</b></div>
                <div class="stat"><span>{i18n.t('sbDist')}</span><b>{ofp((o) => `${Math.round(o.distanceNm)} nm`)}</b></div>
                <div class="stat"><span>{i18n.t('sbCruise')}</span><b>{ofp((o) => `FL${String(Math.round(o.cruiseFt / 100)).padStart(3, '0')}`)}</b></div>
                <div class="stat"><span>{i18n.t('sbEte')}</span><b>{ofp((o) => hm(o.eteSec))}</b></div>
              </div>
              <div class={{ note: true, hidden: m.ofp.map((o) => !o || o.aircraftIcao !== 'F50') }}>{i18n.t('sbF50')}</div>
            </Card>
            <Card title={i18n.t('sbFuelWeights')} class="sb-fuel">
              <div class="kv"><span>{i18n.t('sbBlock')}</span><b>{w((o) => o.fuelBlockLb)}</b></div>
              <div class="kv"><span>{i18n.t('sbTrip')}</span><b>{w((o) => o.fuelTripLb)}</b></div>
              <div class="kv"><span>{i18n.t('sbReserve')}</span><b>{w((o) => o.fuelReserveLb)}</b></div>
              <div class="kv"><span>{i18n.t('sbAltnFuel')}</span><b>{w((o) => o.fuelAltnLb)}</b></div>
              <div class="kv sep"><span>ZFW</span><b>{w((o) => o.zfwLb)}</b></div>
              <div class="kv"><span>TOW</span><b>{w((o) => o.towLb)}</b></div>
              <div class="kv"><span>LDW</span><b>{w((o) => o.ldwLb)}</b></div>
              <div class="kv"><span>{i18n.t('sbPax')}</span><b>{ofp((o) => String(o.pax))}</b></div>
            </Card>
          </div>
          <div class="sb-bar">
            {button(i18n.t('sbSend'), () => void m.sendRoute(), m.noFms.map((n) => (n ? 'primary send hidden' : 'primary send')))}
            {button(i18n.t('sbRefetch'), () => void m.loadOfp())}
            {button(i18n.t('sbChangeUser'), askUser)}
          </div>
          <div class="sb-status">{MappedSubject.create(([a, b]) => b || a, status, sendText)}</div>
          <div class={{ 'sb-status': true, hidden: m.noFms.map((n) => !n) }}>{i18n.t('sbClassicNoFms')}</div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    for (const { act, ref } of this.buttons) {
      onTap(ref.instance, act);
    }
  }
}

const CL_PAGE = 13;

/** Checklist: the sections on the left with their progress, the open one's items on the right (tap to tick), then the limitations. */
class ChecklistPage extends DisplayComponent<TabletProps> {
  private readonly sectionRefs: NodeReference<HTMLDivElement>[] = [];
  private readonly slotRefs: NodeReference<HTMLDivElement>[] = [];
  private readonly buttons: { act: () => void; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly page = Subject.create(0);
  private readonly slots = Array.from({ length: CL_PAGE }, () => ({
    item: Subject.create(''), action: Subject.create(''), ticked: Subject.create(false), auto: Subject.create(false), shown: Subject.create(false),
  }));

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    const cl = m.checklist;
    const button = (label: string | Subscribable<string>, act: () => void, cls = ''): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.buttons.push({ act, ref });
      return <div ref={ref} class={`button ${cls}`}>{label}</div>;
    };
    const sectionRow = (i: number, title: string | Subscribable<string>, progress: Subscribable<string>, done: Subscribable<boolean>): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.sectionRefs[i] = ref;
      return (
        <div ref={ref} class={{ clsec: true, active: cl.open.map((o) => o === i), done }}>
          <span class="clsec-title">{title}</span>
          <span class="clsec-n">{progress}</span>
        </div>
      );
    };
    const pages = cl.open.map((o) => (o < CHECKLIST.length ? Math.ceil(CHECKLIST[o].items.length / CL_PAGE) : 1));
    const onLimits = cl.open.map((o) => o >= CHECKLIST.length);
    return (
      <div class="checklist">
        <div class="clsecs">
          {CHECKLIST.map((sec, i) => sectionRow(i, sec.title,
            cl.ticked[i].map((t) => `${t.filter((x) => x).length}/${t.length}`), cl.ticked[i].map((t) => t.every((x) => x))))}
          {sectionRow(CHECKLIST.length, i18n.t('clLimitations'), Subject.create(''), Subject.create(false))}
        </div>
        <div class="clbody">
          <div class={{ clitems: true, hidden: onLimits }}>
            <div class="clhead">
              <span>{cl.open.map((o) => (o < CHECKLIST.length ? CHECKLIST[o].title.toUpperCase() : ''))}</span>
              <span>{MappedSubject.create(([p, n]) => (n > 1 ? `${p + 1}/${n}` : ''), this.page, pages)}</span>
            </div>
            <div class="clrows">
              {this.slots.map((sl, k) => {
                const ref = FSComponent.createRef<HTMLDivElement>();
                this.slotRefs[k] = ref;
                return (
                  <div ref={ref} class={{ clrow: true, ticked: sl.ticked, hidden: sl.shown.map((v) => !v) }}>
                    <div class="clbox">{sl.ticked.map((t) => (t ? '✓' : ''))}</div>
                    <div class="clitem">{sl.item}</div>
                    <div class={{ clauto: true, hidden: sl.auto.map((a) => !a) }}>AUTO</div>
                    <div class="claction">{sl.action}</div>
                  </div>
                );
              })}
            </div>
            <div class="clbar">
              <div class={{ clpgs: true, hidden: pages.map((n) => n < 2) }}>
                {button('▲', () => this.page.set(Math.max(0, this.page.get() - 1)), 'clpg')}
                {button('▼', () => this.page.set(Math.min(pages.get() - 1, this.page.get() + 1)), 'clpg')}
              </div>
              {button(i18n.t('clReset'), () => cl.reset(cl.open.get()))}
              {button(i18n.t('clResetAll'), () => cl.reset())}
              {button(i18n.t('clNext'), () => this.openSection(cl.open.get() + 1), 'primary clnext')}
            </div>
          </div>
          {/* v10.6: the engines' limits from the maintenance manual beside the aircraft's */}
          <div class={{ cllimits: true, hidden: onLimits.map((v) => !v) }}>
            <div class="cllim-col">
              <div class="clhead"><span>{i18n.t('clLimitations').map((s) => s.toUpperCase())}</span></div>
              {LIMITATIONS.map(([k, v]) => <div class="cllim"><span>{k}</span><b>{v}</b></div>)}
            </div>
            <div class="cllim-col eng">
              <div class="clhead"><span>{i18n.t('clEngineLimits').map((s) => s.toUpperCase())}</span></div>
              {ENGINE_LIMITATIONS.map(([k, v]) => <div class="cllim"><span>{k}</span><b>{v}</b></div>)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** Opens a section (the limitations after the last one) on its first page. */
  private openSection(i: number): void {
    this.page.set(0);
    this.props.model.checklist.open.set(Math.min(CHECKLIST.length, i));
  }

  /** Fills the item rows from the open section and page. */
  private refresh(): void {
    const cl = this.props.model.checklist, o = cl.open.get();
    const items = o < CHECKLIST.length ? CHECKLIST[o].items : [];
    const ticked = o < CHECKLIST.length ? cl.ticked[o].get() : [];
    this.slots.forEach((sl, k) => {
      const idx = this.page.get() * CL_PAGE + k, it = items[idx];
      sl.shown.set(!!it);
      sl.item.set(it ? it.item : '');
      sl.action.set(it ? it.action : '');
      sl.auto.set(!!(it && it.auto));
      sl.ticked.set(!!ticked[idx]);
    });
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    const cl = this.props.model.checklist;
    const refresh = (): void => this.refresh();
    cl.open.sub(refresh);
    this.page.sub(refresh);
    cl.ticked.forEach((t) => t.sub(refresh));
    refresh();
    this.sectionRefs.forEach((ref, i) => onTap(ref.instance, () => this.openSection(i)));
    this.slotRefs.forEach((ref, k) => onTap(ref.instance, () => {
      const o = cl.open.get(), p = this.page.get(), idx = p * CL_PAGE + k;
      if (o >= CHECKLIST.length || idx >= CHECKLIST[o].items.length) {
        return;
      }
      cl.toggle(o, idx);
      // the page done by hand: on to the next one
      const t = cl.ticked[o].get(), last = Math.min(t.length, (p + 1) * CL_PAGE);
      if (t[idx] && last < t.length && t.slice(p * CL_PAGE, last).every((x) => x)) {
        this.page.set(p + 1);
      }
    }));
    for (const { act, ref } of this.buttons) {
      onTap(ref.instance, act);
    }
  }
}

const CH_ROWS = 9;
/** The map's ranges, from the aircraft to the top edge, in nautical miles. */
const MAP_RANGES = [1, 2, 5, 10, 20, 40, 80, 160];
const CH_GROUPS: [ChartGroup, StringKey][] = [['airport', 'chGrpAirport'], ['dep', 'chGrpDep'], ['arr', 'chGrpArr'], ['app', 'chGrpApp']];

/**
 * Charts: the sim's own LIDO / FAA charts of an airport (no subscription needed), the list by group on the left and the chart on the
 * right: drag to move it, - / + to zoom, full screen hides the list. v10.10: the aircraft drawn on georeferenced pages, and a button
 * that brings it to the middle.
 */
class ChartsPage extends DisplayComponent<TabletProps & {
  keyboard: (title: StringKey, value: string, done: (v: string) => void, upper?: boolean) => void;
  shown: Subscribable<boolean>;
  map: TabletMap;
}> {
  private readonly buttons: { act: () => void; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly rowRefs: NodeReference<HTMLDivElement>[] = [];
  private readonly aptRef = FSComponent.createRef<HTMLDivElement>();
  private readonly boxRef = FSComponent.createRef<HTMLDivElement>();
  private readonly imgRef = FSComponent.createRef<HTMLImageElement>();
  private readonly shipRef = FSComponent.createRef<HTMLDivElement>();
  /** The aircraft is on the page on screen (a georeferenced area holds it). */
  private readonly shipOn = Subject.create(false);
  /** v10.11 (test 17, no aircraft on SBCT's ground chart): why not, said in the header in place of the drag hint ('' when it is shown). */
  private readonly shipNote = Subject.create('');
  /** v10.10: the map instead of the chart (the Map button), and its range (an index of MAP_RANGES). */
  private readonly mapRef = FSComponent.createRef<HTMLDivElement>();
  private readonly mapMode = Subject.create(false);
  private readonly mapRange = Subject.create(3);
  private readonly listPage = Subject.create(0);
  private readonly expanded = Subject.create(false);
  private readonly rows = Array.from({ length: CH_ROWS }, () => ({ name: Subject.create(''), shown: Subject.create(false), active: Subject.create(false) }));
  private readonly inGroup = MappedSubject.create(([list, g]) => list.filter((c) => c.group === g), this.props.model.charts.charts, this.props.model.charts.group);
  // the page on screen: zoom 1 = the page's width fills the box; x / y = the image's top-left corner in the box (px)
  private zoom = 1;
  private x = 0;
  private y = 0;
  private drag: [number, number] | null = null;

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    const ch = m.charts;
    const tappable = (node: VNode, act: () => void, ref = FSComponent.createRef<HTMLDivElement>()): VNode => {
      this.buttons.push({ act, ref });
      return node;
    };
    const button = (label: string | Subscribable<string>, act: () => void, cls = ''): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      return tappable(<div ref={ref} class={`button ${cls}`}>{label}</div>, act, ref);
    };
    const opt = (label: string | Subscribable<string>, act: () => void, active: Subscribable<boolean>): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      return tappable(<div ref={ref} class={{ opt: true, active }}>{label}</div>, act, ref);
    };
    // the OFP's airports, one tap away
    const quick = (label: string, f: (o: LoadedOfp) => string): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      const ident = m.ofp.map((o) => (o ? f(o) : ''));
      return tappable(
        <div ref={ref} class={{ chq: true, hidden: ident.map((a) => a === ''), active: MappedSubject.create(([a, cur]) => a !== '' && a === cur, ident, ch.airport) }}>
          <span>{label}</span>{ident}
        </div>,
        () => { if (ident.get()) { void ch.open(ident.get()); } }, ref);
    };
    const listCount = this.inGroup.map((l) => Math.ceil(l.length / CH_ROWS));
    // recomputed on a language change too (i18n.now reads it)
    const listMsg = MappedSubject.create(([st, inGroup, prov]) => {
      switch (st) {
        case 'idle': return i18n.now('chPick');
        case 'loading': return i18n.now('chLoading');
        case 'none': return prov === 'FAA' ? `${i18n.now('chNone')} ${i18n.now('chFaaHint')}` : i18n.now('chNone');
        case 'error': return i18n.now('chError');
        default: return inGroup.length === 0 ? i18n.now('chEmptyGroup') : '';
      }
    }, ch.state, this.inGroup, ch.provider, m.lang);
    const viewMsg = MappedSubject.create(([sel, st, img, listState]) => {
      if (!sel) {
        return listState === 'ready' ? i18n.now('chChoose') : '';
      }
      if (st === 'error' || st === 'none' || img.errorCode !== 0) {
        return i18n.now('chImgError');
      }
      return img.imageUrl === '' ? i18n.now('chPageLoading') : '';
    }, ch.selected, ch.pageState, ch.image, ch.state, m.lang);
    const noNight = MappedSubject.create(([pages, i]) => !pages[i] || pages[i].night === '', ch.pages, ch.pageIndex);
    return (
      <div class="charts">
        <div class={{ chside: true, hidden: this.expanded }}>
          <div class="chtop">
            <div ref={this.aptRef} class="chapt"><span class="chapt-label">{i18n.t('chAirport')}</span><b>{ch.airport.map((a) => a || '----')}</b></div>
            <div class="segmented chprov">
              {opt('LIDO', () => ch.setProvider('LIDO'), ch.provider.map((p) => p === 'LIDO'))}
              {opt('FAA', () => ch.setProvider('FAA'), ch.provider.map((p) => p === 'FAA'))}
            </div>
          </div>
          <div class={{ chquick: true, hidden: m.ofp.map((o) => !o) }}>
            {quick('ORIG', (o) => o.origin)}{quick('DEST', (o) => o.dest)}{quick('ALTN', (o) => o.altn)}
          </div>
          <div class="segmented chgroups">
            {CH_GROUPS.map(([g, key]) => opt(i18n.t(key), () => { ch.group.set(g); this.listPage.set(0); }, ch.group.map((cur) => cur === g)))}
          </div>
          <div class="chlist">
            {this.rows.map((r, k) => {
              const ref = FSComponent.createRef<HTMLDivElement>();
              this.rowRefs[k] = ref;
              return <div ref={ref} class={{ chitem: true, active: r.active, hidden: r.shown.map((v) => !v) }}>{r.name}</div>;
            })}
            <div class={{ chmsg: true, hidden: listMsg.map((s) => s === '') }}>{listMsg}</div>
          </div>
          <div class={{ chpager: true, hidden: listCount.map((n) => n < 2) }}>
            {button('▲', () => this.listPage.set(Math.max(0, this.listPage.get() - 1)))}
            <div class="chpager-n">{MappedSubject.create(([p, n]) => `${p + 1}/${n}`, this.listPage, listCount)}</div>
            {button('▼', () => this.listPage.set(Math.min(listCount.get() - 1, this.listPage.get() + 1)))}
          </div>
        </div>
        <div class="chview">
          <div class="chhead">
            <span class="chname">{MappedSubject.create(([a, s, mm, r]) => (mm ? `${i18n.now('chMap')}  ·  ${MAP_RANGES[r]} NM` : s ? `${a}  ·  ${s.name}` : ''),
              ch.airport, ch.selected, this.mapMode, this.mapRange, m.lang)}</span>
            <span class={{ chhint: true, warn: this.shipNote.map((s) => s !== ''), hidden: MappedSubject.create(([img, mm]) => img.imageUrl === '' || mm, ch.image, this.mapMode) }}>
              {MappedSubject.create(([note]) => note || i18n.now('chDrag'), this.shipNote, m.lang)}
            </span>
          </div>
          <div ref={this.boxRef} class="chbox">
            <img ref={this.imgRef} class={{ chimg: true, hidden: MappedSubject.create(([img, mm]) => img.imageUrl === '' || mm, ch.image, this.mapMode) }}
              src={ch.image.map((img) => img.imageUrl)} draggable="false" />
            <div ref={this.shipRef} class={{ chship: true, hidden: MappedSubject.create(([on, mm]) => !on || mm, this.shipOn, this.mapMode) }}>
              <svg viewBox="-20 -20 40 40"><path d="M0 -17 L2.6 -7 L15 1 L15 4.5 L2.6 1 L1.8 11 L6.5 14.5 L6.5 17 L0 15.2 L-6.5 17 L-6.5 14.5 L-1.8 11 L-2.6 1 L-15 4.5 L-15 1 L-2.6 -7 Z" /></svg>
            </div>
            <div class={{ chmsg: true, hidden: MappedSubject.create(([s, mm]) => s === '' || mm, viewMsg, this.mapMode) }}>{viewMsg}</div>
            <div ref={this.mapRef} class={{ chmap: true, hidden: this.mapMode.map((v) => !v) }}></div>
          </div>
          <div class="chtools">
            {button(MappedSubject.create(([e]) => i18n.now(e ? 'chList' : 'chFull'), this.expanded, m.lang), () => this.expanded.set(!this.expanded.get()), 'chwide')}
            {button(MappedSubject.create(([mm]) => i18n.now(mm ? 'chChart' : 'chMap'), this.mapMode, m.lang), () => this.toggleMap(), 'chmapbtn')}
            <div class={{ chgroup: true, hidden: this.mapMode }}>
              {button('‹', () => ch.showPage(ch.pageIndex.get() - 1), 'chsm')}
              <div class="chpage-n">{MappedSubject.create(([pages, i]) => (pages.length ? `${i + 1}/${pages.length}` : ''), ch.pages, ch.pageIndex)}</div>
              {button('›', () => ch.showPage(ch.pageIndex.get() + 1), 'chsm')}
            </div>
            {button('−', () => this.zoomBy(1 / 1.25), 'chsm')}
            {button('+', () => this.zoomBy(1.25), 'chsm')}
            <div class={{ chgroup: true, hidden: this.mapMode }}>
              {button(i18n.t('chFit'), () => this.fit())}
              <div class={{ chshipbtn: true, hidden: this.shipOn.map((v) => !v) }}>{button('✈', () => this.centreOnShip(), 'chsm')}</div>
              <div class={{ chnight: true, hidden: noNight }}>
                {button(MappedSubject.create(([n]) => i18n.now(n ? 'chDay' : 'chNight'), ch.night, m.lang), () => ch.toggleNight())}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** The open page's height over width (charts are portrait; landscape ones exist). */
  private aspect(): number {
    const ch = this.props.model.charts, p = ch.pages.get()[ch.pageIndex.get()];
    return p && p.width > 0 ? p.height / p.width : 1.414;
  }

  /** Places the image: sized from the zoom, kept on the box (centred on an axis where it is smaller than the box). */
  private apply(): void {
    const box = this.boxRef.instance, bw = box.clientWidth, bh = box.clientHeight;
    if (bw === 0) {
      return;   // the page is hidden: placed again when it shows
    }
    const w = bw * this.zoom, h = w * this.aspect();
    const clamp = (pos: number, size: number, room: number): number => (size <= room ? (room - size) / 2 : Math.min(0, Math.max(room - size, pos)));
    this.x = clamp(this.x, w, bw);
    this.y = clamp(this.y, h, bh);
    const s = this.imgRef.instance.style;
    s.left = `${this.x.toFixed(1)}px`;
    s.top = `${this.y.toFixed(1)}px`;
    s.width = `${w.toFixed(1)}px`;
    s.height = `${h.toFixed(1)}px`;
    this.placeShip();
  }

  /** The aircraft on the page on screen, if a georeferenced area of it holds the aircraft. */
  private shipFix(): ChartFix | null {
    const m = this.props.model, ch = m.charts, page = ch.pages.get()[ch.pageIndex.get()];
    if (!page || ch.image.get().imageUrl === '') {
      return null;
    }
    const [lat, lon, hdg] = m.position.get();
    return onChart(page, lat, lon, hdg);
  }

  /** Draws the aircraft on the image, wherever the image is dragged or zoomed to. */
  private placeShip(): void {
    const fix = this.shipFix(), ch = this.props.model.charts, page = ch.pages.get()[ch.pageIndex.get()], i18n = this.props.i18n;
    this.shipOn.set(!!fix);
    this.shipNote.set(fix || !page ? '' : page.geo.length === 0
      ? `${i18n.now('chNoGeo')} (0 / ${page.areas} ${i18n.now('chAreas')})` : i18n.now('chOutside'));
    const bw = this.boxRef.instance.clientWidth;
    if (!fix || bw === 0) {
      return;
    }
    const w = bw * this.zoom, h = w * this.aspect();
    const px = this.x + (fix.x / page.width) * w, py = this.y + (fix.y / page.height) * h;
    this.shipRef.instance.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${fix.deg.toFixed(0)}deg)`;
  }

  /** Shows the map instead of the chart, or the chart again (the map is made the first time). */
  private toggleMap(): void {
    const on = !this.mapMode.get();
    this.mapMode.set(on);
    if (on) {
      this.props.map.attach(this.mapRef.instance);
      this.props.map.setRange(MAP_RANGES[this.mapRange.get()]);
      this.sizeMap();
    }
    this.props.map.setAwake(on && this.props.shown.get());
  }

  /** The map's size follows the box (the chart view, or full screen). */
  private sizeMap(): void {
    const box = this.boxRef.instance;
    if (box.clientWidth > 0) {
      this.props.map.setSize(box.clientWidth, box.clientHeight);
    }
  }

  /** Brings the aircraft to the middle of the box. */
  private centreOnShip(): void {
    const fix = this.shipFix(), ch = this.props.model.charts, page = ch.pages.get()[ch.pageIndex.get()], box = this.boxRef.instance;
    if (fix) {
      const w = box.clientWidth * this.zoom, h = w * this.aspect();
      this.x = box.clientWidth / 2 - (fix.x / page.width) * w;
      this.y = box.clientHeight / 2 - (fix.y / page.height) * h;
      this.apply();
    }
  }

  /** Page width across the box, from the top. */
  private fit(): void {
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
    this.apply();
  }

  /** Zooms about the middle of the box (on the map: the next range in or out). */
  private zoomBy(f: number): void {
    if (this.mapMode.get()) {
      this.mapRange.set(Math.max(0, Math.min(MAP_RANGES.length - 1, this.mapRange.get() + (f > 1 ? -1 : 1))));
      this.props.map.setRange(MAP_RANGES[this.mapRange.get()]);
      return;
    }
    const box = this.boxRef.instance, cx = box.clientWidth / 2, cy = box.clientHeight / 2;
    const z = Math.min(4, Math.max(0.4, this.zoom * f)), k = z / this.zoom;
    this.x = cx - (cx - this.x) * k;
    this.y = cy - (cy - this.y) * k;
    this.zoom = z;
    this.apply();
  }

  /** Fills the list rows from the group and list page. */
  private refresh(): void {
    const list = this.inGroup.get(), sel = this.props.model.charts.selected.get();
    if (this.listPage.get() > 0 && this.listPage.get() * CH_ROWS >= list.length) {
      this.listPage.set(0);
      return;   // refreshed again by the page change
    }
    this.rows.forEach((r, k) => {
      const c = list[this.listPage.get() * CH_ROWS + k];
      r.shown.set(!!c);
      r.name.set(c ? c.name : '');
      r.active.set(!!c && !!sel && c.guid === sel.guid);
    });
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    const { model: m } = this.props;
    const ch = m.charts;
    const refresh = (): void => this.refresh();
    this.inGroup.sub(refresh);
    this.listPage.sub(refresh);
    ch.selected.sub(refresh);
    refresh();
    // a new chart or page starts across the box; the night image of the same page keeps the view
    ch.pages.sub(() => this.fit());
    ch.pageIndex.sub(() => this.fit());
    this.expanded.sub(() => this.fit());
    m.position.sub(() => this.placeShip());
    ch.image.sub(() => this.placeShip());
    this.props.shown.sub((v) => {
      if (v) {
        const o = m.ofp.get();
        if (ch.airport.get() === '' && o) {
          void ch.open(o.origin);
        }
        this.fit();
        // the app unhides the page after this callback (its own subscription): place the chart and the aircraft again once laid out
        window.setTimeout(() => {
          this.apply();
          this.sizeMap();
        }, 50);
      }
      this.props.map.setAwake(v && this.mapMode.get());
    });
    this.expanded.sub(() => window.setTimeout(() => this.sizeMap(), 50));
    onTap(this.aptRef.instance, () => this.props.keyboard('chAirport', '', (v) => { if (v) { void ch.open(v); } }, true));
    this.rowRefs.forEach((ref, k) => onTap(ref.instance, () => {
      const c = this.inGroup.get()[this.listPage.get() * CH_ROWS + k];
      if (c) {
        void ch.select(c);
      }
    }));
    for (const { act, ref } of this.buttons) {
      onTap(ref.instance, act);
    }
    // drag the chart around (a click held on the 3D screen moves like a finger)
    const box = this.boxRef.instance;
    box.addEventListener('mousedown', (e) => { e.preventDefault(); this.drag = [e.clientX, e.clientY]; });
    box.addEventListener('mousemove', (e) => {
      if (this.drag) {
        this.x += e.clientX - this.drag[0];
        this.y += e.clientY - this.drag[1];
        this.drag = [e.clientX, e.clientY];
        this.apply();
      }
    });
    box.addEventListener('mouseup', () => { this.drag = null; });
    box.addEventListener('mouseleave', () => { this.drag = null; });
  }
}
