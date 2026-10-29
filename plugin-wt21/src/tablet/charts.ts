import {
  ChartsClient, ChartUtils, ChartView, GeoReferencedChartArea, ICAO, LambertConformalConicProjection, Subject, Subscribable,
} from '@microsoft/msfs-sdk';

/** The chart providers built into the sim (no subscription or developer key needed): LIDO worldwide, FAA for the US. */
export type ChartProvider = 'LIDO' | 'FAA';

/** How the list is split, the way pilots look for a chart. */
export type ChartGroup = 'airport' | 'dep' | 'arr' | 'app';

/** A chart of the list. */
export interface ChartEntry {
  guid: string;
  name: string;
  group: ChartGroup;
}

/** A page of a chart: its day and night images (the night one only on LIDO; '' when missing) and its proportions. */
export interface ChartPageImages {
  day: string;
  night: string;
  width: number;
  height: number;
  /** v10.10: the page's georeferenced areas, on which the aircraft is drawn (none on plain pages); v10.11: the main one ('Low') first. */
  geo: readonly GeoReferencedChartArea[];
  /** v10.11: how many areas the page has in all (told on the page when none is georeferenced). */
  areas: number;
}

/** Where the aircraft is on a page, in the page's units, and which way its nose points there (degrees clockwise from the page's up). */
export interface ChartFix {
  x: number;
  y: number;
  deg: number;
}

const lcc = new LambertConformalConicProjection();
const at0 = new Float64Array(2), at1 = new Float64Array(2);
/** Whether `v` lies between `a` and `b`. */
const between = (v: number, a: number, b: number): boolean => v >= Math.min(a, b) && v <= Math.max(a, b);

/**
 * v10.10 (user: "também aparecer o avião nas cartas"): where a position is on a chart page, or null when none of the page's
 * georeferenced areas holds it. The sim gives each such area its world rectangle and its Lambert conformal conic projection, and the
 * SDK's ChartUtils sets a projection from them that maps the world onto the chart (insets and turned areas included); the nose's
 * direction comes from projecting a point a little ahead on the true heading. v10.11 (test 17, no aircraft on SBCT's ground chart):
 * the world rectangle only screens out what is far away (a turned area's corners do not bound it), the chart rectangle decides.
 */
export function onChart(page: ChartPageImages, lat: number, lon: number, hdgTrue: number): ChartFix | null {
  for (const area of page.geo) {
    const w = area.worldRectangle, c = area.chartRectangle;
    const nearLon = Math.abs(w.upperLeft[0] - w.lowerRight[0]) + 0.5, nearLat = Math.abs(w.upperLeft[1] - w.lowerRight[1]) + 0.5;
    if (!between(lon, Math.min(w.upperLeft[0], w.lowerRight[0]) - nearLon, Math.max(w.upperLeft[0], w.lowerRight[0]) + nearLon)
      || !between(lat, Math.min(w.upperLeft[1], w.lowerRight[1]) - nearLat, Math.max(w.upperLeft[1], w.lowerRight[1]) + nearLat)) {
      continue;
    }
    try {
      ChartUtils.setGeoProjectionFromChartArea(lcc, area);
      lcc.project({ lat, lon }, at0);
    } catch (e) {
      console.warn('F27 tablet: chart area projection failed', e);
      continue;
    }
    if (!between(at0[0], c.upperLeft[0], c.lowerRight[0]) || !between(at0[1], c.upperLeft[1], c.lowerRight[1])) {
      continue;
    }
    const r = (hdgTrue * Math.PI) / 180, d = 0.01;
    lcc.project({ lat: lat + d * Math.cos(r), lon: lon + (d * Math.sin(r)) / Math.cos((lat * Math.PI) / 180) }, at1);
    return { x: at0[0], y: at0[1], deg: (Math.atan2(at1[0] - at0[0], -(at1[1] - at0[1])) * 180) / Math.PI };
  }
  return null;
}

/** What a chart page looks like right now: an image URL, or an error code (0 = none). */
export interface ChartImageState {
  imageUrl: string;
  errorCode: number;
}

/** Shows chart page images. */
export interface ChartImageView {
  readonly image: Subscribable<ChartImageState>;
  show(url: string): void;
}

