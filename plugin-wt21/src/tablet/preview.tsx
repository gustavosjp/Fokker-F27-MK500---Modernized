import { FSComponent, GeoReferencedChartArea, Subject } from '@microsoft/msfs-sdk';

import { ChartGroup, ChartImageState, ChartSource } from './charts';
import { I18n } from './i18n';
import { createPreviewMap } from './map';
import { TabletModel } from './model';
import { SimBridge } from './sim';
import { Ofp } from './simbrief';
import { WeatherSource } from './weather';
import { TabletApp } from './TabletApp';

/**
 * Browser preview of the tablet (tablet-preview\index.html, not shipped): the real app on a fake aircraft at a gate, whose ground
 * actions change the fake state the way the sim would.
 */
const vars = new Map<string, number>([
  ['TOTAL WEIGHT', 38250], ['MAX GROSS WEIGHT', 43500], ['FUEL TOTAL QUANTITY WEIGHT', 6400], ['FUEL WEIGHT PER GALLON', 6.7],
  ['FUEL LEFT QUANTITY', 477.6], ['FUEL RIGHT QUANTITY', 477.6], ['FUEL LEFT CAPACITY', 1325], ['FUEL RIGHT CAPACITY', 1325],
  ['CG PERCENT', 24.6], ['AMBIENT TEMPERATURE', 23], ['SEA LEVEL PRESSURE', 1016], ['AMBIENT WIND DIRECTION', 140],
  ['AMBIENT WIND VELOCITY', 9], ['SIM ON GROUND', 1], ['BRAKE PARKING POSITION', 1], ['GROUND VELOCITY', 0], ['PUSHBACK STATE', 3], ['PUSHBACK AVAILABLE', 1], ['L:FSDT_GSX_DEPARTURE_STATE', 1], ['PLANE HEADING DEGREES MAGNETIC', 172], ['PLANE HEADING DEGREES TRUE', 151], ['PLANE LATITUDE', -23.6262], ['PLANE LONGITUDE', -46.6566],
  ['E:LOCAL TIME', 9 * 3600 + 42 * 60], ['E:ZULU TIME', 12 * 3600 + 42 * 60], ['INTERACTIVE POINT OPEN:0', 1],
  ['L:f275_AftDoor_Sw', 0], ['L:f275_CargoDoor_Sw', 0], ['L:StairFwd_isVisible', 1], ['L:StairAft_isVisible', 0], ['L:F27WT21_Chocks', 0], ['EMPTY WEIGHT', 28990], ['INDICATED ALTITUDE', 2631], ['E:LOCAL YEAR', 2026], ['E:LOCAL MONTH OF YEAR', 10], ['E:LOCAL DAY OF MONTH', 26],
  ['L:f275_Sw_Elec_ParcbatSel', 2], ['EXTERNAL POWER ON:1', 1], ['E:SIMULATION TIME', 0],
  ['FUELSYSTEM TANK QUANTITY:1', 230], ['FUELSYSTEM TANK QUANTITY:2', 230], ['FUELSYSTEM TANK QUANTITY:3', 13.2], ['FUELSYSTEM TANK QUANTITY:4', 13.2],
  ['FUELSYSTEM TANK CAPACITY:1', 668.9], ['FUELSYSTEM TANK CAPACITY:2', 668.9], ['FUELSYSTEM TANK CAPACITY:3', 13.2], ['FUELSYSTEM TANK CAPACITY:4', 13.2],
  // v10.6 Systems app, cold and dark on ground power: engines stopped, isolation valves and LP cocks open, the inverters on the GPU
  ['L:f275_dart_egt_01_ind', 24], ['L:f275_dart_egt_02_ind', 24], ['ENG OIL TEMPERATURE:1', 23], ['ENG OIL TEMPERATURE:2', 23],
  ['L:f275_WaterMeth_Aig01', 150], ['L:f275_WaterMeth_Aig02', 138],
  ['FUELSYSTEM VALVE OPEN:1', 1], ['FUELSYSTEM VALVE OPEN:2', 1], ['FUELSYSTEM VALVE OPEN:3', 1], ['FUELSYSTEM VALVE OPEN:4', 1],
  ['ELECTRICAL MAIN BUS VOLTAGE:1', 28], ['ELECTRICAL MAIN BUS VOLTAGE:2', 28], ['ELECTRICAL MAIN BUS VOLTAGE:3', 28],
  ['ELECTRICAL MAIN BUS VOLTAGE:4', 28], ['ELECTRICAL MAIN BUS VOLTAGE:5', 26.4], ['ELECTRICAL MAIN BUS VOLTAGE:6', 26.4],
  ['ELECTRICAL MAIN BUS VOLTAGE:9', 26.4], ['ELECTRICAL MAIN BUS VOLTAGE:12', 28], ['ELECTRICAL MAIN BUS VOLTAGE:13', 28],
  ['ELECTRICAL MAIN BUS VOLTAGE:15', 28], ['ELECTRICAL BATTERY VOLTAGE:1', 24.6], ['ELECTRICAL BATTERY VOLTAGE:2', 24.5],
  ['ELECTRICAL BATTERY LOAD:1', -3.2], ['ELECTRICAL BATTERY LOAD:2', -2.9], ['ELECTRICAL BATTERY ESTIMATED CAPACITY PCT:1', 96],
  ['ELECTRICAL BATTERY ESTIMATED CAPACITY PCT:2', 95], ['ELECTRICAL EXTERNAL POWER VOLTAGE:1', 28], ['L:f275_warn_gpu', 1],
  ['PRESSURIZATION CABIN ALTITUDE', 2631], ['L:F275bgt_PneuPress_Ppl', 2850], ['L:F275bgt_PneuPress_Brakes', 2800], ['L:F275bgt_PneuPress_Emerg', 2900],
]);
// the fake aircraft's state, to try other situations from the browser console (f27Vars.set('L:f275_RpmF27_01', 14200))
(window as unknown as { f27Vars: Map<string, number> }).f27Vars = vars;
/** The heading the fake tug pushes the nose to (the author's WASM keeps it to itself). */
let pushHdg = 0;
const fake: SimBridge = {
  get: (name) => vars.get(name) ?? 0,
  getString: (name) => (name === 'ATC ID' ? 'PT-LAJ' : ''),
  set: (name, _unit, value) => {
    if (name === 'K:TOGGLE_AIRCRAFT_EXIT_FAST') {
      vars.set('INTERACTIVE POINT OPEN:0', (vars.get('INTERACTIVE POINT OPEN:0') ?? 0) > 0 ? 0 : 1);
    } else if (name === 'K:TUG_DISABLE') {
      vars.set('PUSHBACK STATE', 3);
    } else if (name === 'K:TOGGLE_PUSHBACK') {
      // the sim's tug (v10.11.1): it comes and pushes straight back (a second toggle sends it away)
      vars.set('PUSHBACK STATE', (vars.get('PUSHBACK STATE') ?? 3) === 3 ? 0 : 3);
    } else if (name === 'VELOCITY BODY Z') {
      // the tablet pulling (v10.12): the fake aircraft moves at that speed
      vars.set(name, value);
      vars.set('GROUND VELOCITY', Math.abs(value) / 1.68781);
    } else if (name === 'ROTATION VELOCITY BODY Y') {
      // the sim turned three times the rate written in degrees a second (live test, 2026-10-28): the fake does too
      vars.set(name, value * 3);
    } else if (name === 'L:FSDT_GSX_MENU_OPEN' && value) {
      // GSX (f27Vars.set('L:FSDT_GSX_COUATL_STARTED', 1) to try it): its menu opens; here the pushback is taken as requested
      vars.set('L:FSDT_GSX_DEPARTURE_STATE', 4);
    } else if (/^L:f275_Pushback(Straight|Left|Right)$/.test(name) && value && vars.get('L:f275_PushbackToggle')) {
      // the author's tug as his WASM works it (v10.11): only in his pushback mode; a push on the present heading, then 5 degrees per
      // turn (Left: heading up); L:f275_PushHdg is the aircraft's heading less the push heading
      const hdg = vars.get('PLANE HEADING DEGREES MAGNETIC') ?? 0;
      pushHdg = name.endsWith('Straight') ? hdg : pushHdg + (name.endsWith('Left') ? 5 : -5);
      vars.set('L:f275_PushHdg', (((hdg - pushHdg) % 360) + 360) % 360);
      vars.set('PUSHBACK STATE', 0);
    } else {
      vars.set(name, value);
    }
  },
  load: (key) => window.localStorage.getItem(key),
  save: (key, value) => window.localStorage.setItem(key, value),
};

