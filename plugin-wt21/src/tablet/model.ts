import { MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { ChartSource, ChartsModel } from './charts';
import { ChecklistState } from './checklist';
import { Lang, LANGUAGES } from './i18n';
import { PullTug } from './pull';
import { SimBridge } from './sim';
import { DEFAULT_PAX_KG, Loader, LoadMode, MAX_CARGO_KG, SEATS } from './loading';
import { Ofp, OfpError, SendResult } from './simbrief';
import { readSystems, SystemsReadings } from './systems';
import { MetarInfo, WeatherSource } from './weather';

export type WeightUnit = 'kg' | 'lb';
export type WeatherState = 'idle' | 'loading' | 'ok' | 'none' | 'error';
/** Whose METAR Home shows (v10.6). */
export type WxSource = 'nearest' | 'origin' | 'dest' | 'altn';
/** The cockpit the Modernized variation shows (v10.9). */
export type Cockpit = 'modern' | 'classic';

/** Where OFPs come from and go: the SimBrief API and the sim's flight plan route manager (a fake one in the browser preview). */
export interface FlightPlanService {
  fetch(user: string): Promise<Ofp>;
  send(ofp: Ofp, progress: (done: number, total: number) => void): Promise<SendResult>;
}

export type OfpState = 'idle' | 'loading' | 'loaded' | 'error';
export type SendState = 'idle' | 'sending' | 'sent' | 'error';

const LB_PER_KG = 2.20462;

/**
 * The tablet's live picture of the aircraft (polled a few times a second) and its actions. The ground actions reuse exactly what the
 * author's right-hand flight manual (pedestal, "plane config" page) does, so the tablet and the manual stay in step:
 *   front door   (>K:TOGGLE_AIRCRAFT_EXIT_FAST), state = interactive point 0 (front left, 22.8 ft forward)
 *   aft door     L:f275_AftDoor_Sw       cargo door  L:f275_CargoDoor_Sw
 *   stairs       L:StairFwd_isVisible / L:StairAft_isVisible
 *   ground power L:f275_Sw_Elec_ParcbatSel: 0 BATT BORD, 1 ARRET, 2 PARC (external power; needs the parking brake, the author's WASM
 *                then connects it)
 */
/** How long a call of the sim's tug counts as under way before it pushes (it drives to the aircraft first), ms. */
const PUSH_CALL_MS = 45000;

export class TabletModel {
  // settings (persisted)
  public readonly units = Subject.create<WeightUnit>('kg');
  /** English until the pilot picks another (v10.3, user: "idioma default do tablet deve ser inglês"). */
  public readonly lang = Subject.create<Lang>('en');
  public readonly brightness = Subject.create(0.85);
  public readonly screenOn = Subject.create(true);
  /**
   * v10.9 (user: "ter opção de escolha Classic vs Modernized dentro do Tablet"): written to L:F27_COCKPIT_CLASSIC, on which the
   * Modernized variation's interior carries one cockpit away and brings the other (scaffold.ps1 section 6).
   */
  public readonly cockpit = Subject.create<Cockpit>('modern');
  /** No FMS for the pilot: the separate Classic variation, or the Classic cockpit (the WT21 FMC still runs there, unseen, for its autopilot). */
  public readonly noFms: Subscribable<boolean>;

  // aircraft
  public readonly registration = Subject.create('');
  public readonly totalWeightLb = Subject.create(0);
  public readonly maxGrossLb = Subject.create(0);
  public readonly fuelLb = Subject.create(0);
  public readonly fuelLeftLb = Subject.create(0);
  public readonly fuelRightLb = Subject.create(0);
  public readonly fuelLeftCapLb = Subject.create(1);
  public readonly fuelRightCapLb = Subject.create(1);
  public readonly cgPercent = Subject.create(0);

  // environment
  public readonly oatC = Subject.create(0);
  public readonly qnhHpa = Subject.create(1013);
  public readonly windDir = Subject.create(0);
  public readonly windKt = Subject.create(0);
  public readonly onGround = Subject.create(true);
  public readonly parkingBrake = Subject.create(false);
  public readonly groundSpeedKt = Subject.create(0);
  public readonly localSeconds = Subject.create(0);
  public readonly zuluSeconds = Subject.create(0);
  /** [year, month, day] of the sim's local date. */
  public readonly localDate = Subject.create<readonly [number, number, number]>([2000, 1, 1], (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
  public readonly iasKt = Subject.create(0);
  public readonly altitudeFt = Subject.create(0);
  public readonly emptyWeightLb = Subject.create(0);
  private lat = 0;
  private lon = 0;
  /** v10.10: latitude, longitude and true heading, in degrees (the aircraft on the charts). */
  public readonly position = Subject.create<readonly [number, number, number]>([0, 0, 0], (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

  // v10.5 Home: the METAR of the airport the aircraft is at (on the ground) or of the OFP's destination (in flight); v10.6: or of the
  // OFP's origin, destination or alternate, as the pilot picks (wxPick; wxSource below)
  public readonly wxAirport = Subject.create('');
  public readonly wxState = Subject.create<WeatherState>('idle');
  public readonly metar = Subject.create<MetarInfo | null>(null);
  public readonly wxPick = Subject.create<WxSource | null>(null);
  private wxFetchedAt = -Infinity;
  private wxFetchedFor: WxSource | null = null;
  /** Counts METAR requests: an answer to an older one (the pilot picked another airport meanwhile) is dropped. */
  private wxRequest = 0;

  // ground
  public readonly doorFwdOpen = Subject.create(false);
  public readonly doorAftOpen = Subject.create(false);
  public readonly doorCargoOpen = Subject.create(false);
  public readonly stairFwd = Subject.create(false);
  public readonly stairAft = Subject.create(false);
  public readonly powerSelector = Subject.create(0);
  public readonly externalPowerOn = Subject.create(false);
  /** v10.4: the rubber wheel chocks of the WT21 exterior (L:F27WT21_Chocks); the stairs follow them (see groundRules). */
  public readonly chocks = Subject.create(false);
  /** v10.5 (F27 maintenance training manual 10.00, protection covers and ground safety devices): on the WT21 exterior. */
  public readonly pitotCovers = Subject.create(false);
  public readonly engineCovers = Subject.create(false);
  public readonly gearPins = Subject.create(false);
  public readonly enginesRunning = Subject.create(false);
  private polls = 0;
  private chocksSeeded = false;
  /** The tablet folded against the side wall (v10.3; its bezel and the button in Settings both toggle L:F27TAB_Stowed). */
  public readonly stowed = Subject.create(false);
  /** v10.10: the tug is pushing (the sim's pushback state), and the heading the author's tug steers the nose to (magnetic). */
  public readonly pushing = Subject.create(false);
  public readonly pushHeading = Subject.create(0);
  /** v10.11.1: the sim's tug was called and has not started pushing yet (it drives to the aircraft first). */
  public readonly pushCalled = Subject.create(false);
  private pushCalledAt = -Infinity;
  /**
   * v10.11.1 (test 18, "não sei se porque eu tenho GSX, mas não funciona o Call Tug"): GSX runs (its Couatl engine) and then owns the
   * pushback, the sim's own is not available (read live: PUSHBACK AVAILABLE 0); GSX's departure state (1 available, 2 not available,
   * 3 bypassed, 4 requested, 5 in progress, 6 done); and whether the sim offers its own tug.
   */
  public readonly gsx = Subject.create(false);
  public readonly gsxDeparture = Subject.create(0);
  public readonly pushAvailable = Subject.create(true);

  // SimBrief (v10.2, user: "importar o plano de voo da SimBrief")
  public readonly simbriefUser = Subject.create('');
  public readonly ofp = Subject.create<Ofp | null>(null);
  public readonly ofpState = Subject.create<OfpState>('idle');
  /** SimBrief's own error text, or 'net' when the request failed. */
  public readonly ofpError = Subject.create('');
  public readonly sendState = Subject.create<SendState>('idle');
  public readonly sendProgress = Subject.create<[number, number]>([0, 0]);
  public readonly sendResult = Subject.create<SendResult | null>(null);

  /** Whose METAR Home shows: the pilot's pick once an OFP is loaded, else the nearest airport on the ground and the destination in flight. */
  public readonly wxSource = MappedSubject.create(([pick, ground, ofp]): WxSource => {
    if (!ofp) {
      return 'nearest';
    }
    if (pick) {
      return pick === 'altn' && !ofp.altn ? 'dest' : pick;
    }
    return ground ? 'nearest' : 'dest';
  }, this.wxPick, this.onGround, this.ofp);

  // v10.3: boarding / refuelling (user: "fazer o loading do avião baseado no SimBrief, boarding real/instantâneo") to a load plan the
  // pilot can change ("poder ser mexido pelo usuário, carregando do SimBrief ou não"): it starts as what is on board, an OFP fills it
  public readonly loader: Loader;
  /** v10.12: the tablet pulling the aircraft forward (Ground page, Pull), worked every frame by the tablet instrument. */
  public readonly pull: PullTug;
  public readonly planPax = Subject.create(0);
  public readonly planCargoLb = Subject.create(0);
  public readonly planFuelLb = Subject.create(0);
  private planSeeded = false;

  /** v10.3: the interactive checklist (user: "uma parte para o checklist, que ele seja interativo"). */
  public readonly checklist: ChecklistState;
  /** v10.3: the sim's own charts (user: "as cartas do MSFS que ele tem hoje disponíveis"). */
  public readonly charts: ChartsModel;
  /** v10.6: the Systems app's readings, refreshed only while it is open (systemsShown). */
  public readonly systems: Subject<SystemsReadings>;
  public systemsShown = false;

  /**
   * @param sim Where the values come from and the actions go.
   * @param plans Where OFPs come from and where routes go.
   * @param charts Where charts come from.
   * @param weather Where the Home page's METAR comes from.
   * @param classic v10.8: the Classic variation (the author's cockpit, our tablet only): no FMS to send routes to.
   */
  constructor(private readonly sim: SimBridge, private readonly plans: FlightPlanService, charts: ChartSource, private readonly weather: WeatherSource,
    public readonly classic = false) {
    this.loader = new Loader(sim);
    this.pull = new PullTug(sim);
    this.checklist = new ChecklistState(sim);
    this.charts = new ChartsModel(charts);
    this.systems = Subject.create(readSystems(sim));
    const provider = sim.load('F27TAB_chartprov');
    if (provider === 'LIDO' || provider === 'FAA') {
      this.charts.provider.set(provider);
    }
    this.charts.provider.sub((p) => sim.save('F27TAB_chartprov', p));
    const loadMode = sim.load('F27TAB_loadmode');
    if (loadMode === 'real' || loadMode === 'instant') {
      this.loader.mode.set(loadMode as LoadMode);
    }
    this.loader.mode.sub((m) => sim.save('F27TAB_loadmode', m));
    const units = sim.load('F27TAB_units');
    if (units === 'kg' || units === 'lb') {
      this.units.set(units);
    }
    const lang = sim.load('F27TAB_lang');
    if (LANGUAGES.some((l) => l.id === lang)) {
      this.lang.set(lang as Lang);
    }
    const bright = Number(sim.load('F27TAB_brightness'));
    if (bright >= 0.2 && bright <= 1) {
      this.brightness.set(bright);
    }
    this.simbriefUser.set(sim.load('F27TAB_sbuser') ?? '');
    this.simbriefUser.sub((u) => sim.save('F27TAB_sbuser', u));
    this.units.sub((u) => sim.save('F27TAB_units', u));
    this.lang.sub((l) => sim.save('F27TAB_lang', l));
    this.brightness.sub((b) => sim.save('F27TAB_brightness', b.toFixed(2)));
    this.noFms = this.cockpit.map((c) => classic || c === 'classic');
    if (!classic) {
      if (sim.load('F27TAB_cockpit') === 'classic') {
        this.cockpit.set('classic');
      }
      this.cockpit.sub((c) => {
        sim.save('F27TAB_cockpit', c);
        sim.set('L:F27_COCKPIT_CLASSIC', 'bool', c === 'classic' ? 1 : 0);
      }, true);
    }
  }

  /** Reads everything once (called a few times per second). */
  public update(): void {
    const s = this.sim;
    this.registration.set(s.getString('ATC ID'));
    this.totalWeightLb.set(s.get('TOTAL WEIGHT', 'pounds'));
    this.maxGrossLb.set(s.get('MAX GROSS WEIGHT', 'pounds'));
    this.fuelLb.set(s.get('FUEL TOTAL QUANTITY WEIGHT', 'pounds'));
    const perGal = s.get('FUEL WEIGHT PER GALLON', 'pounds');
    this.fuelLeftLb.set(s.get('FUEL LEFT QUANTITY', 'gallons') * perGal);
    this.fuelRightLb.set(s.get('FUEL RIGHT QUANTITY', 'gallons') * perGal);
    this.fuelLeftCapLb.set(Math.max(1, s.get('FUEL LEFT CAPACITY', 'gallons') * perGal));
    this.fuelRightCapLb.set(Math.max(1, s.get('FUEL RIGHT CAPACITY', 'gallons') * perGal));
    this.cgPercent.set(s.get('CG PERCENT', 'percent'));
    this.oatC.set(s.get('AMBIENT TEMPERATURE', 'celsius'));
    this.qnhHpa.set(s.get('SEA LEVEL PRESSURE', 'millibars'));
    this.windDir.set(s.get('AMBIENT WIND DIRECTION', 'degrees'));
    this.windKt.set(s.get('AMBIENT WIND VELOCITY', 'knots'));
    this.onGround.set(s.get('SIM ON GROUND', 'bool') !== 0);
    this.parkingBrake.set(s.get('BRAKE PARKING POSITION', 'bool') !== 0);
    this.groundSpeedKt.set(s.get('GROUND VELOCITY', 'knots'));
    this.localSeconds.set(s.get('E:LOCAL TIME', 'seconds'));
    this.zuluSeconds.set(s.get('E:ZULU TIME', 'seconds'));
    this.localDate.set([s.get('E:LOCAL YEAR', 'number'), s.get('E:LOCAL MONTH OF YEAR', 'number'), s.get('E:LOCAL DAY OF MONTH', 'number')]);
    this.iasKt.set(s.get('AIRSPEED INDICATED', 'knots'));
    this.altitudeFt.set(s.get('INDICATED ALTITUDE', 'feet'));
    this.emptyWeightLb.set(s.get('EMPTY WEIGHT', 'pounds'));
    this.lat = s.get('PLANE LATITUDE', 'degrees');
    this.lon = s.get('PLANE LONGITUDE', 'degrees');
    this.position.set([this.lat, this.lon, s.get('PLANE HEADING DEGREES TRUE', 'degrees')]);
    this.enginesRunning.set(s.get('GENERAL ENG COMBUSTION:1', 'bool') !== 0 || s.get('GENERAL ENG COMBUSTION:2', 'bool') !== 0);
    this.doorFwdOpen.set(s.get('INTERACTIVE POINT OPEN:0', 'percent over 100') > 0.05);
    this.doorAftOpen.set(s.get('L:f275_AftDoor_Sw', 'bool') !== 0);
    this.doorCargoOpen.set(s.get('L:f275_CargoDoor_Sw', 'bool') !== 0);
    this.stairFwd.set(s.get('L:StairFwd_isVisible', 'bool') !== 0);
    this.stairAft.set(s.get('L:StairAft_isVisible', 'bool') !== 0);
    this.powerSelector.set(Math.round(s.get('L:f275_Sw_Elec_ParcbatSel', 'number')));
    this.externalPowerOn.set(s.get('EXTERNAL POWER ON:1', 'bool') !== 0);
    this.pushing.set(s.get('PUSHBACK STATE', 'enum') !== 3 || s.get('PUSHBACK ATTACHED', 'bool') !== 0);
    this.pushCalled.set(!this.pushing.get() && Date.now() - this.pushCalledAt < PUSH_CALL_MS);
    this.gsx.set(s.get('L:FSDT_GSX_COUATL_STARTED', 'number') === 1);
    this.gsxDeparture.set(Math.round(s.get('L:FSDT_GSX_DEPARTURE_STATE', 'number')));
    this.pushAvailable.set(s.get('PUSHBACK AVAILABLE', 'bool') !== 0);
    // v10.11: L:f275_PushHdg is not the push heading but the aircraft's heading less it (the angle his orange aircraft turns by)
    const pushHdg = Math.round(s.get('PLANE HEADING DEGREES MAGNETIC', 'degrees') - s.get('L:f275_PushHdg', 'number'));
    this.pushHeading.set(((pushHdg % 360) + 360) % 360 || 360);
    this.loader.tick(s.get('E:SIMULATION TIME', 'seconds'), this.groundWorkAllowed());
    if (!this.planSeeded) {
      this.planSeeded = true;
      const p = this.loader.payload.get();
      this.planPax.set(p.pax);
      this.planCargoLb.set(p.cargoLb);
      this.planFuelLb.set(this.loader.readFuelLb());
    }
    this.stowed.set(s.get('L:F27TAB_Stowed', 'bool') !== 0);
    // the tablet owns the cockpit choice: held against anything that resets the L:var (a flight reload)
    const classicCockpit = this.cockpit.get() === 'classic';
    if (!this.classic && (s.get('L:F27_COCKPIT_CLASSIC', 'bool') !== 0) !== classicCockpit) {
      s.set('L:F27_COCKPIT_CLASSIC', 'bool', classicCockpit ? 1 : 0);
    }
    this.chocks.set(s.get('L:F27WT21_Chocks', 'bool') !== 0);
    this.pitotCovers.set(s.get('L:F27WT21_PitotCovers', 'bool') !== 0);
    this.engineCovers.set(s.get('L:F27WT21_EngineCovers', 'bool') !== 0);
    this.gearPins.set(s.get('L:F27WT21_GearPins', 'bool') !== 0);
    this.groundRules();
    this.checklist.update();
    if (this.systemsShown) {
      this.systems.set(readSystems(s));
    }
  }

  /**
   * v10.4 (user: "assim as escadas sairiam ao remover os calços"): the author's systems kept the stairs only while his GPU showed (so
   * they seemed missing from some liveries); that rule is off in the WT21 copy of his systems and the stairs follow the chocks instead.
   * Stairs put out (here or from his flight manual) bring the chocks; taking the chocks away takes the stairs (toggleChocks); moving or
   * flying takes everything on the ground away (chocks, stairs, v10.5 covers and gear pins). A flight that starts parked with both
   * engines off starts chocked with the gear pins in (the manual's parking: "ground locks must always be installed"), decided once,
   * 2 s after the start.
   */
  private groundRules(): void {
    if (!this.chocksSeeded && ++this.polls > 8) {
      this.chocksSeeded = true;
      if (this.groundWorkAllowed() && !this.enginesRunning.get()) {
        this.put('L:F27WT21_Chocks', this.chocks, true);
        this.put('L:F27WT21_GearPins', this.gearPins, true);
      }
    }
    if (!this.groundWorkAllowed()) {
      for (const [name, state] of [['L:F27WT21_Chocks', this.chocks], ['L:StairFwd_isVisible', this.stairFwd], ['L:StairAft_isVisible', this.stairAft],
        ['L:F27WT21_PitotCovers', this.pitotCovers], ['L:F27WT21_EngineCovers', this.engineCovers], ['L:F27WT21_GearPins', this.gearPins]] as const) {
        if (state.get()) {
          this.put(name, state, false);
        }
      }
    } else if ((this.stairFwd.get() || this.stairAft.get()) && !this.chocks.get()) {
      this.put('L:F27WT21_Chocks', this.chocks, true);
    }
  }

  /** Covers or gear pins in place while an engine runs (the tablet warns; on the real aircraft, damage or a jammed gear). */
  public coversOnWithEngines(): boolean {
    return this.enginesRunning.get() && (this.pitotCovers.get() || this.engineCovers.get() || this.gearPins.get());
  }

  public togglePitotCovers(): void {
    this.flip('L:F27WT21_PitotCovers', this.pitotCovers);
  }

  /** Engine covers go on only with that engine stopped (both, here: the tablet works them as a pair). */
  public toggleEngineCovers(): void {
    if (this.engineCovers.get() || !this.enginesRunning.get()) {
      this.flip('L:F27WT21_EngineCovers', this.engineCovers);
    }
  }

  public toggleGearPins(): void {
    this.flip('L:F27WT21_GearPins', this.gearPins);
  }

  /**
   * Fetches the METAR shown on Home of the airport wxSource names: at once when that changed or on `force`, else at most every 5
   * minutes. The sim's own weather (FacilityLoader.getMetar), nothing from the internet.
   */
  public async refreshWeather(force = false): Promise<void> {
    const now = Date.now(), src = this.wxSource.get();
    if (!force && src === this.wxFetchedFor && (this.wxState.get() === 'loading' || now - this.wxFetchedAt < 5 * 60000)) {
      return;
    }
    const req = ++this.wxRequest;
    this.wxFetchedAt = now;
    this.wxFetchedFor = src;
    this.wxState.set('loading');
    try {
      const ofp = this.ofp.get();
      const ident = !ofp || src === 'nearest' ? await this.weather.nearestAirport(this.lat, this.lon)
        : src === 'origin' ? ofp.origin : src === 'dest' ? ofp.dest : ofp.altn;
      if (req !== this.wxRequest) {
        return;
      }
      if (!ident) {
        this.wxAirport.set('');
        this.metar.set(null);
        this.wxState.set('none');
        return;
      }
      this.wxAirport.set(ident);
      const m = await this.weather.metar(ident);
      if (req === this.wxRequest) {
        this.metar.set(m);
        this.wxState.set(m ? 'ok' : 'none');
      }
    } catch {
      if (req === this.wxRequest) {
        this.wxState.set('error');
      }
    }
  }

  /** Shows the METAR of another airport (v10.6). */
  public pickWeather(src: WxSource): void {
    this.wxPick.set(src);
    void this.refreshWeather();
  }

  /** Wheel chocks in or out (v10.4); taking them away takes the stairs away too. */
  public toggleChocks(): void {
    const on = !this.chocks.get();
    this.put('L:F27WT21_Chocks', this.chocks, on);
    if (!on) {
      this.put('L:StairFwd_isVisible', this.stairFwd, false);
      this.put('L:StairAft_isVisible', this.stairAft, false);
    }
  }

  /** Folds the tablet against the wall, or brings it back. */
  public toggleStowed(): void {
    this.flip('L:F27TAB_Stowed', this.stowed);
  }

  /** Changes the cockpit, on the ground and stopped only (a change of hardware, not of a page); false when refused. */
  public setCockpit(c: Cockpit): boolean {
    if (c !== this.cockpit.get()) {
      if (!this.groundWorkAllowed()) {
        return false;
      }
      this.cockpit.set(c);
    }
    return true;
  }

  /** Bags and freight of the OFP: its payload less its passengers. */
  public static ofpCargoLb(o: Ofp): number {
    return Math.max(0, o.payloadLb - o.pax * o.paxWeightLb);
  }

  /** Fills the load plan from the OFP: passengers (at most the 52 seats), bags and freight, block fuel. */
  public planFromOfp(): void {
    const o = this.ofp.get();
    if (o) {
      this.planPax.set(Math.min(SEATS, Math.round(o.pax)));
      this.planCargoLb.set(Math.min(MAX_CARGO_KG * LB_PER_KG, TabletModel.ofpCargoLb(o)));
      this.planFuelLb.set(o.fuelBlockLb);
    }
  }

  /** The most the plan can hold: the seats, the holds, the tanks. */
  public planMax(what: 'pax' | 'cargo' | 'fuel'): number {
    return what === 'pax' ? SEATS : what === 'cargo' ? MAX_CARGO_KG * LB_PER_KG : this.loader.fuelCapacityLb();
  }

  /** Nudges the plan: passengers by one, cargo by 50 kg (100 lb), fuel by 100 kg (200 lb), within the aircraft's limits. */
  public adjustPlan(what: 'pax' | 'cargo' | 'fuel', steps: number): void {
    const kg = this.units.get() === 'kg';
    if (what === 'pax') {
      this.planPax.set(Math.max(0, Math.min(this.planMax('pax'), this.planPax.get() + steps)));
    } else if (what === 'cargo') {
      const step = kg ? 50 * LB_PER_KG : 100;
      this.planCargoLb.set(Math.max(0, Math.min(this.planMax('cargo'), Math.round(this.planCargoLb.get() / step + steps) * step)));
    } else {
      const step = kg ? 100 * LB_PER_KG : 200;
      this.planFuelLb.set(Math.max(0, Math.min(this.planMax('fuel'), Math.round(this.planFuelLb.get() / step + steps) * step)));
    }
  }

  /** Sets a plan value typed on the tablet (passengers, or a weight in the tablet's unit). */
  public setPlan(what: 'pax' | 'cargo' | 'fuel', value: number): void {
    if (!isFinite(value)) {
      return;
    }
    const lb = this.units.get() === 'kg' ? value * LB_PER_KG : value;
    if (what === 'pax') {
      this.planPax.set(Math.max(0, Math.min(this.planMax('pax'), Math.round(value))));
    } else if (what === 'cargo') {
      this.planCargoLb.set(Math.max(0, Math.min(this.planMax('cargo'), lb)));
    } else {
      this.planFuelLb.set(Math.max(0, Math.min(this.planMax('fuel'), lb)));
    }
  }

  /** Boards (or deboards) to the plan's passengers and cargo. */
  public boardPlan(): void {
    if (this.groundWorkAllowed()) {
      const o = this.ofp.get();
      this.loader.board(this.planPax.get(), o && o.paxWeightLb > 0 ? o.paxWeightLb : DEFAULT_PAX_KG * LB_PER_KG, this.planCargoLb.get());
    }
  }

  /** Refuels (or defuels) to the plan's fuel. */
  public refuelPlan(): void {
    if (this.groundWorkAllowed()) {
      this.loader.refuel(this.planFuelLb.get());
    }
  }

  /** A weight in the chosen unit, rounded, with the language's thousands separator (no toLocaleString: not in every sim browser). */
  public static weight(lb: number, unit: WeightUnit, lang: Lang): string {
    const v = Math.round(unit === 'kg' ? lb / LB_PER_KG : lb);
    const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, LANGUAGES.find((l) => l.id === lang)?.thousands ?? ',');
    return v < 0 ? `-${digits}` : digits;
  }

  /** Whether the doors and stairs may be worked (on the ground, stopped). */
  public groundWorkAllowed(): boolean {
    return this.onGround.get() && this.groundSpeedKt.get() < 2;
  }

  public toggleDoorFwd(): void {
    this.sim.set('K:TOGGLE_AIRCRAFT_EXIT_FAST', 'number', 0);
  }

  public toggleDoorAft(): void {
    this.flip('L:f275_AftDoor_Sw', this.doorAftOpen);
  }

  public toggleDoorCargo(): void {
    this.flip('L:f275_CargoDoor_Sw', this.doorCargoOpen);
  }

  public toggleStairFwd(): void {
    this.flip('L:StairFwd_isVisible', this.stairFwd);
  }

  public toggleStairAft(): void {
    this.flip('L:StairAft_isVisible', this.stairAft);
  }

  /**
   * v10.10 pushback (user: "no tablet, ground, opção para fazer o pushback do avião e eu poder controlar esse push por ali"): the
   * author's own tug, worked as his arrows on the windscreen frame work it (click the standby compass to show them). His WASM turns
   * L:f275_PushbackStraight into a push on the present heading (K:TUG_HEADING, which calls the tug), and each L:f275_PushbackLeft /
   * Right into a turn of 5 degrees of the push heading (Left: heading up, the nose right, the tail left), clearing the flag once done;
   * stop is K:TUG_DISABLE. v10.11 (test 17, "aparece Tug off, mas não tem botão pra chamar"): his WASM reads the arrows only while his
   * pushback mode is on (L:f275_PushbackToggle, what the click on the compass sets), so the tablet turns it on first.
   * v10.11.1 (test 18): his TUG_HEADING steers a tug, it did not bring one: the sim's tug is called first (K:TOGGLE_PUSHBACK, once:
   * a second toggle while it drives up would send it away). With GSX running the pushback is GSX's (see gsxMenu).
   */
  public pushStraight(): void {
    if (!this.onGround.get()) {
      return;
    }
    if (!this.pushing.get() && !this.pushCalled.get()) {
      this.sim.set('K:TOGGLE_PUSHBACK', 'number', 0);
      this.pushCalledAt = Date.now();
      this.pushCalled.set(true);
    }
    this.sim.set('L:f275_PushbackToggle', 'bool', 1);
    this.sim.set('L:f275_PushbackStraight', 'bool', 1);
  }

  /**
   * v10.11.1: opens GSX's menu, where the pushback is requested and its direction chosen, the way GSX's own EFB app does it: a 0 -> 1
   * change of L:FSDT_GSX_MENU_OPEN (GSX resets it to 0 once the menu is shown; a stale 1 is taken down first so the change is seen).
   */
  public gsxMenu(): void {
    if (this.sim.get('L:FSDT_GSX_MENU_OPEN', 'number') === 0) {
      this.sim.set('L:FSDT_GSX_MENU_OPEN', 'number', 1);
      return;
    }
    this.sim.set('L:FSDT_GSX_MENU_OPEN', 'number', 0);
    window.setTimeout(() => this.sim.set('L:FSDT_GSX_MENU_OPEN', 'number', 1), 150);
  }

  /** Swings the tail to that side by one step of the author's tug: while pushing only (the straight push sets the heading it turns). */
  public pushTail(side: 'left' | 'right'): void {
    if (this.onGround.get() && this.pushing.get()) {
      this.sim.set('L:f275_PushbackToggle', 'bool', 1);
      this.sim.set(side === 'left' ? 'L:f275_PushbackLeft' : 'L:f275_PushbackRight', 'bool', 1);
    }
  }

  /**
   * v10.12 (user: "teria como colocar uma opção além de empurrar, puxar o avião?"): the tablet pulls the aircraft forward itself
   * (PullTug); not with the chocks in or the parking brake set, nor while a tug pushes (the card says which).
   */
  public pullStart(): void {
    if (!this.onGround.get()) {
      this.pull.stopped.set('air');
    } else if (this.chocks.get()) {
      this.pull.stopped.set('chocks');
    } else if (this.parkingBrake.get()) {
      this.pull.stopped.set('brake');
    } else if (this.pushing.get() || this.gsxDeparture.get() === 5) {
      this.pull.stopped.set('tug');
    } else {
      this.pull.start();
    }
  }

  /** Stops the push, as the author's X does, and leaves his pushback mode (his arrows on the frame go away). */
  public pushStop(): void {
    this.sim.set('K:TUG_DISABLE', 'number', 0);
    for (const name of ['L:f275_PushbackStraight', 'L:f275_PushbackLeft', 'L:f275_PushbackRight', 'L:f275_PushbackToggle']) {
      this.sim.set(name, 'bool', 0);
    }
    this.pushing.set(false);
    this.pushCalledAt = -Infinity;
    this.pushCalled.set(false);
  }

  /** Ground power: the selector to PARC (2), or back to BATT BORD (0), as after engine start. */
  public toggleGroundPower(): void {
    const v = this.powerSelector.get() === 2 ? 0 : 2;
    this.sim.set('L:f275_Sw_Elec_ParcbatSel', 'number', v);
    this.powerSelector.set(v);
  }

  /** Fetches the latest OFP of the configured SimBrief user. */
  public async loadOfp(): Promise<void> {
    if (!this.simbriefUser.get() || this.ofpState.get() === 'loading') {
      return;
    }
    this.ofpState.set('loading');
    this.sendState.set('idle');
    try {
      this.ofp.set(await this.plans.fetch(this.simbriefUser.get()));
      this.ofpState.set('loaded');
      this.planFromOfp();
    } catch (e) {
      this.ofpError.set(e instanceof OfpError ? e.message : 'net');
      this.ofpState.set('error');
    }
  }

  /** Sends the loaded OFP's route to the FMS. */
  public async sendRoute(): Promise<void> {
    const ofp = this.ofp.get();
    if (!ofp || this.sendState.get() === 'sending') {
      return;
    }
    this.sendState.set('sending');
    try {
      this.sendResult.set(await this.plans.send(ofp, (done, total) => this.sendProgress.set([done, total])));
      this.sendState.set('sent');
    } catch (e) {
      this.sendState.set('error');
    }
  }

  /** Toggles a bool L:var and shows the new state at once (the next poll confirms it). */
  private flip(name: string, state: Subject<boolean>): void {
    this.put(name, state, !state.get());
  }

  /** Sets a bool L:var and shows it at once. */
  private put(name: string, state: Subject<boolean>, v: boolean): void {
    this.sim.set(name, 'bool', v ? 1 : 0);
    state.set(v);
  }
}
