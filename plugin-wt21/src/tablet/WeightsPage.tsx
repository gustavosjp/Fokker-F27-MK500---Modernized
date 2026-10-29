import { DisplayComponent, FSComponent, MappedSubject, NodeReference, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { Lang, StringKey } from './i18n';
import { CG_LIMITS_MAC, holdsLb, LIMITS_KG, LIMITS_LB, Loader, paxPerRow, SEAT_ROWS, SEATS } from './loading';
import { TabletModel, WeightUnit } from './model';
import { Card, KeyboardFn, onTap, TabletProps } from './ui';

// cabin map, nose to the left: rows are columns; the aircraft's left side (doors) at the bottom; two-seat rows on the right side
const ROW0 = 118, ROW_W = 32, SEAT = 21, CABIN_Y = 52;
/** Seat slots of a row (0, 1: right side; 2, 3: left side) and the order they fill in (window seats first). */
const SLOT_Y = [CABIN_Y, CABIN_Y + 24, CABIN_Y + 64, CABIN_Y + 88];
const FILL_4 = [0, 3, 1, 2], FILL_2 = [0, 1];
// the CG scale, % MAC
const CG_MIN = 10, CG_MAX = 45;
const LB_PER_KG = 2.20462;
/** Table lines whose limit the checklist also gives in kilograms. */
const PUBLISHED: Partial<Record<string, keyof typeof LIMITS_KG>> = { zfw: 'mzfw', tow: 'mtow', lw: 'mlw' };

/** One line of the weights table, in pounds (null: not known). */
interface Line { now: number | null; plan: number | null; limit: number | null }

/**
 * Weights (v10.5, user: after the Hawker 800XP tablet's Weight and Balance): the load plan (moved from Ground: passengers, bags and
 * freight, fuel, boarding and refuelling), the cabin with its 52 seats filling as passengers board, the holds, the CG on its % MAC
 * range, and the weights now and as planned against the F27-500's limits.
 */
export class WeightsPage extends DisplayComponent<TabletProps & { keyboard: KeyboardFn }> {
  private readonly steppers: { what: 'pax' | 'cargo' | 'fuel'; label: StringKey; minus: NodeReference<HTMLDivElement>; plus: NodeReference<HTMLDivElement>; value: NodeReference<HTMLDivElement> }[] = [];
  private readonly buttons: { act: () => void; ref: NodeReference<HTMLDivElement> }[] = [];

  /** @inheritdoc */
  public render(): VNode {
    const { model: m, i18n } = this.props;
    const L = m.loader;
    const kg = (lb: number, u: WeightUnit, l: Lang): string => `${TabletModel.weight(lb, u, l)} ${u}`;
    const button = (label: Subscribable<string>, act: () => void, cls = ''): VNode => {
      const ref = FSComponent.createRef<HTMLDivElement>();
      this.buttons.push({ act, ref });
      return <div ref={ref} class={`button ${cls}`}>{label}</div>;
    };
    // '~N min' (or nothing when there is nothing left to load), after `prefix`
    const eta = (s: number, prefix = ''): string => (s < 1 ? '' : `${prefix}~${Math.max(1, Math.round(s / 60))} ${i18n.now('minutes')}`);
    const pct = (a: number, max: number): string => `width: ${max > 0 ? Math.max(0, Math.min(100, (100 * a) / max)).toFixed(1) : 0}%`;
    // one row of the load plan: what is on board, the planned value between - and + (a tap on it types it; - / + grey out at the
    // limits), and a bar of the aircraft's maximum (seats, holds, tanks): on board solid, the plan faint behind it
    const planRow = (what: 'pax' | 'cargo' | 'fuel', label: StringKey, now: Subscribable<number>, plan: Subscribable<number>, fmt: (v: number, u: WeightUnit, l: Lang) => string, barCls: string): VNode => {
      const minus = FSComponent.createRef<HTMLDivElement>(), plus = FSComponent.createRef<HTMLDivElement>(), value = FSComponent.createRef<HTMLDivElement>();
      this.steppers.push({ what, label, minus, plus, value });
      return (
        <div class="ld-plan">
          <div class="ld-row">
            <span>{i18n.t(label)}</span>
            <span class="ld-now">{MappedSubject.create(([n, u, l]) => `${i18n.now('onBoard')} ${fmt(n, u, l)}`, now, m.units, m.lang)}</span>
          </div>
          <div class="stepper">
            <div ref={minus} class={{ step: true, disabled: plan.map((p) => p <= 0) }}>{'−'}</div>
            <div ref={value} class="step-value">{MappedSubject.create(([v, u, l]) => fmt(v, u, l), plan, m.units, m.lang)}</div>
            <div ref={plus} class={{ step: true, disabled: plan.map((p) => p >= m.planMax(what) - 0.5) }}>+</div>
          </div>
          <div class="bar ld-bar">
            <div class={`bar-plan ${barCls}`} style={plan.map((p) => pct(p, m.planMax(what)))}></div>
            <div class={`bar-fill ${barCls}`} style={now.map((n) => pct(n, m.planMax(what)))}></div>
          </div>
        </div>
      );
    };
    const paxNow = L.payload.map((p) => Math.floor(p.pax + 1e-6));
    const boardEta = MappedSubject.create(([p, pp, pc, mode]) => {
      if (mode === 'instant') {
        return '';
      }
      if (p.active) {
        return eta(Loader.boardSeconds(Math.abs(p.paxTarget - p.pax), Math.abs(p.cargoTargetLb - p.cargoLb)), `${i18n.now('remaining')} `);
      }
      return eta(Loader.boardSeconds(Math.abs(pp - p.pax), Math.abs(pc - p.cargoLb)));
    }, L.payload, m.planPax, m.planCargoLb, L.mode, m.lang);
    const fuelEta = MappedSubject.create(([fs, pf, mode]) => {
      if (mode === 'instant') {
        return '';
      }
      if (fs.active) {
        return eta(Loader.fuelSeconds(fs.fuelLb, fs.targetLb), `${i18n.now('remaining')} `);
      }
      return eta(Loader.fuelSeconds(fs.fuelLb, pf));
    }, L.fuel, m.planFuelLb, L.mode, m.lang);

    // ---- the cabin: seats lit by the passengers on board, the two holds with their load ----
    const seats: VNode[] = [];
    SEAT_ROWS.forEach(([, n], r) => {
      const order = n === 4 ? FILL_4 : FILL_2;
      order.forEach((slot, k) => {
        const filled = paxNow.map((p) => paxPerRow(p)[r] > k);
        seats.push(<rect x={ROW0 + r * ROW_W} y={SLOT_Y[slot]} width={SEAT} height={SEAT} rx="4" class={{ seat: true, on: filled }} />);
      });
    });
    const holds = L.payload.map((p) => holdsLb(p.cargoLb));
    const holdText = (i: number): Subscribable<string> => MappedSubject.create(([h, u, l]) => kg(h[i], u, l), holds, m.units, m.lang);
    const cabinEnd = ROW0 + SEAT_ROWS.length * ROW_W;

    // ---- the weights table, pounds ----
    const sheet = MappedSubject.create(([total, fuel, p, pPax, pCargo, pFuel, ofp]) => {
      const pax = L.paxLb;
      const payloadNow = Math.floor(p.pax + 1e-6) * pax + p.cargoLb;
      const bow = total - fuel - payloadNow;
      const payloadPlan = pPax * pax + pCargo;
      const zfwPlan = bow + payloadPlan, towPlan = zfwPlan + pFuel;
      const trip = ofp ? ofp.fuelTripLb : null;
      const rows: Record<string, Line> = {
        bow: { now: bow, plan: bow, limit: null },
        payload: { now: payloadNow, plan: payloadPlan, limit: null },
        zfw: { now: total - fuel, plan: zfwPlan, limit: LIMITS_LB.mzfw },
        fuel: { now: fuel, plan: pFuel, limit: m.planMax('fuel') },
        tow: { now: total, plan: towPlan, limit: LIMITS_LB.mtow },
        lw: { now: trip === null ? null : total - trip, plan: trip === null ? null : towPlan - trip, limit: LIMITS_LB.mlw },
      };
      return rows;
    }, m.totalWeightLb, m.fuelLb, L.payload, m.planPax, m.planCargoLb, m.planFuelLb, m.ofp);
    const cell = (key: string, col: 'now' | 'plan' | 'limit'): VNode => {
      const v = MappedSubject.create(([s, u, l]) => {
        const published = PUBLISHED[key];
        if (col === 'limit' && u === 'kg' && published) {
          return TabletModel.weight(LIMITS_KG[published] * LB_PER_KG, 'kg', l);   // the checklist's own kg figure
        }
        const x = s[key][col];
        return x === null || !isFinite(x) ? '—' : TabletModel.weight(x, u, l);
      }, sheet, m.units, m.lang);
      const over = sheet.map((s) => col !== 'limit' && s[key].limit !== null && s[key][col] !== null && (s[key][col] as number) > (s[key].limit as number) + 0.5);
      return <div class={{ 'wt-num': true, over }}>{v}</div>;
    };
    // rows of divs, not a <table>: the sim's browser lays out flex boxes, tables are not to be relied on
    const line = (key: string, label: string | Subscribable<string>): VNode => (
      <div class="wt-tr"><div class="wt-label">{label}</div>{cell(key, 'now')}{cell(key, 'plan')}{cell(key, 'limit')}</div>
    );
    const cgX = (c: number): number => 20 + ((Math.max(CG_MIN, Math.min(CG_MAX, c)) - CG_MIN) / (CG_MAX - CG_MIN)) * 560;
    const cgOut = m.cgPercent.map((c) => c < CG_LIMITS_MAC[0] || c > CG_LIMITS_MAC[1]);

    return (
      <div class="weights">
        <Card title={i18n.t('loading')} class="wt-load">
          {planRow('pax', 'loadPax', paxNow, m.planPax, (v) => String(Math.round(v)), '')}
          {planRow('cargo', 'loadCargo', L.payload.map((p) => p.cargoLb), m.planCargoLb, kg, 'cargo')}
          {planRow('fuel', 'loadFuel', L.fuel.map((f) => f.fuelLb), m.planFuelLb, kg, 'fuel')}
          <div class="segmented ld-mode">
            {button(i18n.t('modeReal'), () => L.mode.set('real'), '')}
            {button(i18n.t('modeInstant'), () => L.mode.set('instant'), '')}
          </div>
          <div class={{ 'ld-btns': true, hidden: m.ofp.map((o) => o === null) }}>{button(i18n.t('useOfp'), () => m.planFromOfp(), 'ofp')}</div>
          <div class="ld-btns">
            {button(MappedSubject.create(([e]) => `${i18n.now('board')} ${e}`.trim(), boardEta, m.lang), () => m.boardPlan(), 'primary')}
            {button(MappedSubject.create(([e]) => `${i18n.now('refuel')} ${e}`.trim(), fuelEta, m.lang), () => m.refuelPlan(), 'primary')}
          </div>
          <div class="ld-btns">
            {button(i18n.t('deboard'), () => L.deboard())}
            {button(i18n.t('stopLoad'), () => L.stop())}
          </div>
          <div class={{ note: true, hidden: m.ofp.map((o) => !o || o.pax <= SEATS) }}>{i18n.t('seatsCap')}</div>
        </Card>
        <div class="wt-right">
          <Card title={MappedSubject.create(([p, l]) => `${i18n.now('cabin')} · ${p} / ${SEATS} pax`, paxNow, m.lang)} class="wt-cabin">
            <svg class="cabin" viewBox="0 0 600 200">
              <path class="cab-hull" d="M28 100 C28 60 52 34 92 34 L540 34 C566 34 588 64 594 100 C588 136 566 166 540 166 L92 166 C52 166 28 140 28 100 Z" />
              <rect class="cab-hold" x="58" y="56" width="50" height="88" rx="6" />
              <rect class="cab-hold" x={cabinEnd} y="64" width="44" height="72" rx="6" />
              <rect class="cab-door" x="64" y="160" width="26" height="6" />
              <rect class="cab-door" x={cabinEnd + 8} y="160" width="24" height="6" />
              {seats}
              <text class="cab-label" x="83" y="190">{holdText(0)}</text>
              <text class="cab-label" x={cabinEnd + 22} y="190">{holdText(1)}</text>
            </svg>
          </Card>
          <Card title={i18n.t('weightsCg')} class="wt-sheet">
            <svg class="cg" viewBox="0 0 600 64">
              <rect class="cg-track" x="20" y="22" width="560" height="14" rx="7" />
              <rect class="cg-range" x={cgX(CG_LIMITS_MAC[0])} y="22" width={cgX(CG_LIMITS_MAC[1]) - cgX(CG_LIMITS_MAC[0])} height="14" />
              <text class="cg-tick" x={cgX(CG_LIMITS_MAC[0])} y="56">{`${CG_LIMITS_MAC[0]}%`}</text>
              <text class="cg-tick" x={cgX(CG_LIMITS_MAC[1])} y="56">{`${CG_LIMITS_MAC[1]}%`}</text>
              <path class={{ 'cg-mark': true, out: cgOut }} d="M0 0 L8 -12 L-8 -12 Z" transform={m.cgPercent.map((c) => `translate(${cgX(c).toFixed(1)} 20)`)} />
              <text class={{ 'cg-value': true, out: cgOut }} x="580" y="14">{m.cgPercent.map((c) => `CG ${c.toFixed(1)} % MAC`)}</text>
            </svg>
            <div class="wt-table">
              <div class="wt-tr wt-head"><div class="wt-label"></div><div class="wt-num">{i18n.t('now')}</div><div class="wt-num">{i18n.t('planned')}</div><div class="wt-num">{i18n.t('limit')}</div></div>
              {line('bow', i18n.t('bow'))}
              {line('payload', i18n.t('payload'))}
              {line('zfw', 'ZFW')}
              {line('fuel', i18n.t('fuel'))}
              {line('tow', 'TOW')}
              {line('lw', 'LW')}
            </div>
            <div class="wt-units">{MappedSubject.create(([u, o]) => `${u}${o ? '' : ` · ${i18n.now('lwNeedsOfp')}`}`, m.units, m.ofp)}</div>
          </Card>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    for (const { act, ref } of this.buttons) {
      onTap(ref.instance, act);
    }
    const m = this.props.model;
    for (const { what, label, minus, plus, value } of this.steppers) {
      onTap(minus.instance, () => m.adjustPlan(what, -1));
      onTap(plus.instance, () => m.adjustPlan(what, 1));
      onTap(value.instance, () => this.props.keyboard(label, '', (v) => {
        const digits = v.replace(/[^0-9]/g, '');
        if (digits) {
          m.setPlan(what, Number(digits));
        }
      }));
    }
    // the mode buttons look like a segmented control: mark the chosen one
    const [real, instant] = [this.buttons[0].ref.instance, this.buttons[1].ref.instance];
    m.loader.mode.sub((mode) => {
      real.classList.toggle('active', mode === 'real');
      instant.classList.toggle('active', mode === 'instant');
    }, true);
  }
}