/** Where charts come from: the sim's ChartsClient (a fake one in the browser preview). Failures reject. */
export interface ChartSource {
  index(airportIdent: string, provider: ChartProvider): Promise<ChartEntry[]>;
  pages(guid: string): Promise<ChartPageImages[]>;
  createView(): ChartImageView;
}

// chart types per group (msfssdk LidoChartType / FaaChartType values); unknown types go to the airport group
const GROUP_OF: Record<ChartProvider, Partial<Record<string, ChartGroup>>> = {
  LIDO: { SID: 'dep', SIDPT: 'dep', 'SID Initial Climb': 'dep', ObstDep: 'dep', STAR: 'arr', IAC: 'app', VAC: 'app' },
  FAA: { DP: 'dep', ODP: 'dep', STAR: 'arr', IAP: 'app' },
};
// the airport charts first, ground chart on top (what the G3000 does)
const AIRPORT_ORDER: Partial<Record<string, number>> = { AGC: 0, APD: 0, APC: 1, HOT: 1, AFC: 2, AOI: 3, LVC: 4, MIN: 5, LAH: 6, DAU: 7, MRC: 8 };
// LIDO calls its airport charts by their codes alone
const LIDO_NAMES: Partial<Record<string, string>> = {
  AGC: 'Airport Ground Chart', APC: 'Airport Parking Chart', AFC: 'Airport Facility Chart', AOI: 'Airport Operational Info',
  LVC: 'Low Visibility Chart', MRC: 'Minimum Radar Vectoring Chart',
};

/** The sim's own charts, through the SDK's ChartsClient (the JS_LISTENER_CHARTS view listener). */
export const realCharts: ChartSource = {
  index: async (ident, provider) => {
    const index = await ChartsClient.getIndexForAirport(ICAO.value('A', '', '', ident), provider);
    const out: { entry: ChartEntry; order: number }[] = [];
    for (const category of index.charts) {
      const group = GROUP_OF[provider][category.name] ?? 'airport';
      for (const c of category.charts) {
        const code = c.name.split(' ')[0];
        const name = provider === 'LIDO' && LIDO_NAMES[code] ? c.name.replace(code, LIDO_NAMES[code] as string) : c.name;
        out.push({ entry: { guid: c.guid, name, group }, order: group === 'airport' ? AIRPORT_ORDER[category.name] ?? 9 : 0 });
      }
    }
    out.sort((a, b) => a.order - b.order || a.entry.name.localeCompare(b.entry.name));
    return out.map((o) => o.entry);
  },
  pages: async (guid) => {
    const pages = await ChartsClient.getChartPages(guid);
    const url = (urls: readonly { name: string; url: string }[], name: string): string => urls.find((u) => u.name === name)?.url ?? '';
    // v10.11: what the sim says about the pages' areas, for the debugger's console (Developer Mode)
    console.log(`F27 tablet: chart ${guid} pages`, JSON.stringify(pages.pages.map((p) => ({ w: p.width, h: p.height, geo: p.geoReferenced, areas: p.areas }))));
    return pages.pages.map((p) => ({
      day: url(p.urls, 'light_png'), night: url(p.urls, 'dark_png'), width: p.width, height: p.height,
      // the main view first, as the WT G3000 takes it ('Low'), then any inset
      geo: (p.areas ?? []).filter((a): a is GeoReferencedChartArea => !!a.geoReferenced).sort((a, b) => Number(b.layer === 'Low') - Number(a.layer === 'Low')),
      areas: (p.areas ?? []).length,
    }));
  },
  createView: () => {
    const view = new ChartView();
    ChartsClient.initializeChartView(view).catch(() => { /* no charts listener: the image stays empty and the page says so */ });
    return { image: view.image, show: (url) => view.showChartImage(url) };
  },
};

export type ChartsState = 'idle' | 'loading' | 'ready' | 'none' | 'error';

/** A promise that rejects after `ms` (the sim answers chart requests through a listener, which may never answer). */
const timeout = <T>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((ok, fail) => {
  const t = window.setTimeout(() => fail(new Error('timeout')), ms);
  p.then((v) => { window.clearTimeout(t); ok(v); }, (e) => { window.clearTimeout(t); fail(e); });
});

