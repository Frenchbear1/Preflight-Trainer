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
    pitchTrim: 0.3, rudderTrim: -0.2, // -1..1 (left where the last pilot set them)
    parkBrake: true,
    yokePitch: 0, yokeRoll: 0, rudder: 0, // -1..1
    controlLock: true, // control wheel restraint (seat belt around the wheel)
    baro: 29.92, fieldElev: 380, atis: { wind: 'Calm', alt: 30.06, info: 'Kilo', temp: 15 },
    com: { act: '119.100', stby: '121.900' },
    xpdr: { code: '1200' },
    casAck: {},
    pitotTemp: 15,
    events: {}, // things the pilot has done (drained a sump, felt the pitot, moved controls to their stops...)
    fuel: { L: 24, R: 24 },
    oilQts: 7,
    ext: {
      door: 'latched', pitotCover: true, chockL: true, chockR: true, chockN: true, tiedownL: true, tiedownR: true, tiedownT: true, towbar: false,
      fuelCapL: 'closed', fuelCapR: 'closed', oilDoor: 'closed', dipstick: 'in',
      stallVaneUp: false, door: 'closed',
    },
    engine: { running: false, rpm: 0, oilPress: 0, oilTemp: 15, cranking: 0, startTime: 0, onPrime: 0 },
    fl: { phase: 'parked', x: 0, z: 0, alt: 0, hdg: 360, ias: 0, gs: 0, vs: 0, pitch: 0, roll: 0, onGround: true, leg: 0, timeScale: 1, msg: '' },
    toeBrake: false,
    ap: { engaged: false, discFlash: 0 },
    elec: { volts: 0, battAmps: 0, altAmps: 0 },
    avionics: {
      pfdBoot: 0, g5Boot: 0, gnxBoot: 0, gncBoot: 0, adahrsT: 0, pftT: 0,
      g3xPage: 'db', dbViewed: false, mfd: 'none', lastMfd: 'eng', engTab: 'main',
      fuelRem: 48, fuelSet: false, fuelUsed: 0,
      wb: { pilot: 170, copilot: 0, rear: 0, fuel: 48 }, wbSet: false,
      gnxPage: 'start',
    },
  };
}

export const state = freshState();

export function note(ev, v = true) { state.events[ev] = v; emit('event:' + ev); }

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
  if (s.engine.running && engineDerived().rough) m.push({ t: 'ENGINE ROUGH', c: 'amber' });
  if (s.engine.running && (!s.sw.magL || !s.sw.magR)) m.push({ t: s.sw.magL ? 'R MAG OFF' : 'L MAG OFF', c: 'amber' });
  return m;
}

