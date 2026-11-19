// Checklists. Item order follows POH VB-2960 Section 4.5a (preflight). Wording is condensed
// to the item and the action. A step completes when its check() becomes true (the pilot did it),
// or, for look-only items, when the pilot taps the part or presses "Checked".
import { state, powered, casMessages, stallWarning } from './state.js';

const sw = new Proxy({}, { get: (_, k) => state.sw[k] }); // always the current switch set, even after a reset
const allSwitchesOff = () => !['batt', 'altr', 'fuelPump', 'pitotHeat', 'strobe', 'nav', 'landing', 'ventFan', 'mapLight', 'magL', 'magR'].some(k => sw[k]);
const pfdUp = () => powered('cb_pfd') && state.avionics.pfdBoot > 5;
const hasCas = t => casMessages().some(m => m.t === t);

// Camera directions for each part of the walk-around (from the part toward the camera)
const IN = 'in', RW = [1.0, 0.55, 0.25], NOSE = [0.25, 0.45, -1], LW = [-1.0, 0.55, 0.25], TAIL = [0.55, 0.5, 1], UNDER_R = [0.8, -0.05, -0.6], UNDER_L = [-0.8, -0.05, -0.6];

export const PREFLIGHT = {
  id: 'preflight', title: 'Preflight', ref: 'POH 4.5a',
  sections: [
    { title: 'Cockpit', steps: [
      { t: 'Control wheel', a: 'RELEASE RESTRAINT', target: 'controlLock', view: IN, check: () => !state.controlLock, tip: 'Tap the seat belt wrapped around the wheel.' },
      { t: 'Parking brake', a: 'SET', target: 'parkBrake', view: IN, check: () => state.parkBrake },
      { t: 'All panel switches', a: 'OFF', target: 'batt', view: IN, check: allSwitchesOff, tip: 'Everything in the switch row, the mags and the map light down.' },
      { t: 'Mixture', a: 'IDLE CUT-OFF', target: 'mixture', view: IN, check: () => state.mixture < 0.03, tip: 'Red knob full aft.' },
      { t: 'Left and right mags', a: 'OFF', target: 'magL', view: IN, check: () => !sw.magL && !sw.magR },
      { t: 'Battery master', a: 'ON', target: 'batt', view: IN, check: () => sw.batt, tip: 'The displays start up. On the PFD, tap Continue on the database page.' },
      { t: 'Panel lighting (night flight)', a: 'VERIFY', target: 'dimPanel', view: IN, look: true, tip: 'Turn the PANEL dimmer and watch the red light under the glareshield.' },
      { t: 'Pitot heat', a: 'ON', target: 'pitotHeat', view: IN, check: () => sw.pitotHeat },
      { t: 'P HEAT OFF message', a: 'GOES OUT', target: 'pfd', view: IN, check: () => pfdUp() && state.avionics.g3xPage === 'main' && sw.pitotHeat && !hasCas('P HEAT OFF'), tip: 'Look at the CAS box at the lower right of the PFD. If the database page is showing, tap Continue.' },
      { t: 'Fuel', a: 'CHECK QUANTITY AND BALANCE', target: 'pfd', view: IN, look: true, tip: 'FUEL QTY on the engine strip shows left and right tanks.' },
      { t: 'Exterior light switches', a: 'ON', target: 'nav', view: IN, check: () => sw.nav && sw.strobe && sw.landing, tip: 'Strobe, nav and landing light.' },
      { t: 'Exterior lights', a: 'VERIFY WORKING', target: 'landingLens', view: [0.35, 0.3, -1], look: true, far: 6.5, tip: 'Landing light in the nose, nav lights and strobes on both tips, white light at the tail.' },
      { t: 'Pitot/static head', a: 'CHECK WARM', target: 'pitotTube', view: UNDER_L, check: () => state.events.pitotWarm, tip: 'Give it about half a minute, then tap the head to feel it. It gets hot, so touch it lightly. Limit ground use to about three minutes.' },
      { t: 'Stall warning', a: 'CHECK', target: 'stallVane', view: [-0.6, 0.35, -1], check: () => state.events.stallHorn, tip: 'Press and hold the lift detector on the left leading edge. Listen for the horn.' },
      { t: 'All lighting switches', a: 'OFF', target: 'strobe', view: IN, check: () => !sw.nav && !sw.strobe && !sw.landing && !sw.mapLight },
      { t: 'Pitot heat', a: 'OFF', target: 'pitotHeat', view: IN, check: () => !sw.pitotHeat },
      { t: 'P HEAT OFF message', a: 'ON', target: 'pfd', view: IN, check: () => pfdUp() && !sw.pitotHeat && (state.avionics.g3xPage !== 'main' || hasCas('P HEAT OFF')), look: true },
      { t: 'Battery master', a: 'OFF', target: 'batt', view: IN, check: () => !sw.batt },
      { t: 'Flaps', a: 'EXTEND', target: 'flaps', view: IN, check: () => state.flaps > 0, tip: 'Pull the handle up. The flaps only lock and hold a step load when fully up, so note the position before anyone climbs in.' },
      { t: 'Primary flight controls', a: 'FULL AND FREE', target: 'yoke', view: IN, check: () => ['pitchAft', 'pitchFwd', 'rollL', 'rollR', 'rudL', 'rudR'].every(k => state.events[k]), tip: 'Drag the wheel to each stop (forward, aft, left, right) and the pedals both ways. Watch the surfaces in the close-up.', watch: 'aileronR' },
      { t: 'Stabilator and rudder trim', a: 'NEUTRAL', target: 'pitchTrim', view: IN, check: () => Math.abs(state.pitchTrim) < 0.05 && Math.abs(state.rudderTrim) < 0.05, tip: 'Trim wheel between the seats and the rudder trim knob on the pedestal.' },
      { t: 'Pitot and static systems', a: 'DRAIN', target: 'pitotDrain', view: IN, check: () => state.events.pitotDrain, tip: 'Drain valves on the lower left side of the cabin.' },
      { t: 'Windows', a: 'CHECK CLEAN', target: 'windshield', view: [0.3, 0.5, -1], look: true },
      { t: 'Required papers and POH', a: 'ON BOARD', target: 'docs', view: IN, look: true, tip: 'Airworthiness and registration certificates, POH with weight and balance.' },
      { t: 'Weight and balance', a: 'VERIFY', target: 'docs', view: IN, look: true, tip: 'Within limits for this flight. The G3X W&B page can help with the arithmetic.' },
      { t: 'Tow bar', a: 'STOWED AND SECURE', target: 'towbar', view: IN, look: true },
    ] },
    { title: 'Right wing', steps: [
      { t: 'Surface condition', a: 'CLEAR OF ICE, FROST, SNOW', target: 'wingR', view: [0.6, 1.0, 0.5], look: true },
      { t: 'Flap and hinges', a: 'NO DAMAGE OR INTERFERENCE', target: 'flapR', view: [0.6, 0.4, 1], look: true },
      { t: 'Aileron and hinges', a: 'NO DAMAGE OR INTERFERENCE', target: 'aileronR', view: [0.5, 0.4, 1], look: true },
      { t: 'Static wicks', a: 'SECURE', target: 'wicksR', view: [0.4, 0.3, 1], look: true },
      { t: 'Wing tip and lights', a: 'CHECK', target: 'navR', view: [1, 0.3, 0.2], look: true },
      { t: 'Fuel tank', a: 'CHECK SUPPLY, SECURE CAP', target: 'fuelCapR', view: [0.4, 1, -0.3], check: () => state.events.capOpenR && state.ext.fuelCapR === 'closed', tip: 'Open the cap and look at the fuel against the tab (the bottom of the tab is 17 gal usable). Then close and secure it.' },
      { t: 'Fuel tank vent', a: 'CLEAR', target: 'ventR', view: UNDER_R, look: true },
      { t: 'Fuel tank sump', a: 'DRAIN AND CHECK', target: 'sumpR', view: UNDER_R, check: () => state.events.sumpR, tip: 'Check for water, sediment and proper fuel (100LL is blue). Make sure no fire hazard exists before starting.' },
      { t: 'Tie-down and chock', a: 'REMOVE', target: 'tiedownR', view: [1, 0.3, 0.3], check: () => !state.ext.tiedownR && !state.ext.chockR, tip: 'Tap the rope, then the chocks at the right main wheel.' },
      { t: 'Main gear strut', a: 'PROPER INFLATION (4.5 in)', target: 'mainGearR', view: [1, 0.25, -0.4], look: true },
      { t: 'Tire', a: 'CHECK', target: 'mainGearR', view: [1, 0.2, -0.2], look: true },
      { t: 'Brake block and disc', a: 'CHECK', target: 'mainGearR', view: [-0.6, 0.2, 0.5], look: true },
      { t: 'Fresh air inlet', a: 'CLEAR', target: 'airInletR', view: [0.5, 0.2, -1], look: true },
    ] },
    { title: 'Nose', steps: [
      { t: 'General condition', a: 'CHECK', target: 'cowl', view: NOSE, look: true, tip: 'Look for oil or fluid leaks.' },
      { t: 'Cowling', a: 'SECURE', target: 'cowl', view: [0.7, 0.5, -0.6], look: true },
      { t: 'Windshield', a: 'CLEAN', target: 'windshield', view: [0.2, 0.6, -1], look: true },
      { t: 'Oil', a: 'CHECK QUANTITY', target: 'oilDoor', view: [0.6, 0.9, -0.3], check: () => state.events.oilChecked, tip: 'Open the oil door and pull the dipstick (yellow cap). Capacity is 8 qt.' },
      { t: 'Dipstick', a: 'SEATED AND SECURE', target: 'oilDoor', view: [0.6, 0.9, -0.3], check: () => state.events.oilChecked && state.ext.dipstick === 'in' },
      { t: 'Oil filler door', a: 'SECURE', target: 'oilDoor', view: [0.6, 0.9, -0.3], check: () => state.events.oilChecked && state.ext.oilDoor === 'closed' },
      { t: 'Propeller and spinner', a: 'CHECK', target: 'prop', view: NOSE, look: true, tip: 'Nicks, cracks or other damage. Treat the prop as live.' },
      { t: 'Air inlets', a: 'CLEAR', target: 'cowlInlets', view: NOSE, look: true },
      { t: 'Chock', a: 'REMOVE', target: 'chockN', view: [0.3, 0.3, -1], check: () => !state.ext.chockN },
      { t: 'Nose gear strut', a: 'PROPER INFLATION (3.25 in)', target: 'noseGear', view: [0.8, 0.2, -0.6], look: true },
      { t: 'Tire', a: 'CHECK', target: 'noseGear', view: [0.6, 0.15, -0.8], look: true },
      { t: 'Fuel strainer', a: 'DRAIN', target: 'strainer', view: [-0.8, -0.05, -0.4], check: () => state.events.strainer, tip: 'Lower left side of the nose section.' },
    ] },
    { title: 'Left wing', steps: [
      { t: 'Surface condition', a: 'CLEAR OF ICE, FROST, SNOW', target: 'wingL', view: [-0.6, 1.0, 0.5], look: true },
      { t: 'Fresh air inlet', a: 'CLEAR', target: 'airInletL', view: [-0.5, 0.2, -1], look: true },
      { t: 'Main gear strut', a: 'PROPER INFLATION (4.5 in)', target: 'mainGearL', view: [-1, 0.25, -0.4], look: true },
      { t: 'Tire', a: 'CHECK', target: 'mainGearL', view: [-1, 0.2, -0.2], look: true },
      { t: 'Brake block and disc', a: 'CHECK', target: 'mainGearL', view: [0.6, 0.2, 0.5], look: true },
      { t: 'Fuel tank sump', a: 'DRAIN AND CHECK', target: 'sumpL', view: UNDER_L, check: () => state.events.sumpL, tip: 'Check for water, sediment and proper fuel.' },
      { t: 'Fuel tank vent', a: 'CLEAR', target: 'ventL', view: UNDER_L, look: true },
      { t: 'Tie-down and chock', a: 'REMOVE', target: 'tiedownL', view: [-1, 0.3, 0.3], check: () => !state.ext.tiedownL && !state.ext.chockL },
      { t: 'Fuel tank', a: 'CHECK SUPPLY, SECURE CAP', target: 'fuelCapL', view: [-0.4, 1, -0.3], check: () => state.events.capOpenL && state.ext.fuelCapL === 'closed' },
      { t: 'Pitot/static head', a: 'REMOVE COVER, HOLES CLEAR', target: 'pitotTube', view: UNDER_L, check: () => !state.ext.pitotCover, tip: 'Tap the red cover to remove it.' },
      { t: 'OAT probe', a: 'CHECK', target: 'oat', view: UNDER_L, look: true },
      { t: 'Wing tip and lights', a: 'CHECK', target: 'navL', view: [-1, 0.3, 0.2], look: true },
      { t: 'Aileron and hinges', a: 'NO DAMAGE OR INTERFERENCE', target: 'aileronL', view: [-0.5, 0.4, 1], look: true },
      { t: 'Flap and hinges', a: 'NO DAMAGE OR INTERFERENCE', target: 'flapL', view: [-0.6, 0.4, 1], look: true },
      { t: 'Static wicks', a: 'SECURE', target: 'wicksL', view: [-0.4, 0.3, 1], look: true },
    ] },
    { title: 'Fuselage and tail', steps: [
      { t: 'Antennas', a: 'CHECK', target: 'antennas', view: [-0.5, 0.8, 0.3], look: true },
      { t: 'Empennage', a: 'CLEAR OF ICE, FROST, SNOW', target: 'empennage', view: [-0.7, 0.5, 1], look: true },
      { t: 'Stabilator and trim tab', a: 'NO DAMAGE OR INTERFERENCE', target: 'stabilator', view: [-0.4, 0.6, 1], look: true },
      { t: 'Rudder', a: 'NO DAMAGE OR INTERFERENCE', target: 'rudder', view: [-0.3, 0.3, 1], look: true },
      { t: 'Static wicks', a: 'SECURE', target: 'wicksTail', view: [0.3, 0.4, 1], look: true },
      { t: 'Tie-down', a: 'REMOVE', target: 'tiedownT', view: [0.6, 0.3, 1], check: () => !state.ext.tiedownT },
    ] },
  ],
};

export const CHECKLISTS = [PREFLIGHT];

export function flatSteps(list) {
  const out = [];
  list.sections.forEach((sec, si) => sec.steps.forEach((st, i) => out.push({ ...st, sec: sec.title, si, i, key: `${si}.${i}` })));
  return out;
}