// a sample OFP (SimBrief's F50 profile, as the author recommends for the F27)
const sample: Ofp = {
  origin: 'SBSP', originName: 'Congonhas', originRwy: '17R', dest: 'SBRJ', destName: 'Santos Dumont', destRwy: '20L', altn: 'SBGL',
  routeText: 'SCB UW58 PCX DCT', cruiseFt: 17000, distanceNm: 208, eteSec: 3900, aircraftIcao: 'F50', callsign: 'TAM3410',
  generatedSec: 0, fuelBlockLb: 1950 * 2.20462, fuelTripLb: 1150 * 2.20462, fuelReserveLb: 420 * 2.20462, fuelAltnLb: 260 * 2.20462,
  zfwLb: 17300 * 2.20462, towLb: 19180 * 2.20462, ldwLb: 18030 * 2.20462, pax: 40, paxWeightLb: 84 * 2.20462,
  payloadLb: (40 * 84 + 520) * 2.20462, fixes: [],
};
// fake charts: a few per group, each page a drawn placeholder (the real ones come from the sim's chart listener)
const FAKE_CHARTS: [ChartGroup, string, number][] = [
  ['airport', 'Airport Ground Chart', 1], ['airport', 'Airport Parking Chart', 1], ['airport', 'Airport Operational Info', 2],
  ['dep', 'SID RWY 17R', 2], ['dep', 'SID RWY 35L', 1], ['arr', 'STAR RWY 17R', 1], ['app', 'ILS Z RWY 17R', 1], ['app', 'RNP Y RWY 35L', 1],
];
const fakePage = (title: string, page: number, night: boolean): string => {
  const bg = night ? '#1b2026' : '#ffffff', fg = night ? '#d8dde2' : '#1a1a1a';
  let lines = '';
  for (let i = 1; i < 12; i++) {
    lines += `<line x1="40" y1="${300 + i * 120}" x2="1200" y2="${300 + i * 120}" stroke="${fg}" stroke-opacity="0.25"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754"><rect width="1240" height="1754" fill="${bg}"/>`
    + `<rect x="40" y="40" width="1160" height="1674" fill="none" stroke="${fg}" stroke-width="4"/>${lines}`
    + `<text x="80" y="150" font-size="64" font-family="Arial" fill="${fg}">${title}</text>`
    + `<text x="80" y="230" font-size="40" font-family="Arial" fill="${fg}">page ${page} (preview)</text>`
    + `<circle cx="620" cy="1000" r="320" fill="none" stroke="${fg}" stroke-width="4"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
const fakeCharts: ChartSource = {
  index: (ident, provider) => new Promise((ok, fail) => window.setTimeout(() => (provider === 'FAA' && !ident.startsWith('K')
    ? fail(1) : ok(FAKE_CHARTS.map(([group, name], i) => ({ guid: `${ident}-${provider}-${i}`, name, group })))), 500)),
  pages: (guid) => new Promise((ok) => window.setTimeout(() => {
    const [, name, n] = FAKE_CHARTS[Number(guid.split('-')[2])];
    // the ground chart is georeferenced around the fake aircraft at Congonhas (the aircraft is drawn on it); the parking chart around
    // another corner of the field (the aircraft is outside it); the rest are not georeferenced (v10.11: the page says which)
    const area = (dLon: number): GeoReferencedChartArea => ({
      layer: 'Low', geoReferenced: true,
      chartRectangle: { upperLeft: [80, 260], lowerRight: [1160, 1660], orientation: 0 },
      worldRectangle: { upperLeft: [-46.672 + dLon, -23.612], lowerRight: [-46.644 + dLon, -23.642], orientation: 0 },
      projection: { standardParallel1: -23.6, standardParallel2: -23.65, centralMeridian: -46.658 },
    });
    const geo = name === 'Airport Ground Chart' ? [area(0)] : name === 'Airport Parking Chart' ? [area(0.05)] : [];
    ok(Array.from({ length: n }, (_, p) => ({ day: fakePage(name, p + 1, false), night: fakePage(name, p + 1, true), width: 1240, height: 1754, geo, areas: geo.length + 2 })));
  }, 300)),
  createView: () => {
    const image = Subject.create<ChartImageState>({ imageUrl: '', errorCode: 0 });
    return { image, show: (url): void => { window.setTimeout(() => image.set({ imageUrl: url, errorCode: 0 }), url ? 400 : 0); } };
  },
};
// a fake METAR for the airport the fake aircraft stands at
const fakeWeather: WeatherSource = {
  nearestAirport: () => new Promise((ok) => window.setTimeout(() => ok('SBSP'), 300)),
  metar: (ident) => new Promise((ok) => window.setTimeout(() => ok({
    ident, raw: `${ident} 261200Z 14009KT 9999 FEW030 BKN045 23/14 Q1016`, observed: '26 12:00Z', windDir: 140, windKt: 9, gustKt: null,
    visM: 9999, cavok: false, tempC: 23, dewC: 14, qnhHpa: 1016, ceilingFt: 4500,
  }), 400)),
};
const model = new TabletModel(fake, {
  fetch: (user) => new Promise((ok, fail) => window.setTimeout(() => (user === 'erro' ? fail(new Error('net')) : ok(sample)), 700)),
  send: (_ofp, progress) => new Promise((ok) => {
    let i = 0;
    const t = window.setInterval(() => {
      progress(++i, 6);
      if (i === 6) {
        window.clearInterval(t);
        ok({ legs: 6, byCoordinates: 0 });
      }
    }, 200);
  }),
}, fakeCharts, fakeWeather, new URLSearchParams(window.location.search).get('variant') === 'classic');
FSComponent.render(<TabletApp model={model} i18n={new I18n(model.lang)} map={createPreviewMap()} />, document.getElementById('F27TabletRoot'));
model.update();
// the tablet instrument's every-frame work (v10.12: the pull), and the fake aircraft turning at the yaw rate it is given
window.setInterval(() => {
  model.pull.update(Date.now());
  const hdg = (vars.get('PLANE HEADING DEGREES MAGNETIC') ?? 0) + (vars.get('ROTATION VELOCITY BODY Y') ?? 0) * 0.02;
  vars.set('PLANE HEADING DEGREES MAGNETIC', ((hdg % 360) + 360) % 360);
}, 20);
window.setInterval(() => {
  vars.set('E:LOCAL TIME', (vars.get('E:LOCAL TIME') ?? 0) + 0.25);
  vars.set('E:ZULU TIME', (vars.get('E:ZULU TIME') ?? 0) + 0.25);
  vars.set('E:SIMULATION TIME', (vars.get('E:SIMULATION TIME') ?? 0) + 0.25 * 20);   // the preview runs 20 times faster
  model.update();
}, 250);
