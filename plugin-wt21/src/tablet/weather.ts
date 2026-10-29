import {
  EventBus, FacilityLoader, FacilityRepository, FacilitySearchType, FacilityType, IcaoValue, Metar, MetarCloudLayerCoverage,
  MetarVisibilityUnits, MetarWindSpeedUnits,
} from '@microsoft/msfs-sdk';

/** What the Home page shows of an airport's METAR (the sim's own weather). */
export interface MetarInfo {
  ident: string;
  raw: string;
  /** Observation time, "dd hh:mmZ". */
  observed: string;
  /** Degrees true; null when variable. */
  windDir: number | null;
  windKt: number;
  gustKt: number | null;
  /** Metres; null when CAVOK or not reported. */
  visM: number | null;
  cavok: boolean;
  tempC: number | null;
  dewC: number | null;
  qnhHpa: number | null;
  /** The lowest broken or overcast layer, ft; null when none. */
  ceilingFt: number | null;
}

/** Where the Home page's weather comes from: the sim's facilities and METARs (a fake one in the browser preview). */
export interface WeatherSource {
  /** Ident of the airport nearest to a position, within 20 nm; null when none. */
  nearestAirport(lat: number, lon: number): Promise<string | null>;
  /** The airport's current METAR; null when the sim has none. */
  metar(ident: string): Promise<MetarInfo | null>;
}

const KT: Record<number, number> = { [MetarWindSpeedUnits.Knot]: 1, [MetarWindSpeedUnits.MeterPerSecond]: 1.94384, [MetarWindSpeedUnits.KilometerPerHour]: 0.539957 };

/** The parts of a METAR the tablet shows, in its units (kt, m, °C, hPa, ft). */
export function decodeMetar(m: Metar): MetarInfo {
  const kt = (v: number | undefined): number | null => (v === undefined ? null : Math.round(v * (KT[m.windSpeedUnits] ?? 1)));
  const vis = m.vis === undefined ? null : Math.round(m.visUnits === MetarVisibilityUnits.StatuteMile ? m.vis * 1609.34 : m.vis);
  const ceiling = m.layers.filter((l) => l.cover === MetarCloudLayerCoverage.Broken || l.cover === MetarCloudLayerCoverage.Overcast)
    .map((l) => l.alt * 100).sort((a, b) => a - b)[0];
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    ident: m.icao,
    raw: m.metarString,
    observed: `${pad(m.day)} ${pad(m.hour)}:${pad(m.min)}Z`,
    windDir: m.vrb || m.windDir === undefined ? null : m.windDir,
    windKt: kt(m.windSpeed) ?? 0,
    gustKt: kt(m.gust),
    visM: m.cavok ? null : vis,
    cavok: m.cavok,
    tempC: m.temp ?? null,
    dewC: m.dew ?? null,
    qnhHpa: m.altimeterQ ?? (m.altimeterA !== undefined ? Math.round(m.altimeterA * 33.8639) : null),
    ceilingFt: ceiling ?? null,
  };
}

/** Great-circle distance between two positions, in nautical miles. */
function nm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The sim's weather: a nearest-airport search session (kept, its results arrive as changes) and FacilityLoader.getMetar. */
export function realWeather(bus: EventBus): WeatherSource {
  const loader = new FacilityLoader(FacilityRepository.getRepository(bus));
  let session: Promise<{ searchNearest(lat: number, lon: number, radius: number, max: number): Promise<{ added: readonly IcaoValue[]; removed: readonly IcaoValue[] }> }> | null = null;
  const inRange = new Map<string, IcaoValue>();
  return {
    nearestAirport: async (lat, lon) => {
      session ??= loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport);
      const res = await (await session).searchNearest(lat, lon, 37040, 20);
      res.removed.forEach((i) => inRange.delete(i.ident));
      res.added.forEach((i) => inRange.set(i.ident, i));
      let best: string | null = null, bestNm = Infinity;
      for (const icao of inRange.values()) {
        const f = await loader.getFacility(FacilityType.Airport, icao);
        const d = nm(lat, lon, f.lat, f.lon);
        if (d < bestNm) {
          bestNm = d;
          best = icao.ident;
        }
      }
      return best;
    },
    metar: async (ident) => {
      const m = await loader.getMetar(ident);
      return m ? decodeMetar(m) : null;
    },
  };
}
