import { DisplayComponent, FSComponent, MappedSubject, NodeReference, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { StringKey } from './i18n';
import { TabletModel } from './model';
import { AppId, onTap, TabletProps } from './ui';

/** One ground service: its row and its marks on the plan view light up together; a tap on either works it. */
interface Service {
  key: StringKey;
  state: Subscribable<boolean>;
  on: StringKey;
  off: StringKey;
  act: () => void;
  needsGround: boolean;
  /** Colour family of the check and the marks: door, stair, chock, cover (red: remove before flight), gpu. */
  kind: string;
}

// Plan view, nose up, drawn from the aircraft model's own coordinates (metres; x > 0 is the aircraft's LEFT side, z forward): the
// screen's left is the aircraft's left, as seen from above.
const S = 23.5, CX = 380, NOSE_Z = 11.42, TOP = 80;
const X = (x: number): number => CX - x * S;
const Y = (z: number): number => TOP + (NOSE_Z - z) * S;
/** A closed path through [x, z] points, mirrored onto the right side when `mirror` (a half outline from the centre line). */
function outline(pts: [number, number][], mirror: boolean): string {
  const all = mirror ? [...pts, ...pts.slice().reverse().map(([x, z]): [number, number] => [-x, z])] : pts;
  return `M${all.map(([x, z]) => `${X(x).toFixed(1)} ${Y(z).toFixed(1)}`).join(' L')} Z`;
}
const FUSELAGE: [number, number][] = [[0, 11.42], [0.38, 11.2], [0.78, 10.8], [1.08, 10.2], [1.27, 9.4], [1.36, 8.4], [1.36, -5], [1.22, -7],
  [0.95, -9], [0.62, -11], [0.3, -12.8], [0.1, -13.6]];
const WING: [number, number][] = [[1.3, 2.05], [14.2, 0.98], [14.46, 0.7], [14.46, -0.4], [14.2, -0.62], [1.3, -1.55]];
const NACELLE: [number, number][] = [[0, 4.36], [0.18, 4.15], [0.3, 3.9], [0.39, 3.62], [0.48, 3.2], [0.48, 0], [0.45, -2], [0.25, -3], [0.08, -3.4]];
const TAILPLANE: [number, number][] = [[0.45, -9.8], [4.84, -11], [4.84, -12.05], [0.45, -12.4]];
const nacelle = (side: number): string => outline([...NACELLE.map(([w, z]): [number, number] => [side * 3.61 + w, z]),
  ...NACELLE.slice().reverse().map(([w, z]): [number, number] => [side * 3.61 - w, z])], false);
/** The same marks on both sides (sd = 1: left, -1: right). */
const both = (f: (sd: number) => VNode[]): VNode[] => f(1).concat(f(-1));
const wing = (side: number): string => outline(WING.map(([x, z]) => [side * x, z]), false);
const tail = (side: number): string => outline(TAILPLANE.map(([x, z]) => [side * x, z]), false);
/** A rectangle between two model points, as SVG attributes. */
const box = (x0: number, z0: number, x1: number, z1: number) => ({
  x: Math.min(X(x0), X(x1)), y: Math.min(Y(z0), Y(z1)), width: Math.max(3, Math.abs(X(x1) - X(x0))), height: Math.max(3, Math.abs(Y(z1) - Y(z0))),
});

/**
 * Ground services (v10.5, user: after the Hawker 800XP tablet): doors, stairs, chocks, pitot and engine covers, gear pins, ground
 * power and fuel, as a list beside a plan view of the F27; each lights up where it is on the aircraft. v10.10: the pushback under
 * the plan view (the author's own tug).
 */
export class GroundPage extends DisplayComponent<TabletProps & { open: (app: AppId) => void }> {
  private readonly rows: { item: Service; ref: NodeReference<HTMLDivElement> }[] = [];
  private readonly marks: { item: Service; ref: NodeReference<SVGGElement> }[] = [];
  private readonly fuelRef = FSComponent.createRef<HTMLDivElement>();
  /** v10.12: what the tug card works, pushing (the sim's tug or GSX's) or pulling (the tablet itself). */
  private readonly mode = Subject.create<'push' | 'pull'>('push');
  /** v10.10: the pushback buttons (the author's tug, see TabletModel.pushStraight). */
  private readonly pushRefs: { act: () => void; ref: NodeReference<HTMLDivElement> }[] = [];

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    const it: Record<string, Service> = {
      doorFwd: { key: 'doorFwd', state: m.doorFwdOpen, on: 'open', off: 'closed', act: () => m.toggleDoorFwd(), needsGround: true, kind: 'door' },
      doorCargo: { key: 'doorCargo', state: m.doorCargoOpen, on: 'open', off: 'closed', act: () => m.toggleDoorCargo(), needsGround: true, kind: 'door' },
      doorAft: { key: 'doorAft', state: m.doorAftOpen, on: 'open', off: 'closed', act: () => m.toggleDoorAft(), needsGround: true, kind: 'door' },
      stairFwd: { key: 'stairFwd', state: m.stairFwd, on: 'extended', off: 'stowed', act: () => m.toggleStairFwd(), needsGround: true, kind: 'stair' },
      stairAft: { key: 'stairAft', state: m.stairAft, on: 'extended', off: 'stowed', act: () => m.toggleStairAft(), needsGround: true, kind: 'stair' },
      chocks: { key: 'chocks', state: m.chocks, on: 'chocksIn', off: 'chocksOut', act: () => m.toggleChocks(), needsGround: true, kind: 'chock' },
      pitot: { key: 'pitotCovers', state: m.pitotCovers, on: 'coversOn', off: 'coversOff', act: () => m.togglePitotCovers(), needsGround: true, kind: 'cover' },
      engine: { key: 'engineCovers', state: m.engineCovers, on: 'coversOn', off: 'coversOff', act: () => m.toggleEngineCovers(), needsGround: true, kind: 'cover' },
      pins: { key: 'gearPins', state: m.gearPins, on: 'chocksIn', off: 'chocksOut', act: () => m.toggleGearPins(), needsGround: true, kind: 'cover' },
      gpu: { key: 'groundPower', state: m.powerSelector.map((v) => v === 2), on: 'connected', off: 'disconnected', act: () => m.toggleGroundPower(), needsGround: false, kind: 'gpu' },
    };
    const row = (s: Service): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.rows.push({ item: s, ref });
      return (
        <div ref={ref} class={{ 'sv-row': true, [s.kind]: true, on: s.state }}>
          <div class="sv-text">
            <div class="sv-label">{i18n.t(s.key)}</div>
            <div class="sv-state">{MappedSubject.create(([v]) => i18n.now(v ? s.on : s.off), s.state, m.lang)}</div>
          </div>
          <svg class="sv-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M7 12.5l3.2 3.2L17.2 8.8" /></svg>
        </div>
      );
    };
    // marks on the plan view: a group of shapes per service, lit with it
    const mark = (s: Service, shapes: VNode[]): VNode => {
      const ref = FSComponent.createRef<SVGGElement>();
      this.marks.push({ item: s, ref });
      return <g ref={ref} class={{ mk: true, [s.kind]: true, on: s.state }}>{shapes}</g>;
    };
    const rect = (b: ReturnType<typeof box>, rx = 2): VNode => <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={rx} />;
    const dot = (x: number, z: number, r = 6): VNode => <circle cx={X(x)} cy={Y(z)} r={r} />;
    const fuelLb = m.loader.fuel.map((f) => f.fuelLb);
    const blocked = MappedSubject.create(([g, gs]) => !(g && gs < 2), m.onGround, m.groundSpeedKt);
    const coversWarn = MappedSubject.create(([run, a, b, c]) => run && (a || b || c), m.enginesRunning, m.pitotCovers, m.engineCovers, m.gearPins);
    const pushBtn = (label: Subscribable<string>, act: () => void, cls = '', idle?: Subscribable<boolean>): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.pushRefs.push({ act, ref });
      const classes: Record<string, boolean | Subscribable<boolean>> = { button: true, 'push-btn': true, idle: idle ?? false };
      if (cls) {
        classes[cls] = true;
      }
      return <div ref={ref} class={classes}>{label}</div>;
    };
    // v10.11 (test 17, "não tem botão pra chamar"): the first button calls the tug (and pushes straight back); turning and stopping only
    // mean something once it pushes
    const idle = m.pushing.map((on) => !on);
    const stopIdle = MappedSubject.create(([on, called]) => !on && !called, m.pushing, m.pushCalled);
    // v10.11.1 (test 18): with GSX running, the card is GSX's (its menu and its departure state)
    const GSX_STATES: Record<number, StringKey> = { 1: 'gsxAvail', 2: 'gsxNotAvail', 3: 'gsxBypassed', 4: 'gsxRequested', 5: 'gsxPerforming', 6: 'gsxDone' };
    const pushState = MappedSubject.create(([gsx, dep, on, called, hdg]) => (gsx ? i18n.now(GSX_STATES[dep] ?? 'gsxOn')
      : on ? `${i18n.now('pushing')} ${String(hdg).padStart(3, '0')}°` : i18n.now(called ? 'pushCalled' : 'pushOff')),
    m.gsx, m.gsxDeparture, m.pushing, m.pushCalled, m.pushHeading, m.lang);
    const pushOn = MappedSubject.create(([gsx, dep, on]) => (gsx ? dep === 5 : on), m.gsx, m.gsxDeparture, m.pushing);
    const pushBrake = MappedSubject.create(([on, brake]) => on && brake, m.pushing, m.parkingBrake);
    const noNative = MappedSubject.create(([gsx, avail, on, called]) => !gsx && !avail && !on && !called, m.gsx, m.pushAvailable, m.pushing, m.pushCalled);
    // v10.12 (user: "teria como colocar uma opção além de empurrar, puxar o avião?"): Push or Pull, the tablet pulling by itself
    const mode = this.mode;
    const modeBtn = (which: 'push' | 'pull', key: StringKey): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.pushRefs.push({ act: () => mode.set(which), ref });
      return <div ref={ref} class={{ 'push-mode': true, on: mode.map((v) => v === which) }}>{i18n.t(key)}</div>;
    };
    const pull = m.pull;
    const pullIdle = pull.active.map((on) => !on);
    const PULL_STOPS: Record<string, StringKey> = { brake: 'pullBrake', chocks: 'pullChocks', air: 'pullAir', fast: 'pullFast', tug: 'pullTug' };
    const pullState = MappedSubject.create(([on, kt, st]) => (!on ? i18n.now('pullOff')
      : `${i18n.now('pulling')} ${kt.toFixed(1)} kt${st === 0 ? '' : ` · ${i18n.now(st < 0 ? 'pullTurnL' : 'pullTurnR')} ${Math.abs(st)}`}`),
    pull.active, pull.speedKt, pull.steps, m.lang);
    const cardState = MappedSubject.create(([md, p, q]) => (md === 'pull' ? q : p), mode, pushState, pullState);
    const cardOn = MappedSubject.create(([md, p, q]) => (md === 'pull' ? q : p), mode, pushOn, pull.active);
    return (
      <div class="services">
        <div class="sv-list">
          {row(it.doorFwd)}{row(it.doorCargo)}{row(it.doorAft)}
          {row(it.stairFwd)}{row(it.stairAft)}
          {row(it.chocks)}{row(it.pitot)}{row(it.engine)}{row(it.pins)}
          {row(it.gpu)}
          <div ref={this.fuelRef} class="sv-row fuel">
            <div class="sv-text">
              <div class="sv-label">{i18n.t('fuel')}</div>
              <div class="sv-state">{MappedSubject.create(([v, u, l]) => `${TabletModel.weight(v, u, l)} ${u} ${i18n.now('onBoard')}`, fuelLb, m.units, m.lang)}</div>
            </div>
            <div class="sv-go">{i18n.t('goWeights')}</div>
          </div>
          <div class="sv-notes">
            <div class={{ note: true, warn: true, red: true, hidden: coversWarn.map((w) => !w) }}>{i18n.t('coversWarning')}</div>
            <div class={{ note: true, hidden: blocked.map((b) => !b) }}>{i18n.t('notOnGround')}</div>
            <div class={{ note: true, warn: true, hidden: m.parkingBrake }}>{i18n.t('needBrake')}</div>
          </div>
        </div>
        <div class="sv-right">
          <svg class="sv-plan" viewBox="0 0 760 690">
            <path class="pl-body" d={wing(1)} /><path class="pl-body" d={wing(-1)} />
            <path class="pl-body" d={tail(1)} /><path class="pl-body" d={tail(-1)} />
            <path class="pl-body" d={outline(FUSELAGE, true)} />
            <rect class="pl-fin" {...box(0.14, -9.6, -0.14, -13.2)} />
            <path class="pl-body" d={nacelle(1)} /><path class="pl-body" d={nacelle(-1)} />
            <rect class="pl-prop" {...box(3.61 + 1.76, 3.92, 3.61 - 1.76, 3.84)} /><rect class="pl-prop" {...box(-3.61 + 1.76, 3.92, -3.61 - 1.76, 3.84)} />
            <path class="pl-glass" d={outline([[0.25, 9.35], [0.9, 9.0], [1.0, 8.6], [0.2, 8.75]], false)} />
            <path class="pl-glass" d={outline([[-0.25, 9.35], [-0.9, 9.0], [-1.0, 8.6], [-0.2, 8.75]], false)} />
            {/* doors on the left side: the big cargo door with the crew door in it, and the passenger door aft */}
            {mark(it.doorCargo, [rect({ x: X(1.36) - 8, y: Y(7.48), width: 7, height: Y(5.01) - Y(7.48) })])}
            {mark(it.doorFwd, [rect({ x: X(1.36) - 17, y: Y(7.31), width: 7, height: Y(6.66) - Y(7.31) })])}
            {mark(it.doorAft, [rect({ x: X(1.36) - 8, y: Y(-5.85), width: 7, height: Y(-6.66) - Y(-5.85) })])}
            {mark(it.stairFwd, [rect(box(2.65, 7.46, 1.75, 6.44), 3)])}
            {mark(it.stairAft, [rect(box(2.45, -5.76, 1.6, -6.77), 3)])}
            {/* v10.6: fore and aft of the main wheels only, as the maintenance manual's parking procedure says */}
            {mark(it.chocks, both((sd) => [rect(box(sd * 3.22, 0.36, sd * 4.0, 0.18)), rect(box(sd * 3.22, -0.46, sd * 4.0, -0.64))]))}
            {mark(it.pitot, [dot(0.95, 9.84, 5), dot(-0.95, 9.84, 5)])}
            {mark(it.engine, both((sd) => [rect(box(sd * 3.61 + 0.42, 3.66, sd * 3.61 - 0.42, 3.5)), rect(box(sd * 4.37, 1.2, sd * 4.22, 0.5))]))}
            {mark(it.pins, [dot(0.3, 9.8), dot(4.15, -0.14), dot(-4.15, -0.14)])}
            {mark(it.gpu, [rect(box(-1.57, 13.4, -3.24, 10.86), 4), <path d={`M${X(-2.2)} ${Y(10.86)} L${X(-1.5)} ${Y(9.2)} L${X(-1.18)} ${Y(7.37)}`} class="mk-line" />])}
            <g class={{ mk: true, fuel: true, on: m.loader.fuel.map((f) => f.active) }}>{rect(box(-3.4, -2.2, -3.82, -2.6), 3)}</g>
            <text x={X(-2.4)} y={Y(13.75)} class="pl-label">GPU</text>
            <text x={X(-3.61)} y={Y(-3.15)} class="pl-label">{i18n.t('fuel')}</text>
          </svg>
          <div class="push">
            <div class="push-head">
              <span class="push-title">{MappedSubject.create(([gsx, md]) => (gsx && md === 'push' ? `${i18n.now('tug')} · GSX` : i18n.now('tug')), m.gsx, mode, m.lang)}</span>
              <div class="push-modes">{modeBtn('push', 'pushMode')}{modeBtn('pull', 'pullMode')}</div>
              <span class={{ 'push-state': true, on: cardOn }}>{cardState}</span>
            </div>
            <div class={{ hidden: MappedSubject.create(([gsx, md]) => gsx || md !== 'push', m.gsx, mode) }}>
              <div class="push-btns">
                {pushBtn(m.lang.map(() => `◀ ${i18n.now('pushTailLeft')}`), () => m.pushTail('left'), '', idle)}
                {pushBtn(MappedSubject.create(([on]) => `▼ ${i18n.now(on ? 'pushStraight' : 'pushCall')}`, m.pushing, m.lang), () => m.pushStraight(), 'primary')}
                {pushBtn(m.lang.map(() => `${i18n.now('pushTailRight')} ▶`), () => m.pushTail('right'), '', idle)}
                {pushBtn(m.lang.map(() => `■ ${i18n.now('pushStop')}`), () => m.pushStop(), 'stop', stopIdle)}
              </div>
              <div class={{ note: true, hidden: MappedSubject.create(([on, called]) => on || called, m.pushing, m.pushCalled) }}>{i18n.t('pushHint')}</div>
              <div class={{ note: true, warn: true, hidden: noNative.map((v) => !v) }}>{i18n.t('pushNoNative')}</div>
              <div class={{ note: true, warn: true, hidden: pushBrake.map((b) => !b) }}>{i18n.t('pushBrake')}</div>
            </div>
            <div class={{ hidden: MappedSubject.create(([gsx, md]) => !gsx || md !== 'push', m.gsx, mode) }}>
              <div class="push-btns">
                {pushBtn(m.lang.map(() => `☰ ${i18n.now('gsxMenu')}`), () => m.gsxMenu(), 'primary')}
              </div>
              <div class="note">{i18n.t('gsxHint')}</div>
            </div>
            <div class={{ hidden: mode.map((md) => md !== 'pull') }}>
              <div class="push-btns">
                {pushBtn(m.lang.map(() => `◀ ${i18n.now('pullLeft')}`), () => pull.steer(-1), '', pullIdle)}
                {pushBtn(MappedSubject.create(([on]) => `▲ ${i18n.now(on ? 'pullStraight' : 'pullStart')}`, pull.active, m.lang), () => (pull.active.get() ? pull.steer(0) : m.pullStart()), 'primary')}
                {pushBtn(m.lang.map(() => `${i18n.now('pullRight')} ▶`), () => pull.steer(1), '', pullIdle)}
                {pushBtn(m.lang.map(() => `■ ${i18n.now('pullStop')}`), () => pull.stop(), 'stop', pullIdle)}
              </div>
              <div class={{ note: true, hidden: pull.active }}>{i18n.t('pullHint')}</div>
              <div class={{ note: true, warn: true, hidden: pull.stopped.map((w) => w === '') }}>
                {MappedSubject.create(([w]) => (w ? i18n.now(PULL_STOPS[w]) : ''), pull.stopped, m.lang)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    const m = this.props.model;
    const fire = (s: Service): void => {
      if (!s.needsGround || m.groundWorkAllowed()) {
        s.act();
      }
    };
    for (const { item, ref } of this.rows) {
      onTap(ref.instance, () => fire(item));
    }
    for (const { item, ref } of this.marks) {
      onTap(ref.instance, () => fire(item));
    }
    onTap(this.fuelRef.instance, () => this.props.open('weights'));
    for (const { act, ref } of this.pushRefs) {
      onTap(ref.instance, act);
    }
  }
}
