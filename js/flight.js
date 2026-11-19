// Taxi and a guided flight for the normal checklists. The pilot handles power, mixture, flaps,
// brakes, trim, lights and the rotation; the route (taxiways, runway 27 departure, turn back,
// straight-in to runway 9 and taxi back) is followed automatically, and speed, climb and descent
// come from a simple power-required model calibrated to POH figures (Vy 76, cruise ~110 KIAS
// at 75%, 66 KIAS final with flaps 40).
//
// World frame: x east, z south (the ramp is at the origin, parked nose north), y up. Heading 0 = north (-z).
import { state, emit, note, engineDerived } from './state.js';

const KT = 0.5144, FT = 0.3048, D2R = Math.PI / 180;
export const AIRPORT = {
  rwyZ: -75, rwyW: 23, east: 60, west: -1040, // runway 9/27 centreline and ends (x)
  runup: [0, -38], hold: [0, -50], lineup: [-14, -75],
  exitX: -160, parallelZ: -36,
};
const TD_X = AIRPORT.west + 300; // aim point for runway 9

// Taxi routes as polylines with stop points
const ROUTES = {
  out: { pts: [[0, 0], [0, -20], AIRPORT.runup], stopAt: 'runup' },
  toHold: { pts: [AIRPORT.runup, AIRPORT.hold], stopAt: 'hold' },
  lineup: { pts: [AIRPORT.hold, [0, -60], [-4, -70], AIRPORT.lineup, [-40, -75]], stopAt: 'lineup' },
  back: { pts: [[AIRPORT.exitX - 40, -75], [AIRPORT.exitX, -70], [AIRPORT.exitX, -48], [AIRPORT.exitX + 12, AIRPORT.parallelZ], [-14, AIRPORT.parallelZ], [0, -24], [0, -8], [0, 0]], stopAt: 'parked' },
};

const fl = () => state.fl;
const wrap = a => ((a % 360) + 540) % 360 - 180; // -180..180
const hdgTo = (dx, dz) => (Math.atan2(dx, -dz) / D2R + 360) % 360;

// Power required (fraction of 180 HP) for level flight at an indicated airspeed, plus flap drag
function pReq(ias, flaps) {
  const v = Math.max(40, ias);
  return 21.57 / v + 3.785e-7 * v * v * v + 0.0015 * flaps * Math.pow(v / 70, 2);
}
function pAvail() {
  const e = state.engine;
  if (!e.running) return 0;
  const altFt = state.fieldElev + fl().alt / FT;
  return Math.pow(e.rpm / 2700, 2.6) * (1 - altFt / 30000) * 1.08;
}

let route = null, seg = 0;
export function resetFlight() { route = null; seg = 0; }
export function startRoute(name) { route = ROUTES[name]; seg = 0; fl().phase = 'taxi-' + name; }

function followRoute(dt, f) {
  if (!route) return 0;
  const pts = route.pts;
  // advance along segments
  while (seg < pts.length - 2) {
    const [ax0, az0] = pts[seg], [bx0, bz0] = pts[seg + 1];
    const L0 = Math.hypot(bx0 - ax0, bz0 - az0) || 1;
    const along = ((f.x - ax0) * (bx0 - ax0) + (f.z - az0) * (bz0 - az0)) / (L0 * L0);
    if (Math.hypot(bx0 - f.x, bz0 - f.z) < 6 || along > 0.98) seg++; else break; // reached or passed the corner
  }
  const last = pts[pts.length - 1];
  const tgt = pts[Math.min(seg + 1, pts.length - 1)];
  const look = 6; // pure pursuit look-ahead
  const [ax, az] = pts[seg], [bx, bz] = tgt;
  const L = Math.hypot(bx - ax, bz - az) || 1;
  let t = ((f.x - ax) * (bx - ax) + (f.z - az) * (bz - az)) / (L * L);
  t = Math.min(1, Math.max(0, t + look / L));
  const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
  const want = hdgTo(px - f.x, pz - f.z);
  const err = wrap(want - f.hdg);
  const rate = Math.max(-25, Math.min(25, err * 1.4)) * Math.min(1, f.gs / 3);
  f.hdg = (f.hdg + rate * dt + 360) % 360;
  return Math.hypot(last[0] - f.x, last[1] - f.z);
}

