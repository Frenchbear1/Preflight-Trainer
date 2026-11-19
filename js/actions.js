// What each part does when you tap or drag it, and what the info card offers.
import { state, set, emit, casMessages, note, powered } from './state.js';
import { BREAKERS, SWITCHES, INFO } from './data.js';
import { click, tone } from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ACTIONS = {};
let displays = null;
export function setDisplays(d) { displays = d; }

const onOff = v => (v ? 'ON' : 'OFF');

// Toggle switches
[...SWITCHES.map(s => s.id), 'magL', 'magR', 'mapLight'].forEach(id => {
  ACTIONS[id] = {
    state: () => onOff(state.sw[id]),
    tap: () => { set('sw.' + id, !state.sw[id]); click(); },
    options: () => [{ label: 'ON', do: () => { set('sw.' + id, true); click(); }, selected: () => state.sw[id] }, { label: 'OFF', do: () => { set('sw.' + id, false); click(); }, selected: () => !state.sw[id] }],
  };
});

ACTIONS.start = {
  state: () => (state.engine.running ? 'RUNNING' : state.startPressed ? 'CRANKING' : 'Released'),
  tap: () => {}, // press and hold is handled with the drag hook below
  drag: {
    start: () => { state.startPressed = true; emit('start'); click(); return null; },
    move: () => {},
  },
  hold: true,
  release: () => { state.startPressed = false; emit('start'); },
  options: () => [{ label: 'Hold to crank (2 s)', do: () => { state.startPressed = true; emit('start'); setTimeout(() => { state.startPressed = false; emit('start'); }, 2200); } }],
};

ACTIONS.elt = {
  state: () => state.elt,
  tap: () => { set('elt', state.elt === 'ARM' ? 'ON' : 'ARM'); click(); },
  options: () => ['ON', 'ARM', 'TEST'].map(v => ({ label: v === 'ARM' ? 'ARM/OFF' : v, do: () => { set('elt', v); click(); if (v === 'TEST') setTimeout(() => set('elt', 'ARM'), 1200); }, selected: () => state.elt === v })),
};

// Breakers
BREAKERS.forEach(b => {
  ACTIONS[b.id] = {
    name: () => `${b.label.replace('\n', ' ')} breaker (${b.amps} A)`,
    info: 'breaker',
    state: () => (state.breakers[b.id] ? 'IN' : 'PULLED'),
    tap: () => { state.breakers[b.id] = !state.breakers[b.id]; emit('breakers'); click('breaker'); },
    options: () => [{ label: 'Push in', do: () => { state.breakers[b.id] = true; emit('breakers'); click('breaker'); }, selected: () => state.breakers[b.id] }, { label: 'Pull', do: () => { state.breakers[b.id] = false; emit('breakers'); click('breaker'); }, selected: () => !state.breakers[b.id] }],
  };
});
INFO.breaker = { name: 'Circuit breaker', ref: 'POH 7.21, Figure 7-17', text: 'Row 1 is essential bus 1, row 2 is essential bus 2. A tripped breaker pops out and shows a white band. Tap to pull or reset.' };

// Continuous controls: dragging up / forward increases the value
const slider = (path, { name, min = 0, max = 1, sens = 0.004, fmt, axis = 'y', steps } = {}) => ({
  state: () => fmt(+get(path)),
  drag: {
    start: () => +get(path),
    move: (dx, dy, v0) => { let v = clamp(v0 + (axis === 'y' ? -dy : dx) * sens * (max - min), min, max); if (steps) v = steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)); setPath(path, v); },
  },
  options: () => [{ range: true, label: name, min, max, step: (max - min) / 100, value: () => get(path), set: v => setPath(path, v) }],
});
function get(path) { return path.split('.').reduce((o, k) => o[k], state); }
function setPath(path, v) { set(path, v); }