export function stallWarning() {
  return busPowered() && (state.ext.stallVaneUp || (!state.fl.onGround && state.fl.ias < 52 + (state.flaps ? 0 : 5)));
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
// Mixture model: r is richness relative to peak EGT. Full rich at sea level is about 1.8;
// the needed setting falls as density altitude rises, so leaning matters more up high.
export function mixtureRichness() {
  const altFt = state.fieldElev + state.fl.alt * 3.281;
  const peakSetting = 0.55 * (1 - altFt / 32000);
  return state.mixture / Math.max(0.2, peakSetting);
}
function mixturePower(r) {
  if (r >= 1) return 1 - 0.22 * Math.pow(r - 1.25, 2) - (r < 1.25 ? 0.03 * (1.25 - r) : 0);
  return Math.max(0, 0.97 - 1.6 * (1 - r) - 3 * Math.pow(Math.max(0, 0.85 - r), 2));
}
export function engineDerived() {
  const s = state, e = s.engine, r = mixtureRichness();
  const thr = Math.pow(Math.max(0, e.rpm) / 2700, 2.6);
  let egt = r >= 1 ? 1450 - 260 * (r - 1) : 1450 - 900 * (1 - r);
  egt = 120 + (egt - 120) * (0.55 + 0.45 * Math.min(1, thr * 1.4));
  return { r, egt: e.running ? egt : 60 + (e.oilTemp - 15) * 2, ff: e.running ? Math.max(0.6, 12.5 * thr * Math.min(1.7, r / 1.25)) : 0, rough: e.running && r < 0.85 };
}
export function tick(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  const s = state, e = s.engine;
  const pumpOn = s.sw.fuelPump && powered('cb_fuelpump');
  // Prime: with the engine stopped, the electric pump on and the mixture rich, fuel flows to the intake.
  if (!e.running && pumpOn && s.mixture > 0.6 && fuelAvailable()) { primed = Math.min(8, primed + dt); if (primed > 2) note('primed'); }
  else if (!e.running) primed = Math.max(0, primed - dt * 0.05);

  const cranking = s.startPressed && powered('cb_engstart') && busPowered();
  const mags = (s.sw.magL ? 1 : 0) + (s.sw.magR ? 1 : 0);
  if (cranking && !e.running) {
    e.cranking += dt;
    if (e.cranking > 10) note('overcrank');
    e.rpm += (180 - e.rpm) * Math.min(1, dt * 4);
    const fuelOk = fuelAvailable() && (primed > 0.8 || s.mixture > 0.3);
    if (e.cranking > 1.4 && mags > 0 && fuelOk && s.throttle < 0.6) {
      e.running = true; e.startTime = now; e.onPrime = s.mixture < 0.05 ? 4 : 0; primed = 0; note('started');
    }
  } else if (!cranking) e.cranking = 0;

  if (e.running) {
    // A cold start fires on the prime; advance the mixture within a few seconds or it stops.
    if (s.mixture < 0.05) e.onPrime = Math.max(0, (e.onPrime || 0) - dt); else e.onPrime = 0;
    const r = mixtureRichness();
    const onPrime = e.onPrime > 0;
    const killed = mags === 0 || (!onPrime && (s.mixture < 0.05 || r < 0.6)) || !fuelAvailable();
    if (killed) { e.running = false; note('stopped'); }
    else {
      const ias = s.fl.ias;
      // Fixed-pitch prop: static RPM tops out near 2350 on the ground and rises with airspeed
      let target = (650 + s.throttle * 1700) * (1 + Math.min(0.2, ias / 110 * 0.17));
      const altFt = s.fieldElev + s.fl.alt * 3.281;
      target *= 1 - altFt / 60000;
      target *= Math.pow(e.onPrime > 0 ? 0.8 : mixturePower(r), 0.45);
      if (mags === 1) target -= s.sw.magL ? 105 : 85; // left mag alone drops a little more on this engine
      if (s.altAir === 'OPEN') target -= 55;
      if (r < 0.85 && !onPrime) target += Math.sin(now / 37) * 60; // roughness near and past peak
      target = Math.min(2750, target);
      e.rpm += (target - e.rpm) * Math.min(1, dt * 1.6);
      e.oilPress += (Math.min(88, 30 + e.rpm / 40) - e.oilPress) * Math.min(1, dt * 0.8);
      e.oilTemp += (Math.min(90, 40 + e.rpm / 50) - e.oilTemp) * dt * 0.012;
      const burn = engineDerived().ff / 3600 * dt; // gallons this step
      if (s.fuelSel !== 'OFF') s.fuel[s.fuelSel] = Math.max(0, s.fuel[s.fuelSel] - burn);
      s.avionics.fuelUsed += burn; if (s.avionics.fuelSet) s.avionics.fuelRem = Math.max(0, s.avionics.fuelRem - burn);
      // record checks done at run-up power
      if (e.rpm > 1850 && s.fl.onGround) {
        if (mags === 1) { s.events[s.sw.magL ? 'magCheckR' : 'magCheckL'] = true; s.events.magDrop = Math.round(2000 - e.rpm); }
        if (s.altAir === 'OPEN') s.events.altAirCheck = true;
      }
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
  if (!powered('cb_pfd')) { av.pfdBoot = 0; av.g3xPage = 'db'; av.mfd = 'none'; s.casAck = {}; } else av.pfdBoot += dt;
  av.adahrsT = powered('cb_adahrs') ? av.adahrsT + dt : 0;
  av.pftT = powered('cb_autopilot') && av.pfdBoot > 5 ? av.pftT + dt : 0;
  if (!powered('cb_gpsxpdr')) av.gnxPage = 'start';
  av.g5Boot = powered('cb_stby') || (av.g5Boot > 0 && s.sw.batt) ? av.g5Boot + dt : 0;
  av.gnxBoot = powered('cb_gpsxpdr') ? av.gnxBoot + dt : 0;
  av.gncBoot = powered('cb_com1') ? av.gncBoot + dt : 0;
  // Heated pitot head warms in about half a minute and cools slowly
  const heat = s.sw.pitotHeat && powered('cb_pitot');
  s.pitotTemp += ((heat ? 75 : 15) - s.pitotTemp) * Math.min(1, dt * (heat ? 0.08 : 0.02));
  if (stallWarning()) note('stallHorn');
  // Control travel: remember when each stop has been reached
  if (s.yokePitch > 0.95) s.events.pitchAft = true; if (s.yokePitch < -0.95) s.events.pitchFwd = true;
  if (s.ap.discFlash > 0) s.ap.discFlash = Math.max(0, s.ap.discFlash - dt);
  if (s.yokeRoll > 0.95) s.events.rollR = true; if (s.yokeRoll < -0.95) s.events.rollL = true;
  if (s.rudder > 0.95) s.events.rudR = true; if (s.rudder < -0.95) s.events.rudL = true;
  // Flaps move smoothly toward the handle position
  s.flapAnim += (s.flaps - s.flapAnim) * Math.min(1, dt * 3);
  return dt;
}