// ---------- Main step ----------
export function stepFlight(dt) {
  const f = fl(), s = state;
  dt *= f.timeScale;
  // the pilot moves the airplane by releasing the brakes and adding power
  const brakesOff = !s.parkBrake && !s.toeBrake;
  // at a stop the airplane waits until the pilot has stopped (brake set or power back), then moves on with power
  if (['parked', 'runup', 'hold', 'lineup'].includes(f.phase) && (s.parkBrake || s.toeBrake || s.engine.rpm < 900)) f.armed = true;
  if (f.armed && brakesOff && s.engine.running && s.engine.rpm > 950 && ['parked', 'runup', 'hold'].includes(f.phase) && !(f.phase === 'parked' && s.events.flown)) { f.armed = false; taxiFrom(); }
  if (brakesOff && f.phase === 'lineup' && s.throttle > 0.85) beginTakeoff();
  if (f.timeScale > 1 && (f.onGround || f.phase === 'final' || f.phase === 'flare')) f.timeScale = 1;
  if (f.phase === 'parked' && !f.onGround) f.onGround = true;
  if (f.onGround) groundStep(dt, f, s); else airStep(dt, f, s);
  f.x += Math.sin(f.hdg * D2R) * f.gs * KT * dt;
  f.z -= Math.cos(f.hdg * D2R) * f.gs * KT * dt;
}

function groundStep(dt, f, s) {
  const e = s.engine;
  // a chocked or tied-down airplane goes nowhere
  const held = ['chockL', 'chockR', 'chockN', 'tiedownL', 'tiedownR', 'tiedownT'].some(k => s.ext[k]);
  if (held && f.phase.startsWith('taxi')) { f.gs = 0; f.msg = 'Chocks or tie-downs still attached'; return; }
  if (f.msg === 'Chocks or tie-downs still attached') f.msg = '';
  const thrust = e.running ? 4.8 * Math.pow(e.rpm / 2700, 2.6) * (1 - f.gs / 150) : 0; // m/s²
  const v = f.gs * KT;
  let decel = (v > 0.05 ? 0.16 : 0) + 0.0009 * v * v * (1 + s.flaps / 40);
  const braking = s.parkBrake || s.toeBrake;
  if (braking) decel += 3.2;
  if (s.toeBrake && v > 0.4) note('brakesTested');
  if (Math.abs(s.rudder) > 0.5 && v > 0.4) note('steerTested');
  // holding positions: the airplane stays put until the next leg starts
  if (['parked', 'runup', 'hold', 'lineup'].includes(f.phase)) { f.gs = 0; f.ias = 0; f.vs = 0; f.alt = 0; f.roll = 0; if (f.phase === 'lineup') f.hdg = 270; return; }
  // taxi speed: the pilot keeps it near a fast walk with the brakes
  if (f.phase.startsWith('taxi') && v > 5) decel += (v - 5) * 0.9;
  // auto-stop at the end of a taxi route
  let dist = Infinity;
  if (route && f.phase.startsWith('taxi')) {
    dist = followRoute(dt, f);
    if (dist < 12) decel += Math.max(0, (v * v) / (2 * Math.max(0.5, dist - 1.5)));
    if (dist < 1.8 && v < 0.6) { f.gs = 0; arrive(route.stopAt); return; }
  }
  let a = thrust - (braking && v < 0.1 && thrust < 3.0 ? thrust : 0);
  const nv = Math.max(0, v + (a - decel) * dt);
  f.gs = nv / KT;
  if (s.parkBrake && f.gs < 0.2) f.gs = 0;
  if (f.gs > 0.8) s.events.taxiing = true;
  // takeoff roll and rotation
  if (f.phase === 'roll') {
    f.hdg += wrap(270 - f.hdg) * Math.min(1, dt * 2);
    const rotateAt = s.flaps >= 25 ? 55 : 60;
    f.pitch += ((s.yokePitch > 0.25 && f.gs > rotateAt - 2 ? 8 : 0) - f.pitch) * Math.min(1, dt * 1.5);
    if (f.gs >= rotateAt && s.yokePitch > 0.25) note('rotated');
    if (f.pitch > 6 && f.gs > rotateAt - 1) { f.onGround = false; f.phase = 'climb'; f.vs = 300; note('airborne'); emit('flight'); }
    if (f.x < AIRPORT.west + 250 && !s.events.rotated) { f.msg = 'Rotate now'; }
  }
  if (f.phase === 'rollout') {
    f.hdg += wrap(90 - f.hdg) * Math.min(1, dt * 2);
    f.pitch += (0 - f.pitch) * Math.min(1, dt * 1.2);
    if (f.gs < 14 && f.x > AIRPORT.exitX - 140) { startRoute('back'); seg = 0; }
    if (f.x > AIRPORT.exitX - 40 && f.gs > 14) decel += 1.5; // help the pilot stop before the exit
  }
  f.ias = f.gs; f.vs = 0; f.alt = 0; f.roll = 0;
}

