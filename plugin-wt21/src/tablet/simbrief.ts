import {
  AirportFacility, EventBus, FacilityLoader, FacilityRepository, FacilitySearchType, FacilityType, FlightPlanRouteEnrouteLeg, FlightPlanRouteManager,
  FlightPlanRouteUtils, ICAO,
} from '@microsoft/msfs-sdk';

const LB_PER_KG = 2.20462;

/** One navlog fix of the OFP. */
export interface OfpFix {
  ident: string;
  /** SimBrief's type: wpt, vor, ndb, apt, ltlg (TOC / TOD / lat-lon points). */
  type: string;
  /** The airway flown TO this fix ('DCT' for direct; the procedure name on SID / STAR fixes). */
  via: string;
  lat: number;
  lon: number;
  sidStar: boolean;
  /** v11.5, the navlog the OFP viewer shows (a user: "An option to display the OFP in the EFB"): planned altitude (ft), leg distance
   * (nm), time from departure (s), planned fuel on board (lb), wind (degrees / kt). */
  altFt: number;
  legNm: number;
  totalSec: number;
  fuelLb: number;
  windDir: number;
  windKt: number;
}

/** The parts of the latest SimBrief OFP the tablet shows and loads (weights already in pounds). */
export interface Ofp {
  origin: string;
  originName: string;
  originRwy: string;
  dest: string;
  destName: string;
  destRwy: string;
  altn: string;
  routeText: string;
  cruiseFt: number;
  distanceNm: number;
  eteSec: number;
  aircraftIcao: string;
  callsign: string;
  generatedSec: number;
  fuelBlockLb: number;
  fuelTripLb: number;
  fuelReserveLb: number;
  fuelAltnLb: number;
  zfwLb: number;
  towLb: number;
  ldwLb: number;
  pax: number;
  /** Weight per passenger used by the OFP (with carry-on). */
  paxWeightLb: number;
  /** Payload: passengers + bags + freight. */
  payloadLb: number;
  fixes: OfpFix[];
  /** v11.6: SimBrief's SID and STAR (with their transitions; '' when it gave none), sent to the FMS as procedures. */
  sid: string;
  sidTrans: string;
  star: string;
  starTrans: string;
  /** v11.5 (user: "Ideal é igual a esse", SimBrief's PDF): the OFP page by page as SimBrief lays it out (empty if absent). One page at a
   * time: a single 900-line block came out cut short in the sim. */
  pages: OfpPage[];
}

/** One page of the OFP: its text, and the maps SimBrief draws on it (route, significant weather, winds, profile). */
export interface OfpPage {
  text: string;
  images: string[];
}

/** plan_html cut where SimBrief's PDF turns the page; only SimBrief's own images are kept, and the route map page is left out (user: "não
 * precisa trazer o Route"). */
export function planHtmlToPages(html: string): OfpPage[] {
  return html.split(/<h2[^>]*page-break[^>]*>[\s\S]*?<\/h2>/i)
    .filter((part) => !/_ROUTE\.\w+"/i.test(part))
    .map((part) => {
      const images: string[] = [];
      const re = /<img[^>]*\ssrc="(https:\/\/www\.simbrief\.com\/[^"]+)"/gi;
      for (let m = re.exec(part); m; m = re.exec(part)) {
        images.push(m[1]);
      }
      return { text: planHtmlToText(part), images };
    })
    .filter((p) => p.text !== '' || p.images.length > 0);
}

/** SimBrief's plan_html (the text of its PDF) as plain text: line breaks kept, tags dropped, entities decoded; shown as text, never html. */
export function planHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\s+$/g, '');
}

/** Error with a message for the pilot (SimBrief's own text when it gave one). */
export class OfpError extends Error { }

const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Fetches the pilot's latest OFP from the SimBrief API (the same call EFBs use). `user` is the SimBrief username, or the numeric
 * Pilot ID shown on the SimBrief account page.
 */