/**
 * The Charts tab (v10.3, user: "coloque as cartas do MSFS que ele tem hoje disponíveis"): an airport's chart list from the chosen
 * provider, the chosen chart's pages, and the image of the one on screen.
 */
export class ChartsModel {
  public readonly provider = Subject.create<ChartProvider>('LIDO');
  public readonly airport = Subject.create('');
  public readonly state = Subject.create<ChartsState>('idle');
  public readonly charts = Subject.create<ChartEntry[]>([]);
  public readonly group = Subject.create<ChartGroup>('airport');
  public readonly selected = Subject.create<ChartEntry | null>(null);
  public readonly pages = Subject.create<ChartPageImages[]>([]);
  public readonly pageIndex = Subject.create(0);
  public readonly pageState = Subject.create<ChartsState>('idle');
  /** The night image (LIDO only). */
  public readonly night = Subject.create(false);
  /** The image on screen ('' while none). */
  public readonly image = Subject.create<ChartImageState>({ imageUrl: '', errorCode: 0 });
  private view: ChartImageView | null = null;
  private request = 0;

  /**
   * @param source Where the charts come from.
   */
  constructor(private readonly source: ChartSource) { }

  /** Loads an airport's chart list (from the current provider), keeping the group the pilot was looking at. */
  public async open(ident: string): Promise<void> {
    const id = ++this.request;
    ident = ident.trim().toUpperCase();
    this.airport.set(ident);
    this.charts.set([]);
    this.clearChart();
    if (ident.length < 3) {
      this.state.set('idle');
      return;
    }
    this.state.set('loading');
    try {
      const list = await timeout(this.source.index(ident, this.provider.get()), 15000);
      if (id === this.request) {
        this.charts.set(list);
        this.state.set(list.length > 0 ? 'ready' : 'none');
        // something on screen at once: the first chart of the group in view, else the ground chart
        const first = list.find((c) => c.group === this.group.get()) ?? list[0];
        if (first) {
          void this.select(first);
        }
      }
    } catch (e) {
      if (id === this.request) {
        // ChartsClient rejects with a numeric code: 1 = not found (no charts for that airport from this provider)
        this.state.set(e === 1 ? 'none' : 'error');
      }
    }
  }

  /** Switches provider and reloads the list. */
  public setProvider(p: ChartProvider): void {
    if (p !== this.provider.get()) {
      this.provider.set(p);
      this.open(this.airport.get());
    }
  }

  /** Opens a chart on its first page. */
  public async select(entry: ChartEntry): Promise<void> {
    const id = ++this.request;
    this.selected.set(entry);
    this.pages.set([]);
    this.pageIndex.set(0);
    this.show('');
    this.pageState.set('loading');
    try {
      const pages = await timeout(this.source.pages(entry.guid), 15000);
      if (id === this.request) {
        this.pages.set(pages);
        this.pageState.set(pages.length > 0 ? 'ready' : 'none');
        this.showPage(0);
      }
    } catch {
      if (id === this.request) {
        this.pageState.set('error');
      }
    }
  }

  /** Shows page `i` of the open chart (in night colours when chosen and available). */
  public showPage(i: number): void {
    const pages = this.pages.get();
    if (i < 0 || i >= pages.length) {
      return;
    }
    this.pageIndex.set(i);
    const p = pages[i];
    this.show(this.night.get() && p.night ? p.night : p.day);
  }

  /** Day / night colours. */
  public toggleNight(): void {
    this.night.set(!this.night.get());
    this.showPage(this.pageIndex.get());
  }

  /** Whether the open page has a night image. */
  public hasNight(): boolean {
    const p = this.pages.get()[this.pageIndex.get()];
    return !!p && p.night !== '';
  }

  /** Closes the open chart. */
  private clearChart(): void {
    this.selected.set(null);
    this.pages.set([]);
    this.pageIndex.set(0);
    this.pageState.set('idle');
    this.show('');
  }

  /** Points the chart view at an image (created on first use: the sim keeps a chart view per instance). */
  private show(url: string): void {
    if (!this.view) {
      if (url === '') {
        return;
      }
      this.view = this.source.createView();
      this.view.image.sub((img) => this.image.set({ imageUrl: img.imageUrl, errorCode: img.errorCode }), true);
    }
    this.view.show(url);
  }
}
