import {
  AhrsPublisher, BingComponent, EventBus, FSComponent, GNSSPublisher, MapProjection, MapSyncedCanvasLayer,
  MapSyncedCanvasLayerProps, MapSystemBuilder, MapSystemKeys, Subject, Subscribable, UnitType, Vec2Math,
} from '@microsoft/msfs-sdk';

import { OfpFix } from './simbrief';

/**
 * The map of the Charts app (v10.10, user: "seria legal ter um mapa na parte de cartas"): the sim's own Bing terrain map around the
 * aircraft, north up, with the loaded OFP's route. The sim one is made the first time it is shown (`attach`), so a map that cannot be
 * made costs the rest of the tablet nothing; the browser preview has a stand-in.
 */
export interface TabletMap {
  /** Puts the map into its box: the first time the map is shown. */
  attach(box: HTMLElement): void;
  /** The map's size in pixels, which follows its box (the chart view, or full screen). */
  setSize(width: number, height: number): void;
  /** Distance from the aircraft to the map's top edge, in nautical miles. */
  setRange(nm: number): void;
  /** Awake while on screen; asleep the map costs nothing. */
  setAwake(awake: boolean): void;
  /** Called every frame. */
  update(now: number): void;
}

const OWNSHIP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 40 40"><path d="M0 -17 L2.6 -7 L15 1 L15 4.5 L2.6 1 '
  + 'L1.8 11 L6.5 14.5 L6.5 17 L0 15.2 L-6.5 17 L-6.5 14.5 L-1.8 11 L-2.6 1 L-15 4.5 L-15 1 L-2.6 -7 Z" fill="#ff3db8" stroke="#101418" '
  + 'stroke-width="1.6"/></svg>';

/** The OFP's route: a magenta line through its fixes, their names beside them (redrawn when the map or the route moves). */
class RouteLayer extends MapSyncedCanvasLayer<MapSyncedCanvasLayerProps<any> & { fixes: Subscribable<readonly OfpFix[]> }> {
  private dirty = true;
  private readonly at = new Float64Array(2);

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();
    this.props.fixes.sub(() => { this.dirty = true; });
  }

  /** @inheritdoc */
  public onMapProjectionChanged(mapProjection: MapProjection, changeFlags: number): void {
    super.onMapProjectionChanged(mapProjection, changeFlags);
    this.dirty = true;
  }

  /** @inheritdoc */
  public onUpdated(time: number, elapsed: number): void {
    super.onUpdated(time, elapsed);
    if (!this.dirty || !this.isAwake) {
      return;
    }
    this.dirty = false;
    const display = this.display, ctx = display.context, fixes = this.props.fixes.get(), proj = this.props.mapProjection;
    display.clear();
    if (fixes.length < 2) {
      return;
    }
    ctx.beginPath();
    fixes.forEach((f, i) => {
      proj.project({ lat: f.lat, lon: f.lon }, this.at);
      if (i === 0) {
        ctx.moveTo(this.at[0], this.at[1]);
      } else {
        ctx.lineTo(this.at[0], this.at[1]);
      }
    });
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff3db8';
    ctx.stroke();
    ctx.font = 'bold 15px Arial';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0b0e11';
    ctx.fillStyle = '#ffffff';
    for (const f of fixes) {
      proj.project({ lat: f.lat, lon: f.lon }, this.at);
      ctx.strokeText(f.ident, this.at[0] + 8, this.at[1] - 8);
      ctx.fillText(f.ident, this.at[0] + 8, this.at[1] - 8);
    }
  }
}

/**
 * The sim's map, through the SDK's MapSystem like the WT21's own maps: a Bing layer coloured by elevation, the route layer and the
 * aircraft, centred on the aircraft. The tablet instrument's bus gets its own GNSS and AHRS publishers for the aircraft's position and
 * heading. Built the first time the map is shown; if that fails, the box says so and the rest of the tablet carries on.
 * @param bus The tablet instrument's event bus.
 * @param fixes The loaded OFP's route.
 * @returns The map.
 */