function arrive(where) {
  const f = fl();
  route = null; f.gs = 0;
  f.phase = where; f.armed = false;
  if (where === 'lineup') f.hdg = 270;
  if (where === 'parked') { f.hdg = 180; note('parkedBack'); }
  note('at_' + where); emit('flight');
}

// Pilot actions that move the airplane between phases
export function taxiFrom() {
  const f = fl();
  if (f.phase === 'parked' && !state.events.flown) startRoute('out');
  else if (f.phase === 'runup') startRoute('toHold');
  else if (f.phase === 'hold') startRoute('lineup');
}
export function beginTakeoff() { const f = fl(); if (f.phase === 'lineup' || f.phase === 'taxi-lineup') { route = null; f.phase = 'roll'; f.hdg = 270; } }
export function goAround() { const f = fl(); if (!f.onGround && (f.phase === 'approach' || f.phase === 'final')) { f.phase = 'goaround'; note('goaround'); emit('flight'); } }
export function turnBack() { const f = fl(); if (f.phase === 'cruise') { f.phase = 'return'; emit('flight'); } }

// ---------- Air ----------
const CRUISE_MSL = 2500;
function airStep(dt, f, s) {
  const pa = pAvail(), flaps = s.flapAnim;
  const altMSL = s.fieldElev + f.alt / FT;
  // lateral guidance: hold a course line on the runway centreline (z = rwyZ)
  let course = 270;
  if (['return', 'descent', 'approach', 'final', 'flare'].includes(f.phase)) course = 90;
  if (f.phase === 'goaround') course = 90;
  const xte = f.z - AIRPORT.rwyZ; // + = south of the line
  const sign = course === 270 ? -1 : 1;
  const want = (course + Math.max(-40, Math.min(40, sign * -xte * 0.45)) + 360) % 360;
  let err = wrap(want - f.hdg);
  if (f.phase === 'return' && Math.abs(err) > 150) err = -Math.abs(err); // turn back to the left
  const bank = Math.max(-25, Math.min(25, err * 1.2));
  f.roll += (bank - f.roll) * Math.min(1, dt * 1.2);
  const tas = f.ias * (1 + altMSL / 1000 * 0.02);
  f.hdg = (f.hdg + (1091 * Math.tan(f.roll * D2R)) / Math.max(40, tas) * dt + 360) % 360;

  // vertical: phases decide whether the pilot holds a speed (climb) or a path (level, descent)
  const gamma = (vs, ias) => vs / (Math.max(40, ias) * 101.27);
  let holdSpeed = null, wantVs = 0;
  if (f.phase === 'climb' || f.phase === 'goaround') {
    holdSpeed = f.phase === 'goaround' && s.flaps > 10 ? 70 : s.flaps >= 25 ? 64 : 76;
    const topAlt = f.phase === 'goaround' ? 1400 : CRUISE_MSL;
    if (altMSL >= topAlt - 20) { f.phase = f.phase === 'goaround' ? 'goaround-level' : 'cruise'; note('levelOff'); emit('flight'); }
  }
  if (f.phase === 'goaround-level') { // fly out a bit, then come back to runway 9 again
    wantVs = (1400 - altMSL) * 3; if (f.x > AIRPORT.east + 3000) { f.phase = 'return'; }
  }
  if (f.phase === 'cruise') { wantVs = (CRUISE_MSL - altMSL) * 3; }
  if (f.phase === 'return' || f.phase === 'descent' || f.phase === 'approach' || f.phase === 'final') {
    const dist = Math.max(0, TD_X - f.x);
    const gpAlt = Math.tan(3 * D2R) * Math.max(0, TD_X - f.x); // metres above the touchdown zone
    const target = Math.min((CRUISE_MSL - s.fieldElev) * FT, gpAlt + (f.phase === 'return' ? 60 : 0));
    wantVs = Math.max(-850, Math.min(0, (target - f.alt) / FT * 4));
    if (f.phase === 'return' && Math.abs(wrap(90 - f.hdg)) < 60) { f.phase = 'descent'; emit('flight'); }
    if (f.phase === 'descent' && dist < 9000) { f.phase = 'approach'; emit('flight'); }
    if (f.phase === 'approach' && dist < 3200 && Math.abs(xte) < 60) { f.phase = 'final'; emit('flight'); }
    if (f.phase === 'final' && f.alt < 12) { f.phase = 'flare'; emit('flight'); }
  }
  if (f.phase === 'flare') { wantVs = -120 - f.alt * 8; }
  if (holdSpeed != null) {
    f.ias += (holdSpeed - f.ias) * Math.min(1, dt * 0.4);
    wantVs = Math.max(-500, Math.min(1000, (pa - pReq(f.ias, flaps)) * 1600));
    f.vs += (wantVs - f.vs) * Math.min(1, dt * 0.8);
  } else {
    f.vs += (wantVs - f.vs) * Math.min(1, dt * 0.9);
    // speed from excess power and the descent (gravity) term
    f.ias += (6 * (pa - pReq(f.ias, flaps)) - gamma(f.vs, f.ias) * 19.1) * dt;
    f.ias = Math.max(42, Math.min(160, f.ias));
  }
  // pitch attitude ≈ flight path + angle of attack
  const aoa = 1.5 + 6 * Math.pow(Math.max(0, (100 - f.ias)) / 50, 1.2) - flaps * 0.1;
  f.pitch += ((gamma(f.vs, f.ias) / D2R) + aoa - 2 - f.pitch) * Math.min(1, dt * 1.5);
  f.alt = Math.max(0, f.alt + f.vs * FT / 60 * dt);
  f.gs = tas;
  f.msg = f.ias > 102 && s.flaps > 0 ? 'Over the flap limit (102 KIAS)' : f.ias < 56 && f.phase !== 'flare' ? 'Airspeed low: add power' : f.ias > 154 ? 'Over Vne' : '';
  if (f.alt <= 0.05 && (f.phase === 'flare' || f.phase === 'final')) { f.onGround = true; f.phase = 'rollout'; f.vs = 0; note('touchdown'); note('flown'); emit('flight'); }
}

