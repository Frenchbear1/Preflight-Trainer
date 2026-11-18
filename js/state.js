// Airplane state: every switch, lever, breaker and exterior item, plus a small systems model
// (electrical buses, engine, stall warning) so the panel reacts the way the real airplane does.
import { BREAKERS } from './data.js';

const listeners = new Set();

export function freshState() {
  const breakers = {};
  BREAKERS.forEach(b => (breakers[b.id] = true));
  return {
    sw: { batt: false, altr: false, fuelPump: false, pitotHeat: false, strobe: false, nav: false, landing: false, ventFan: false, magL: false, magR: false, mapLight: false },
    startPressed: false,
    breakers,
    elt: 'ARM',
    throttle: 0.0, // 0 idle .. 1 full
    mixture: 0.0, // 0 idle cut-off .. 1 full rich
    friction: 0.3,
    altAir: 'CLOSE',
    altStatic: false,
    heat: 0, defrost: 0,
    dimAvionics: 0.7, dimPanel: 0.5,
    fuelSel: 'L',
    flaps: 0, // degrees: 0, 10, 25, 40
    flapAnim: 0,
    pitchTrim: 0, rudderTrim: 0, // -1..1
    parkBrake: true,
    yokePitch: 0, yokeRoll: 0, rudder: 0, // -1..1
    controlLock: false,
    fuel: { L: 24, R: 24 },
    oilQts: 7,
    ext: {
      pitotCover: true, chocks: true, tiedownL: true, tiedownR: true, tiedownT: true,
      fuelCapL: 'closed', fuelCapR: 'closed', oilDoor: 'closed', dipstick: 'in',
      stallVaneUp: false, door: 'closed',
    },
    engine: { running: false, rpm: 0, oilPress: 0, oilTemp: 15, cranking: 0, startTime: 0 },
    elec: { volts: 0, battAmps: 0, altAmps: 0 },
    avionics: { pfdBoot: 0, g5Boot: 0, gnxBoot: 0, gncBoot: 0 },
  };
}

export const state = freshState();

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what) { listeners.forEach(fn => fn(what)); }

export function set(path, value) {
  const keys = path.split('.');
  let o = state;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys.at(-1)] = value;
  emit(path);
}
export function get(path) { return path.split('.').reduce((o, k) => o?.[k], state); }

export function resetState() {
  const f = freshState();
  Object.keys(f).forEach(k => (state[k] = f[k]));
  emit('*');
}

// ---------- Systems ----------
// Battery master energizes both essential buses through the BATTERY breaker.
// With the engine running and ALTR on (ALTR FIELD and ALTR breakers in) the alternator holds 28 V.
export function busPowered() {
  return (state.sw.batt && state.breakers.cb_battery) || alternatorOnline();
}
export function alternatorOnline() {
  return state.engine.running && state.engine.rpm > 900 && state.sw.altr && state.sw.batt && state.breakers.cb_altrfield && state.breakers.cb_altr;
}
export function powered(cb) { return busPowered() && state.breakers[cb] !== false; }

export function lightsOn() {
  return {
    nav: state.sw.nav && powered('cb_navlts'),
    strobe: state.sw.strobe && powered('cb_strobe'),
    landing: state.sw.landing && powered('cb_landing'),
    map: state.sw.mapLight && powered('cb_paneldim'),
  };
}

export function casMessages() {
  if (!powered('cb_pfd')) return [];
  const m = [];
  const s = state;
  if (s.engine.oilPress < 20) m.push({ t: 'OIL PRES LOW', c: 'red' });
  if (!alternatorOnline()) m.push({ t: 'ALTR FAIL', c: 'amber' });
  if (s.startPressed && powered('cb_engstart')) m.push({ t: 'START ENGAGE', c: 'red' });
  if (s.fuel.L < 6 || s.fuel.R < 6) m.push({ t: 'LOW FUEL', c: 'amber' });
  if (!(s.sw.pitotHeat && powered('cb_pitot'))) m.push({ t: 'P HEAT OFF', c: 'amber' });
  if (s.engine.running && (!s.sw.magL || !s.sw.magR)) m.push({ t: s.sw.magL ? 'R MAG OFF' : 'L MAG OFF', c: 'amber' });
  return m;
}

export function stallWarning() {
  return busPowered() && state.ext.stallVaneUp;
}

