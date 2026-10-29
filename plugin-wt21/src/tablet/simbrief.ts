import {
  EventBus, FacilityLoader, FacilityRepository, FacilitySearchType, FlightPlanRouteEnrouteLeg, FlightPlanRouteManager, FlightPlanRouteUtils, ICAO,
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
    })),
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
}

/**
 * Sends the OFP route to the FMS: the WT21 FMC auto-loads any route sent to the avionics through the sim's flight plan route manager
 * (FMC.js initFlightPlan: flightPlanRouteSyncManager.startAutoSync()), the same path as the EFB planner's "send to avionics".
 * Version 1: departure / destination airports and runways, every navlog fix in order (SID and STAR fixes as direct legs, the rest on
 * their airways), cruise altitude. The pilot picks the SID / STAR / approach in the FMC.
 * @param progress Called with (done, total) while the fixes are looked up in the navdata.
 */
export async function sendOfpToFms(ofp: Ofp, bus: EventBus, progress: (done: number, total: number) => void): Promise<SendResult> {
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
  const points = ofp.fixes.filter((f) => f.type !== 'apt' && f.ident !== 'TOC' && f.ident !== 'TOD' && f.ident !== '');
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
  return { legs: points.length, byCoordinates };
}