export function flightInfo() {
  const f = fl();
  const names = { parked: 'Parked', 'taxi-out': 'Taxiing to the run-up area', runup: 'Run-up area', 'taxi-toHold': 'Taxiing to hold short', hold: 'Holding short runway 27', 'taxi-lineup': 'Lining up', lineup: 'Lined up, runway 27', roll: 'Takeoff roll', climb: 'Climbing', cruise: 'Cruise, 2,500 ft', return: 'Turning back to the airport', descent: 'Descending', approach: 'Approach, runway 9', final: 'Final, runway 9', flare: 'Flare', rollout: 'Landing rollout', 'taxi-back': 'Taxiing back to parking', goaround: 'Go-around', 'goaround-level': 'Go-around, flying back out' };
  return { phase: f.phase, label: names[f.phase] || f.phase, ias: f.ias, altMSL: state.fieldElev + f.alt / FT, vs: f.vs, hdg: f.hdg, msg: f.msg, distNm: Math.max(0, TD_X - f.x) / 1852 };
}

// World transform: the airplane stays at the origin; the world moves the opposite way.
export function worldMatrix(THREE, m) {
  const f = fl();
  const pose = new THREE.Matrix4().compose(
    new THREE.Vector3(f.x, f.alt, f.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(f.pitch * D2R, -f.hdg * D2R, -f.roll * D2R, 'YXZ')),
    new THREE.Vector3(1, 1, 1));
  return m.copy(pose).invert();
}
export const _dbg = { ROUTES, pReq, pAvail };