ACTIONS.throttle = slider('throttle', { name: 'Throttle', sens: 0.005, fmt: v => (v < 0.02 ? 'IDLE' : v > 0.98 ? 'FULL' : Math.round(v * 100) + '% open') });
ACTIONS.throttle.options = () => [
  { label: 'Idle', do: () => set('throttle', 0), selected: () => state.throttle < 0.02 },
  { label: '½ in open', do: () => set('throttle', 0.12) },
  { label: 'Full', do: () => set('throttle', 1), selected: () => state.throttle > 0.98 },
  { range: true, label: 'Throttle', min: 0, max: 1, step: 0.01, value: () => state.throttle, set: v => set('throttle', v) },
];
ACTIONS.mixture = slider('mixture', { name: 'Mixture', sens: 0.005, fmt: v => (v < 0.03 ? 'IDLE CUT-OFF' : v > 0.97 ? 'FULL RICH' : Math.round(v * 100) + '% rich') });
ACTIONS.mixture.options = () => [
  { label: 'Idle cut-off', do: () => set('mixture', 0), selected: () => state.mixture < 0.03 },
  { label: 'Full rich', do: () => set('mixture', 1), selected: () => state.mixture > 0.97 },
  { range: true, label: 'Mixture', min: 0, max: 1, step: 0.01, value: () => state.mixture, set: v => set('mixture', v) },
];
ACTIONS.friction = slider('friction', { name: 'Friction', fmt: v => (v > 0.7 ? 'Tight' : v < 0.3 ? 'Loose' : 'Medium') });
ACTIONS.dimAvionics = slider('dimAvionics', { name: 'Avionics brightness', fmt: v => (v < 0.04 ? 'PHOTOCELL' : Math.round(v * 100) + '%') });
ACTIONS.dimPanel = slider('dimPanel', { name: 'Panel brightness', fmt: v => Math.round(v * 100) + '%' });
ACTIONS.heat = slider('heat', { name: 'Cabin heat', axis: 'x', fmt: v => (v < 0.05 ? 'OFF' : v > 0.95 ? 'ON' : Math.round(v * 100) + '%') });
ACTIONS.defrost = slider('defrost', { name: 'Defrost', axis: 'x', fmt: v => (v < 0.05 ? 'OFF' : v > 0.95 ? 'ON' : Math.round(v * 100) + '%') });
ACTIONS.pitchTrim = slider('pitchTrim', { name: 'Stabilator trim', min: -1, max: 1, sens: 0.003, fmt: v => (Math.abs(v) < 0.05 ? 'NEUTRAL' : v > 0 ? 'Nose up ' + Math.round(v * 100) + '%' : 'Nose down ' + Math.round(-v * 100) + '%') });
ACTIONS.pitchTrim.options = () => [{ label: 'Neutral', do: () => set('pitchTrim', 0), selected: () => Math.abs(state.pitchTrim) < 0.05 }, { label: 'Takeoff', do: () => set('pitchTrim', 0.1), selected: () => Math.abs(state.pitchTrim - 0.1) < 0.04 }, { range: true, label: 'Trim', min: -1, max: 1, step: 0.02, value: () => state.pitchTrim, set: v => set('pitchTrim', v) }];
ACTIONS.rudderTrim = slider('rudderTrim', { name: 'Rudder trim', min: -1, max: 1, axis: 'x', sens: 0.003, fmt: v => (Math.abs(v) < 0.05 ? 'NEUTRAL' : v > 0 ? 'Right ' + Math.round(v * 100) + '%' : 'Left ' + Math.round(-v * 100) + '%') });
ACTIONS.rudderTrim.options = () => [{ label: 'Neutral', do: () => set('rudderTrim', 0), selected: () => Math.abs(state.rudderTrim) < 0.05 }, { range: true, label: 'Rudder trim', min: -1, max: 1, step: 0.02, value: () => state.rudderTrim, set: v => set('rudderTrim', v) }];

ACTIONS.flaps = {
  state: () => (state.flaps ? state.flaps + '°' : 'UP (0°)'),
  tap: () => { const seq = [0, 10, 25, 40]; set('flaps', seq[(seq.indexOf(state.flaps) + 1) % 4]); click(); },
  drag: { start: () => state.flaps, move: (dx, dy, v0) => { const seq = [0, 10, 25, 40]; const i = clamp(Math.round(seq.indexOf(v0) + -dy / 40), 0, 3); if (seq[i] !== state.flaps) { set('flaps', seq[i]); click(); } } },
  options: () => [0, 10, 25, 40].map(v => ({ label: v ? v + '°' : 'Up', do: () => { set('flaps', v); click(); }, selected: () => state.flaps === v })),
};

