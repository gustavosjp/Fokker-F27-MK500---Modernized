// Just enough of the simulator's page globals for msfssdk.js to load in a normal browser; the preview app (F27TabletPreview.js)
// brings its own fake aircraft, so none of these is used for data.
window.BaseInstrument = class extends HTMLElement { };
window.SimVar = { GetSimVarValue: () => 0, SetSimVarValue: () => Promise.resolve(), GetRegisteredId: () => -1 };
window.Coherent = { on: () => ({ clear() { } }), off() { }, call: () => Promise.resolve(), trigger() { } };
window.RegisterViewListener = () => ({ on() { }, off() { }, trigger() { }, unregister() { } });
window.registerInstrument = () => { };
window.GameState = {};
window.LaunchFlowEvent = {};
window.Simplane = {};
window.EmptyCallback = { Void: () => { } };
// enums and helpers of the sim's own scripts that msfssdk reads while loading (empty is enough for the preview)
for (const name of ['APController', 'Airway', 'ApproachType', 'BingMapsFlags', 'EBingMode', 'EBingReference', 'EWeatherRadar',
  'Facilities', 'Name_Z', 'RunwayDesignator', 'XMLEngineDisplay']) {
  window[name] = window[name] || {};
}
window.Utils = { Clamp: (v, a, b) => Math.min(b, Math.max(a, v)), DEG2RAD: Math.PI / 180, RAD2DEG: 180 / Math.PI, FEET2METER: 0.3048 };
window.Avionics = { Utils: window.Utils };