// Fuel reaches the engine when a tank with fuel is selected.
export function fuelAvailable() {
  const t = state.fuelSel;
  return t !== 'OFF' && state.fuel[t] > 0.2;
}

let lastT = performance.now();
let primed = 0;
// Advance the systems by a number of seconds in small steps (used by tests and the checklist player)
export function simulate(seconds) {
  for (let t = 0; t < seconds; t += 0.05) { lastT -= 50; tick(performance.now()); }
}
export function tick(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  const s = state, e = s.engine;
  const pumpOn = s.sw.fuelPump && powered('cb_fuelpump');
  // Prime: fuel pump on with mixture rich and engine stopped wets the intake.
  if (!e.running && pumpOn && s.mixture > 0.6 && fuelAvailable()) primed = Math.min(6, primed + dt);
  else if (!e.running) primed = Math.max(0, primed - dt * 0.05);

  const cranking = s.startPressed && powered('cb_engstart') && busPowered();
  const mags = (s.sw.magL ? 1 : 0) + (s.sw.magR ? 1 : 0);
  if (cranking && !e.running) {
    e.cranking += dt;
    e.rpm += (180 - e.rpm) * Math.min(1, dt * 4);
    const fuelOk = fuelAvailable() && (primed > 0.8 || s.mixture > 0.3);
    if (e.cranking > 1.6 && mags > 0 && fuelOk && s.mixture > 0.05 && s.throttle < 0.85) {
      e.running = true; e.startTime = now;
    }
  } else if (!cranking) e.cranking = 0;

  if (e.running) {
    const killed = mags === 0 || s.mixture < 0.04 || !fuelAvailable();
    if (killed) e.running = false;
    else {
      let target = 700 + s.throttle * 1700; // static RPM on the ground tops out near 2400
      target *= 0.75 + 0.25 * Math.min(1, s.mixture * 1.6);
      if (mags === 1) target -= 90; // single magneto drop
      if (s.altAir === 'OPEN') target -= 50;
      e.rpm += (target - e.rpm) * Math.min(1, dt * 1.6);
      e.oilPress += (Math.min(90, 35 + e.rpm / 40) - e.oilPress) * Math.min(1, dt * 0.8);
      e.oilTemp += (Math.min(185, 80 + e.rpm / 20) - e.oilTemp) * dt * 0.01;
      const burn = (e.rpm / 2400) * 9.5 / 3600 * dt; // gal per second
      if (s.fuelSel !== 'OFF') s.fuel[s.fuelSel] = Math.max(0, s.fuel[s.fuelSel] - burn);
    }
  }
  if (!e.running && !cranking) {
    e.rpm = Math.max(0, e.rpm - dt * 900);
    e.oilPress = Math.max(0, e.oilPress - dt * 20);
    e.oilTemp += (15 - e.oilTemp) * dt * 0.002;
  }
  // Electrical
  const alt = alternatorOnline();
  const bus = busPowered();
  let load = 0;
  if (bus) {
    load = 3.5 + (s.sw.pitotHeat && powered('cb_pitot') ? 7 : 0) + (s.sw.landing ? 1.5 : 0) + (s.sw.strobe ? 1.2 : 0) + (s.sw.nav ? 0.6 : 0) + (pumpOn ? 2 : 0) + (s.sw.ventFan ? 1.5 : 0) + (cranking ? 90 : 0);
  }
  s.elec.volts += ((!bus ? 0 : alt ? 28.2 : cranking ? 21 : 24.3) - s.elec.volts) * Math.min(1, dt * 5);
  s.elec.altAmps = alt ? load + 2 : 0;
  s.elec.battAmps = !bus ? 0 : alt ? 2 : -load;
  // Displays boot once powered
  const av = s.avionics;
  av.pfdBoot = powered('cb_pfd') ? av.pfdBoot + dt : 0;
  av.g5Boot = powered('cb_stby') || (av.g5Boot > 0 && s.sw.batt) ? av.g5Boot + dt : 0;
  av.gnxBoot = powered('cb_gpsxpdr') ? av.gnxBoot + dt : 0;
  av.gncBoot = powered('cb_com1') ? av.gncBoot + dt : 0;
  // Flaps move smoothly toward the handle position
  s.flapAnim += (s.flaps - s.flapAnim) * Math.min(1, dt * 3);
  return dt;
}