ACTIONS.fuelSel = {
  state: () => ({ L: 'LEFT TANK', R: 'RIGHT TANK', OFF: 'OFF' })[state.fuelSel],
  tap: () => { set('fuelSel', state.fuelSel === 'L' ? 'R' : 'L'); click('knob'); },
  options: () => [['L', 'Left'], ['R', 'Right'], ['OFF', 'Off (press button)']].map(([v, l]) => ({ label: l, do: () => { set('fuelSel', v); click('knob'); }, selected: () => state.fuelSel === v })),
};
ACTIONS.parkBrake = {
  state: () => (state.parkBrake ? 'SET' : 'RELEASED'),
  tap: () => { set('parkBrake', !state.parkBrake); click(); },
  options: () => [{ label: 'Set', do: () => set('parkBrake', true), selected: () => state.parkBrake }, { label: 'Release', do: () => set('parkBrake', false), selected: () => !state.parkBrake }],
};
ACTIONS.altAir = {
  state: () => state.altAir,
  tap: () => { set('altAir', state.altAir === 'CLOSE' ? 'OPEN' : 'CLOSE'); click(); },
  options: () => ['CLOSE', 'OPEN'].map(v => ({ label: v, do: () => set('altAir', v), selected: () => state.altAir === v })),
};
ACTIONS.altStatic = {
  state: () => (state.altStatic ? 'OPEN (alternate)' : 'OFF (normal)'),
  tap: () => { set('altStatic', !state.altStatic); click(); },
  options: () => [{ label: 'Off', do: () => set('altStatic', false), selected: () => !state.altStatic }, { label: 'Open', do: () => set('altStatic', true), selected: () => state.altStatic }],
};
ACTIONS.pitotDrain = { tap: () => { click('knob'); note('pitotDrain'); }, state: () => (state.events.pitotDrain ? 'Drained, closed' : 'Closed'), options: () => [{ label: 'Open briefly to drain', do: () => { click('knob'); note('pitotDrain'); } }] };
INFO.pitotDrain = { name: 'Pitot and static drains', ref: 'POH 7.25', text: 'Separate drain valves for the pitot and static lines on the left lower side of the cabin. Open briefly to drain water, then close.' };

ACTIONS.yoke = {
  state: () => `Pitch ${state.yokePitch > 0.05 ? 'aft' : state.yokePitch < -0.05 ? 'forward' : 'neutral'}, roll ${state.yokeRoll > 0.05 ? 'right' : state.yokeRoll < -0.05 ? 'left' : 'level'}`,
  drag: { start: () => [state.yokePitch, state.yokeRoll], move: (dx, dy, v0) => { if (state.controlLock) return; state.yokePitch = clamp(v0[0] + dy * 0.006, -1, 1); state.yokeRoll = clamp(v0[1] + dx * 0.006, -1, 1); emit('yoke'); } },
  release: () => {},
  options: () => [
    ...(state.controlLock ? [{ label: 'Release restraint first', do: () => set('controlLock', false) }] : []),
    { label: 'Full aft', do: () => set('yokePitch', 1) }, { label: 'Full forward', do: () => set('yokePitch', -1) },
    { label: 'Full left', do: () => set('yokeRoll', -1) }, { label: 'Full right', do: () => set('yokeRoll', 1) },
    { label: 'Neutral', do: () => { state.yokePitch = 0; state.yokeRoll = 0; emit('yoke'); } },
  ],
};
ACTIONS.gmc = {
  state: () => (!powered('cb_autopilot') ? 'OFF' : state.avionics.pftT < 30 ? 'Preflight test running' : state.ap.engaged ? 'AP ENGAGED' : 'AP off'),
  tap: () => { if (powered('cb_autopilot') && state.avionics.pftT >= 30) { state.ap.engaged = !state.ap.engaged; if (state.ap.engaged) note('apEngaged'); else state.ap.discFlash = 2; emit('ap'); click(); } },
  options: () => [{ label: state.ap.engaged ? 'AP off' : 'Press AP', do: () => ACTIONS.gmc.tap() }],
};
ACTIONS.apDisc = {
  name: () => 'A/P DISC / trim interrupt',
  state: () => (state.ap.engaged ? 'Autopilot engaged' : 'Autopilot off'),
  tap: () => { if (state.ap.engaged) { state.ap.engaged = false; state.ap.discFlash = 2.5; note('apDisc'); const t = tone(1000, 0.05); setTimeout(() => t.stop(), 900); } click(); emit('ap'); },
};
INFO.apDisc = { name: 'A/P DISC button', ref: 'POH 4.5g', text: 'Red button on the left horn of the pilot wheel. Disconnects the autopilot with an audio alert.' };
ACTIONS.door = {
  state: () => (state.ext.door === 'latched' ? 'CLOSED AND LATCHED' : 'OPEN'),
  tap: () => { state.ext.door = state.ext.door === 'latched' ? 'open' : 'latched'; emit('ext'); click(); },
  options: () => [{ label: state.ext.door === 'latched' ? 'Open' : 'Close and latch', do: () => ACTIONS.door.tap() }],
};
ACTIONS.pedals = {
  state: () => (Math.abs(state.rudder) < 0.05 ? 'Neutral' : state.rudder > 0 ? 'Right rudder' : 'Left rudder'),
  drag: { start: () => state.rudder, move: (dx, dy, v0) => set('rudder', clamp(v0 + dx * 0.006, -1, 1)) },
  options: () => [
    { label: 'Full left', do: () => set('rudder', -1) }, { label: 'Neutral', do: () => set('rudder', 0) }, { label: 'Full right', do: () => set('rudder', 1) },
    { label: 'Toe brakes (1 s)', do: () => { state.toeBrake = true; note('brakesPressed'); setTimeout(() => (state.toeBrake = false), 1000); } },
  ],
};