export async function fetchOfp(user: string): Promise<Ofp> {
  const id = user.trim();
  const query = /^\d+$/.test(id) ? `userid=${id}` : `username=${encodeURIComponent(id)}`;
  let j: any;
  try {
    const res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?${query}&json=1`);
    j = await res.json();
  } catch (e) {
    throw new OfpError('net');
  }
  const status = str(j?.fetch?.status);
  if (status && status !== 'Success') {
    throw new OfpError(status);
  }
  const toLb = str(j?.params?.units).toLowerCase().startsWith('kg') ? LB_PER_KG : 1;
  const fixList = j?.navlog?.fix ? (Array.isArray(j.navlog.fix) ? j.navlog.fix : [j.navlog.fix]) : [];
  return {
    origin: str(j?.origin?.icao_code),
    originName: str(j?.origin?.name),
    originRwy: str(j?.origin?.plan_rwy),
    dest: str(j?.destination?.icao_code),
    destName: str(j?.destination?.name),
    destRwy: str(j?.destination?.plan_rwy),
    altn: str(j?.alternate?.icao_code),
    routeText: str(j?.general?.route),
    cruiseFt: num(j?.general?.initial_altitude),
    distanceNm: num(j?.general?.route_distance) || num(j?.general?.air_distance),
    eteSec: num(j?.times?.est_time_enroute),
    aircraftIcao: str(j?.aircraft?.icaocode),
    callsign: str(j?.atc?.callsign) || `${str(j?.general?.icao_airline)}${str(j?.general?.flight_number)}`,
    generatedSec: num(j?.params?.time_generated),
    fuelBlockLb: num(j?.fuel?.plan_ramp) * toLb,
    fuelTripLb: num(j?.fuel?.est_burn) * toLb,
    fuelReserveLb: num(j?.fuel?.reserve) * toLb,
    fuelAltnLb: num(j?.fuel?.alternate_burn) * toLb,
    zfwLb: num(j?.weights?.est_zfw) * toLb,
    towLb: num(j?.weights?.est_tow) * toLb,
    ldwLb: num(j?.weights?.est_ldw) * toLb,
    pax: num(j?.weights?.pax_count),
    paxWeightLb: num(j?.weights?.pax_weight) * toLb,
    payloadLb: num(j?.weights?.payload) * toLb,
    fixes: fixList.map((f: any): OfpFix => ({
      ident: str(f?.ident),
      type: str(f?.type),
      via: str(f?.via_airway),
      lat: num(f?.pos_lat),
      lon: num(f?.pos_long),
      sidStar: str(f?.is_sid_star) === '1',
      altFt: num(f?.altitude_feet),
      legNm: num(f?.distance),
      totalSec: num(f?.time_total),
      fuelLb: num(f?.fuel_plan_onboard) * toLb,
      windDir: num(f?.wind_dir),
      windKt: num(f?.wind_spd),
    })),
    pages: planHtmlToPages(str(j?.text?.plan_html)),
    sid: str(j?.general?.sid_ident),
    sidTrans: str(j?.general?.sid_trans),
    star: str(j?.general?.star_ident),
    starTrans: str(j?.general?.star_trans),
  };
}

/** Great-circle distance in nautical miles. */
function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** How a sent route came out. */
export interface SendResult {
  /** Enroute points sent. */
  legs: number;
  /** Of which defined by coordinates (no navdata fix with that ident within 30 nm). */
  byCoordinates: number;
  /** SID / STAR sent as procedures, e.g. 'SID BAIA3B'. */
  procedures: string[];
  /** SID / STAR the sim's database lacks (a newer AIRAC in SimBrief): their fixes went as plain points, without constraints. */
  missing: string[];
  /** What the route was sent as, e.g. 'SBSP 35L > SBRJ 02R'. */
  sent: string;
}

/**
 * Sends the OFP route to the FMS: the WT21 FMC auto-loads any route sent to the avionics through the sim's flight plan route manager
 * (FMC.js initFlightPlan: flightPlanRouteSyncManager.startAutoSync()), the same path as the EFB planner's "send to avionics".
 * Version 1: departure / destination airports and runways, every navlog fix in order (SID and STAR fixes as direct legs, the rest on
 * their airways), cruise altitude. The pilot picks the SID / STAR / approach in the FMC.
 * @param progress Called with (done, total) while the fixes are looked up in the navdata.
 * @param useProcedures v11.6 (user: after the SID / STAR went as procedures the destination did not fill in): false sends the SID and STAR fixes as plain
 * points, the way it was before; the tablet has a switch for it.
 */
export async function sendOfpToFms(ofp: Ofp, bus: EventBus, progress: (done: number, total: number) => void, useProcedures = true): Promise<SendResult> {
  const loader = new FacilityLoader(FacilityRepository.getRepository(bus));
  await loader.awaitInitialization();
  const route = FlightPlanRouteUtils.emptyRoute();
  route.departureAirport = ICAO.value('A', '', '', ofp.origin);
  route.destinationAirport = ICAO.value('A', '', '', ofp.dest);
  const rwy = (r: string): { __Type: 'JS_RunwayIdentifier'; number: string; designator: string } => {
    const m = /^(\d{1,2})([LRCWAB]?)$/.exec(r.trim().toUpperCase());
    return { __Type: 'JS_RunwayIdentifier', number: m ? m[1].padStart(2, '0') : '', designator: m ? m[2] : '' };
  };
  route.departureRunway = rwy(ofp.originRwy);
  route.destinationRunway = rwy(ofp.destRwy);
  if (ofp.cruiseFt > 0) {
    route.cruiseAltitude = { __Type: 'JS_FlightAltitude', altitude: Math.round(ofp.cruiseFt / 100), isFlightLevel: true };
  }
  // v11.6 (user: "veja esse VNav na descida"): the SID and STAR go as procedures when the sim's database has them by those names, so the
  // FMS gets their altitude constraints, which WT21's VNAV needs to build a descent path (no constraint, no TOD, no PATH). Their fixes
  // are then not sent as points. A name the database lacks: the fixes go as points, as before.
  const procs = new Set<string>();
  const procedures: string[] = [], missing: string[] = [];
  const airport = async (ident: string): Promise<AirportFacility | null> => {
    try { return await loader.getFacility(FacilityType.Airport, ICAO.value('A', '', '', ident)); } catch { return null; }
  };
  if (useProcedures && ofp.sid) {
    const sid = (await airport(ofp.origin))?.departures.find((d) => d.name === ofp.sid);
    if (sid) {
      route.departure = sid.name;
      route.departureTransition = sid.enRouteTransitions.some((t) => t.name === ofp.sidTrans) ? ofp.sidTrans : '';
      procs.add(sid.name);
      procedures.push(`SID ${sid.name}`);
    } else {
      missing.push(`SID ${ofp.sid}`);
    }
  }
  if (useProcedures && ofp.star) {
    const star = (await airport(ofp.dest))?.arrivals.find((a) => a.name === ofp.star);
    if (star) {
      route.arrival = star.name;
      route.arrivalTransition = star.enRouteTransitions.some((t) => t.name === ofp.starTrans) ? ofp.starTrans : '';
      procs.add(star.name);
      procedures.push(`STAR ${star.name}`);
    } else {
      missing.push(`STAR ${ofp.star}`);
    }
  }
  const points = ofp.fixes.filter((f) => f.type !== 'apt' && f.ident !== 'TOC' && f.ident !== 'TOD' && f.ident !== '' && !(f.sidStar && procs.has(f.via)));
  let byCoordinates = 0;
  for (let i = 0; i < points.length; i++) {
    const f = points[i];
    progress(i, points.length);
    const leg: FlightPlanRouteEnrouteLeg = FlightPlanRouteUtils.emptyEnrouteLeg();
    let found = null;
    if (f.type !== 'ltlg') {
      const near = await loader.findNearestFacilitiesByIdent(FacilitySearchType.AllExceptVisual, f.ident, f.lat, f.lon, 1);
      found = near.length && distanceNm(near[0].lat, near[0].lon, f.lat, f.lon) < 30 ? near[0] : null;
    }
    if (found) {
      leg.fixIcao = found.icaoStruct;
    } else {
      leg.hasLatLon = true;
      leg.lat = f.lat;
      leg.lon = f.lon;
      leg.name = f.ident.slice(0, 7);
      byCoordinates++;
    }
    leg.via = f.sidStar || f.via === 'DCT' || !f.via ? '' : f.via.slice(0, 7);
    route.enroute.push(leg);
  }
  progress(points.length, points.length);
  const manager = await FlightPlanRouteManager.getManager();
  await manager.sendRouteToAvionics(route);
  const rw = (r: string): string => (r ? ` ${r}` : '');
  return { legs: points.length, byCoordinates, procedures, missing, sent: `${ofp.origin}${rw(ofp.originRwy)} > ${ofp.dest}${rw(ofp.destRwy)}` };
}