export function createSimMap(bus: EventBus, fixes: Subscribable<readonly OfpFix[]>): TabletMap {
  const size = Subject.create(Vec2Math.create(760, 600));
  let range = 10;
  let map: { system: ReturnType<typeof buildMap>; gnss: GNSSPublisher; ahrs: AhrsPublisher } | null = null;
  let failed = false, awake = false;
  const project = (): void => map?.system.context.projection.set({ range: UnitType.NMILE.convertTo(range, UnitType.GA_RADIAN) });
  return {
    attach: (box) => {
      if (map || failed) {
        return;
      }
      try {
        const system = buildMap(bus, fixes, size);
        FSComponent.render(system.map, box);
        map = { system, gnss: new GNSSPublisher(bus), ahrs: new AhrsPublisher(bus) };
        map.gnss.startPublish();
        map.ahrs.startPublish();
        system.ref.instance.sleep();
        project();
      } catch (e) {
        failed = true;
        box.appendChild(Object.assign(document.createElement('div'), { className: 'chmap-preview', textContent: `Map unavailable: ${e}` }));
      }
    },
    setSize: (w, h) => size.set(Vec2Math.create(Math.round(w), Math.round(h))),
    setRange: (nm) => {
      range = nm;
      project();
    },
    setAwake: (on) => {
      if (map && on !== awake) {
        awake = on;
        if (on) {
          map.system.ref.instance.wake();
        } else {
          map.system.ref.instance.sleep();
        }
      }
    },
    update: (now) => {
      if (map && awake) {
        map.gnss.onUpdate();
        map.ahrs.onUpdate();
        map.system.ref.instance.update(now);
      }
    },
  };
}

/** The MapSystem itself (see createSimMap). */
function buildMap(bus: EventBus, fixes: Subscribable<readonly OfpFix[]>, size: Subscribable<Float64Array>) {
  const system = MapSystemBuilder.create(bus)
    .withBing('f27-tablet-map')
    .withLayer('f27route', (context) => <RouteLayer model={context.model} mapProjection={context.projection} fixes={fixes} />)
    .withOwnAirplaneIcon(44, `data:image/svg+xml;base64,${btoa(OWNSHIP_SVG)}`, Vec2Math.create(0.5, 0.5))
    // the aircraft's true heading, not the AHRS default (the heading indicator's gyro): a tablet knows where the aircraft points
    .withOwnAirplanePropBindings(['position', { key: 'hdgTrue', topic: 'actual_hdg_deg_true' }], 10)
    .withFollowAirplane()
    .withProjectedSize(size)
    .build('f27-tablet-map');
  const terrain = system.context.model.getModule(MapSystemKeys.TerrainColors);
  terrain.reference.set(EBingReference.SEA);
  terrain.colors.set(BingComponent.createEarthColorsArray('#2f6f9a', [
    { elev: 0, color: '#4f7f4b' }, { elev: 1500, color: '#7d9a55' }, { elev: 4000, color: '#a99a62' }, { elev: 8000, color: '#8a6a48' },
    { elev: 14000, color: '#e8e8e8' },
  ], 0, 14000, 60));
  terrain.colorsElevationRange.set(0, 14000);
  return system;
}

/** The browser preview's stand-in: the sim's map exists only in the sim. */
export function createPreviewMap(): TabletMap {
  return {
    attach: (box) => {
      if (!box.firstChild) {
        box.appendChild(Object.assign(document.createElement('div'), { className: 'chmap-preview', textContent: 'Bing map (sim only)' }));
      }
    },
    setSize: () => { /* nothing to size */ },
    setRange: () => { /* nothing to zoom */ },
    setAwake: () => { /* nothing to wake */ },
    update: () => { /* nothing to update */ },
  };
}