// Displays
ACTIONS.pfd = {
  state: () => (!powered('cb_pfd') ? 'OFF' : state.avionics.pfdBoot < 5 ? 'Starting' : casMessages().length ? 'CAS: ' + casMessages().map(m => m.t).join(', ') : 'ON'),
  tap: hit => { if (hit?.screen && hit.uv && displays?.touch('pfd', hit.uv)) click('knob'); },
};
ACTIONS.gnx = { state: () => (powered('cb_gpsxpdr') ? 'ON' : 'OFF'), tap: hit => { if (hit?.screen && hit.uv && displays?.touch('gnx', hit.uv)) click('knob'); } };
['g5', 'gnc', 'hobbs', 'usb'].forEach(id => (ACTIONS[id] = ACTIONS[id] || {}));

// ---------------- Exterior ----------------
const remove = (key, label) => ({
  state: () => (state.ext[key] ? 'ATTACHED' : 'REMOVED'),
  tap: () => { state.ext[key] = !state.ext[key]; emit('ext'); },
  options: () => [{ label: state.ext[key] ? 'Remove' : 'Put back', do: () => { state.ext[key] = !state.ext[key]; emit('ext'); } }],
});
ACTIONS.pitotCover = remove('pitotCover');
ACTIONS.chockL = remove('chockL'); ACTIONS.chockR = remove('chockR'); ACTIONS.chockN = remove('chockN');
['chockL', 'chockR', 'chockN'].forEach((k, i) => (INFO[k] = { name: ['Left main wheel chocks', 'Right main wheel chocks', 'Nose wheel chock'][i], ref: 'POH 4.5a', text: 'Remove before taxi.' }));
ACTIONS.controlLock = {
  state: () => (state.controlLock ? 'IN PLACE' : 'RELEASED'),
  tap: () => { set('controlLock', !state.controlLock); click(); },
  options: () => [{ label: state.controlLock ? 'Release' : 'Put back', do: () => set('controlLock', !state.controlLock) }],
};
INFO.controlLock = { name: 'Control wheel restraint', ref: 'POH 4.5a', text: 'The pilot seat belt wrapped around the wheel to hold the controls while parked. Release it before checking the controls.' };
ACTIONS.tiedownL = remove('tiedownL'); ACTIONS.tiedownR = remove('tiedownR'); ACTIONS.tiedownT = remove('tiedownT');
['L', 'R'].forEach(side => {
  const key = 'fuelCap' + side;
  ACTIONS[key] = {
    state: () => (state.ext[key] === 'open' ? `OPEN · about ${Math.round(state.fuel[side])} gal in the tank` : 'CLOSED & SECURE'),
    tap: () => { state.ext[key] = state.ext[key] === 'open' ? 'closed' : 'open'; if (state.ext[key] === 'open') note('capOpen' + side); emit('ext'); click('knob'); },
    options: () => [{ label: state.ext[key] === 'open' ? 'Close and secure' : 'Open cap', do: () => { state.ext[key] = state.ext[key] === 'open' ? 'closed' : 'open'; if (state.ext[key] === 'open') note('capOpen' + side); emit('ext'); } }],
  };
  const drain = () => { click('knob'); note('sump' + side); };
  ACTIONS['sump' + side] = { tap: drain, state: () => (state.events['sump' + side] ? 'Sample: clear blue 100LL, no water or sediment. Closed, not leaking.' : 'Closed'), options: () => [{ label: 'Drain a sample', do: drain }] };
  ACTIONS['vent' + side] = { state: () => 'Clear' };
  ACTIONS['airInlet' + side] = { state: () => 'Clear' };
});
ACTIONS.strainer = { tap: () => { click('knob'); note('strainer'); }, state: () => (state.events.strainer ? 'Drained: clear blue, no water. Closed.' : 'Closed'), options: () => [{ label: 'Drain a sample', do: () => { click('knob'); note('strainer'); } }] };
ACTIONS.pitotTube = {
  state: () => (state.pitotTemp > 45 ? 'Warm to the touch' : state.pitotTemp > 25 ? 'Slightly warm' : 'Cold') + (state.ext.pitotCover ? ' · cover on' : ' · holes clear'),
  tap: () => { if (state.pitotTemp > 45) note('pitotWarm'); note('pitotFelt'); },
  options: () => [{ label: 'Feel the head', do: () => { if (state.pitotTemp > 45) note('pitotWarm'); note('pitotFelt'); } }],
};
ACTIONS.oilDoor = {
  state: () => (state.ext.oilDoor === 'open' ? `OPEN · dipstick ${state.ext.dipstick === 'out' ? `out, reads ${state.oilQts} qt` : 'in'}` : 'CLOSED & SECURE'),
  tap: hit => {
    if (state.ext.oilDoor !== 'open') { state.ext.oilDoor = 'open'; }
    else if (hit?.part === 'dipstick') { state.ext.dipstick = state.ext.dipstick === 'out' ? 'in' : 'out'; if (state.ext.dipstick === 'out') note('oilChecked'); }
    else { state.ext.oilDoor = 'closed'; state.ext.dipstick = 'in'; }
    emit('ext');
  },
  options: () => [
    { label: state.ext.oilDoor === 'open' ? 'Close door' : 'Open door', do: () => { state.ext.oilDoor = state.ext.oilDoor === 'open' ? 'closed' : 'open'; if (state.ext.oilDoor === 'closed') state.ext.dipstick = 'in'; emit('ext'); } },
    ...(state.ext.oilDoor === 'open' ? [{ label: state.ext.dipstick === 'out' ? 'Seat dipstick' : 'Pull dipstick', do: () => { state.ext.dipstick = state.ext.dipstick === 'out' ? 'in' : 'out'; if (state.ext.dipstick === 'out') note('oilChecked'); emit('ext'); } }] : []),
  ],
};
ACTIONS.stallVane = {
  state: () => (state.ext.stallVaneUp ? 'LIFTED' : 'Down'),
  drag: { start: () => { state.ext.stallVaneUp = true; emit('ext'); return null; }, move: () => {} },
  hold: true,
  release: () => { state.ext.stallVaneUp = false; emit('ext'); },
  options: () => [{ label: 'Lift for 2 s', do: () => { state.ext.stallVaneUp = true; emit('ext'); setTimeout(() => { state.ext.stallVaneUp = false; emit('ext'); }, 2000); } }],
};
['aileronL', 'aileronR', 'flapL', 'flapR', 'stabilator', 'rudder', 'prop', 'mainGearL', 'mainGearR', 'noseGear', 'oat', 'extPower', 'staticWicks', 'antennas', 'windshield', 'door', 'navL', 'navR'].forEach(id => (ACTIONS[id] = ACTIONS[id] || {}));
ACTIONS.aileronL.info = ACTIONS.aileronR.info = undefined;
['wingR', 'wingL', 'wicksR', 'wicksL', 'wicksTail', 'landingLens', 'cowl', 'cowlInlets', 'empennage', 'docs', 'towbar', 'fuselage'].forEach(id => (ACTIONS[id] = ACTIONS[id] || {}));
Object.assign(INFO, {
  wingR: { name: 'Right wing', ref: 'POH 4.5a', text: 'Semi-tapered wing, NACA 65₂-415 airfoil. Check the surface for ice, frost, snow and damage.' },
  wingL: { name: 'Left wing', ref: 'POH 4.5a', text: 'Check the surface for ice, frost, snow and damage.' },
  wicksR: { name: 'Right aileron static wicks', ref: 'POH 4.5a', text: 'Check secure.' },
  wicksL: { name: 'Left aileron static wicks', ref: 'POH 4.5a', text: 'Check secure.' },
  wicksTail: { name: 'Tail static wicks', ref: 'POH 4.5a', text: 'On the stabilator tips and rudder. Check secure.' },
  landingLens: { name: 'Landing light', ref: 'POH 7.23', text: 'In the nose cowling, below the spinner.' },
  cowl: { name: 'Cowling and nose section', ref: 'POH 4.5a', text: 'Check general condition, look for oil or fluid leaks, and make sure the cowling is secure.' },
  cowlInlets: { name: 'Cowling air inlets', ref: 'POH 4.5a', text: 'Cooling and induction air inlets either side of the spinner. Keep them clear of birds\' nests and debris.' },
  empennage: { name: 'Empennage', ref: 'POH 4.5a', text: 'Tail surfaces. Clear of ice, frost and snow.' },
  docs: { name: 'Documents and POH', ref: 'POH 4.5a', text: 'Airworthiness and registration certificates and the POH with weight and balance, in the map pocket.' },
  towbar: { name: 'Tow bar', ref: 'POH 4.5a', text: 'Stowed and secured behind the rear seat.' },
  fuselage: { name: 'Fuselage', ref: 'POH 7.3', text: 'All-metal semi-monocoque fuselage. Cowling, wing tips and tail tips are fiberglass or ABS.' },
});
INFO.navL = { name: 'Left wing tip and lights', ref: 'POH 4.5a', text: 'Red navigation light and strobe. Check the tip and lights.' };
INFO.navR = { name: 'Right wing tip and lights', ref: 'POH 4.5a', text: 'Green navigation light and strobe. Check the tip and lights.' };

