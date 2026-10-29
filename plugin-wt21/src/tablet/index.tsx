import { EventBus, FSComponent, FsBaseInstrument, FsInstrument } from '@microsoft/msfs-sdk';

import { realCharts } from './charts';
import { I18n } from './i18n';
import { createSimMap, TabletMap } from './map';
import { TabletModel } from './model';
import { realSim } from './sim';
import { fetchOfp, sendOfpToFms } from './simbrief';
import { TapirBridge } from './tapir';
import { realWeather } from './weather';
import { TabletApp } from './TabletApp';

/**
 * The F27 tablet: a touchscreen VCockpit instrument (F27WT21\Tablet\F27Tablet.html) shown on the tablet mounted on the captain's left
 * (wt21-layout.json unit TAB1, its own [VCockpitNN] in panel.WT21\panel.cfg). It needs no aircraft power, like a real tablet.
 */
class F27TabletInstrument implements FsInstrument {
  private readonly bus = new EventBus();
  private readonly model: TabletModel;
  private lastPoll = 0;
  /** v10.9: the old TAPIR panel flying the WT21 autopilot, while the Classic cockpit is in use (it needs no aircraft power either). */
  private readonly tapir = new TapirBridge(realSim);
  private tapirActive = false;
  /** v10.10: the Charts app's map (made the first time it is shown, updated every frame while on screen). */
  private readonly map: TabletMap;

  /**
   * @param instrument The sim's instrument element (its template holds the root div).
   */
  constructor(public readonly instrument: BaseInstrument) {
    // v10.8: panel.cfg's htmlgauge line says which variation it is in (?variant=classic: the author's cockpit, no FMS)
    const classic = /[?&]variant=classic\b/.test(instrument.getAttribute('Url') ?? '');
    this.model = new TabletModel(realSim, { fetch: fetchOfp, send: (ofp, progress) => sendOfpToFms(ofp, this.bus, progress) },
      realCharts, realWeather(this.bus), classic);
    this.map = createSimMap(this.bus, this.model.ofp.map((o) => (o ? o.fixes : [])));
    const root = instrument.querySelector('#F27TabletRoot') as HTMLElement;
    FSComponent.render(<TabletApp model={this.model} i18n={new I18n(this.model.lang)} map={this.map} />, root);
    this.model.update();
  }

  /** Polls the aircraft four times a second; the TAPIR layer, the map and the pull (v10.12) run every frame. */
  public Update(): void {
    const now = Date.now();
    this.map.update(now);
    this.model.pull.update(now);
    if (!this.model.classic && this.model.cockpit.get() === 'classic') {
      this.tapir.update(now);
      this.tapirActive = true;
    } else if (this.tapirActive) {
      this.tapir.reset();
      this.tapirActive = false;
    }
    if (now - this.lastPoll >= 250) {
      this.lastPoll = now;
      this.model.update();
    }
  }

  /** @inheritdoc */
  public onInteractionEvent(): void { /* the tablet is driven by touch only */ }
  /** @inheritdoc */
  public onFlightStart(): void { /* nothing to reset */ }
  /** @inheritdoc */
  public onGameStateChanged(): void { /* nothing to do */ }
  /** @inheritdoc */
  public onSoundEnd(): void { /* no sounds */ }
}

/** The sim's element for the tablet: interactive, so mouse clicks on the 3D screen reach the page as DOM mouse events. */
class F27Tablet extends FsBaseInstrument<F27TabletInstrument> {
  /** @inheritdoc */
  public get templateID(): string {
    return 'F27_TABLET';
  }

  /** @inheritdoc */
  public get isInteractive(): boolean {
    return true;
  }

  /** @inheritdoc */
  public constructInstrument(): F27TabletInstrument {
    return new F27TabletInstrument(this);
  }
}

registerInstrument('f27-tablet', F27Tablet);