export function partList() {
  return [
    { title: 'Panel switches', items: ['batt', 'altr', 'fuelPump', 'pitotHeat', 'strobe', 'nav', 'landing', 'ventFan', 'magL', 'magR', 'start', 'mapLight', 'elt'] },
    { title: 'Avionics', items: ['pfd', 'g5', 'gnx', 'gnc', 'gmc'] },
    { title: 'Engine and fuel', items: ['throttle', 'mixture', 'friction', 'altAir', 'fuelSel'] },
    { title: 'Flight controls', items: ['controlLock', 'yoke', 'pedals', 'flaps', 'pitchTrim', 'rudderTrim', 'parkBrake'] },
    { title: 'Cabin', items: ['docs', 'towbar', 'dimAvionics', 'dimPanel', 'heat', 'defrost', 'altStatic', 'pitotDrain', 'hobbs', 'usb'] },
    { title: 'Circuit breakers', items: BREAKERS.map(b => b.id) },
    { title: 'Right wing', items: ['flapR', 'aileronR', 'navR', 'fuelCapR', 'ventR', 'sumpR', 'tiedownR', 'chockR', 'mainGearR', 'airInletR'] },
    { title: 'Nose', items: ['windshield', 'oilDoor', 'prop', 'noseGear', 'strainer', 'chockN'] },
    { title: 'Left wing', items: ['airInletL', 'mainGearL', 'sumpL', 'ventL', 'tiedownL', 'chockL', 'fuelCapL', 'pitotTube', 'pitotCover', 'stallVane', 'oat', 'navL', 'aileronL', 'flapL'] },
    { title: 'Fuselage and tail', items: ['door', 'antennas', 'extPower', 'stabilator', 'rudder', 'wicksTail', 'tiedownT'] },
  ];
}
