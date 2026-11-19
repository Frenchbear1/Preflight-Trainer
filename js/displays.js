// Avionics screens for the trainer. These are original drawings: they follow the page order,
// data fields and colour conventions described in the pilot's guides and the POH, but they are
// not copies of the manufacturer's artwork. They are driven by the airplane state and respond to touch.
import { casMessages, powered, busPowered, emit } from './state.js';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const C = { cyan: '#22d3ee', mag: '#e040fb', green: '#2fe06a', white: '#f4f6f8', grey: '#8b96a3', amber: '#ffcc00', panel: '#0a0e13', line: '#3a4654' };
const G = '#18b84a', Y = '#f0c419', R = '#e3241b';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function txt(c, s, x, y, size, color = C.white, align = 'left', weight = 700) { c.fillStyle = color; c.font = `${weight} ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function button(c, B, x, y, w, h, label, fn, { on = false, size = 18 } = {}) {
  rrect(c, x, y, w, h, 6); c.fillStyle = on ? '#1e5f86' : '#26303b'; c.fill(); c.strokeStyle = on ? C.cyan : '#4b5967'; c.lineWidth = 2; c.stroke();
  txt(c, label, x + w / 2, y + h / 2 + 1, size, C.white, 'center');
  if (fn) B.push({ x, y, w, h, fn });
}

// AIRAC cycle for today, so database pages always read current
export function airac(date = new Date()) {
  const ref = Date.UTC(2026, 0, 22), D = 28 * 864e5; // cycle 2601 effective 22 Jan 2026
  const n = Math.floor((date.getTime() - ref) / D);
  const start = new Date(ref + n * D), end = new Date(start.getTime() + D);
  const yearStart = Date.UTC(start.getUTCFullYear(), 0, 1);
  const firstOfYear = ref + Math.ceil((yearStart - ref) / D) * D;
  const num = Math.floor((start.getTime() - firstOfYear) / D) + 1;
  const f = d => d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase().replace(',', '');
  return { id: `${String(start.getUTCFullYear() % 100).padStart(2, '0')}${String(num).padStart(2, '0')}`, start: f(start), end: f(end) };
}

// ---------- Flight instrument pieces ----------
function attitude(c, x, y, w, h, pitch, roll) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const cx = x + w / 2, cy = y + h * 0.42, ppd = h / 46;
  c.translate(cx, cy); c.rotate(-roll); c.translate(0, pitch * ppd);
  const sky = c.createLinearGradient(0, -h, 0, 0); sky.addColorStop(0, '#0d4fa8'); sky.addColorStop(1, '#3d8fe0');
  c.fillStyle = sky; c.fillRect(-w * 2, -h * 2, w * 4, h * 2);
  const gnd = c.createLinearGradient(0, 0, 0, h); gnd.addColorStop(0, '#7b5426'); gnd.addColorStop(1, '#4a3014');
  c.fillStyle = gnd; c.fillRect(-w * 2, 0, w * 4, h * 2);
  c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-w * 2, 0); c.lineTo(w * 2, 0); c.stroke();
  for (let p = -25; p <= 25; p += 2.5) {
    if (!p) continue; const len = p % 10 === 0 ? 46 : p % 5 === 0 ? 26 : 12;
    c.lineWidth = 2; c.beginPath(); c.moveTo(-len, -p * ppd); c.lineTo(len, -p * ppd); c.stroke();
    if (p % 10 === 0) { txt(c, String(Math.abs(p)), -len - 16, -p * ppd, 15, '#fff', 'center'); txt(c, String(Math.abs(p)), len + 16, -p * ppd, 15, '#fff', 'center'); }
  }
  c.restore();
  c.save(); c.translate(cx, cy); c.strokeStyle = '#fff'; c.lineWidth = 2; const Rr = h * 0.36;
  c.beginPath(); c.arc(0, 0, Rr, Math.PI * 1.33, Math.PI * 1.67); c.stroke();
  [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60].forEach(a => { const r = (a - 90) * Math.PI / 180, l = Math.abs(a) % 30 === 0 ? 16 : 9; c.beginPath(); c.moveTo(Math.cos(r) * Rr, Math.sin(r) * Rr); c.lineTo(Math.cos(r) * (Rr + l), Math.sin(r) * (Rr + l)); c.stroke(); });
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -Rr); c.lineTo(-8, -Rr - 14); c.lineTo(8, -Rr - 14); c.closePath(); c.fill();
  c.rotate(-roll); c.beginPath(); c.moveTo(0, -Rr + 2); c.lineTo(-9, -Rr + 16); c.lineTo(9, -Rr + 16); c.closePath(); c.fill();
  c.fillRect(-14, -Rr + 20, 28, 5);
  c.restore();
  c.save(); c.translate(cx, cy); c.fillStyle = '#ffd31a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-70, 24); c.lineTo(-30, 24); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(70, 24); c.lineTo(30, 24); c.closePath(); c.fill(); c.stroke();
  c.fillRect(-w * 0.27, -3, 42, 7); c.strokeRect(-w * 0.27, -3, 42, 7); c.fillRect(w * 0.27 - 42, -3, 42, 7); c.strokeRect(w * 0.27 - 42, -3, 42, 7);
  c.restore();
}
function tape(c, x, y, w, h, value, step, label, fmt, side) {
  c.save(); c.fillStyle = 'rgba(30,36,44,0.62)'; c.fillRect(x, y, w, h); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const ppu = h / (step * 7.5);
  for (let v = Math.floor((value - step * 5) / step) * step; v < value + step * 5; v += step / 2) {
    if (v < 0 && side === 'L') continue;
    const yy = y + h / 2 - (v - value) * ppu, major = v % step === 0;
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath();
    if (side === 'L') { c.moveTo(x + w, yy); c.lineTo(x + w - (major ? 16 : 9), yy); } else { c.moveTo(x, yy); c.lineTo(x + (major ? 16 : 9), yy); }
    c.stroke();
    if (major) txt(c, fmt(v), side === 'L' ? x + w - 22 : x + 22, yy, 21, '#fff', side === 'L' ? 'right' : 'left');
  }
  if (side === 'L') { // airspeed colour bands (KIAS): white flap range, green normal, yellow caution
    const band = (a, b, col, off) => { c.fillStyle = col; c.fillRect(x + w - off, y + h / 2 - (b - value) * ppu, 6, (b - a) * ppu); };
    band(49, 102, '#fff', 6); band(55, 125, G, 12); band(125, 154, Y, 12);
  }
  c.restore();
  const ry = y + h / 2; c.fillStyle = '#000'; c.strokeStyle = '#fff'; c.lineWidth = 2;
  c.beginPath(); if (side === 'L') { c.moveTo(x + 2, ry - 22); c.lineTo(x + w - 12, ry - 22); c.lineTo(x + w, ry); c.lineTo(x + w - 12, ry + 22); c.lineTo(x + 2, ry + 22); } else { c.moveTo(x + w - 2, ry - 22); c.lineTo(x + 12, ry - 22); c.lineTo(x, ry); c.lineTo(x + 12, ry + 22); c.lineTo(x + w - 2, ry + 22); } c.closePath(); c.fill(); c.stroke();
  txt(c, side === 'L' && value < 20 ? '---' : fmt(Math.round(value)), x + w / 2 + (side === 'L' ? -4 : 6), ry + 1, 26, '#fff', 'center');
  if (label) { c.fillStyle = 'rgba(10,12,16,0.85)'; c.fillRect(x, y - 26, w, 26); txt(c, label, x + w / 2, y - 13, 15, C.cyan, 'center'); }
}
function hsi(c, cx, cy, Rr, hdg) {
  c.save(); c.fillStyle = 'rgba(18,22,28,0.82)'; c.beginPath(); c.arc(cx, cy, Rr + 8, 0, Math.PI * 2); c.fill();
  c.translate(cx, cy); c.rotate(-hdg * Math.PI / 180);
  c.strokeStyle = '#fff'; c.lineWidth = 2;
  for (let a = 0; a < 360; a += 5) { const r = a * Math.PI / 180, l = a % 30 === 0 ? 16 : a % 10 === 0 ? 11 : 6; c.beginPath(); c.moveTo(Math.sin(r) * Rr, -Math.cos(r) * Rr); c.lineTo(Math.sin(r) * (Rr - l), -Math.cos(r) * (Rr - l)); c.stroke(); }
  ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'].forEach((s, i) => { const r = i * 30 * Math.PI / 180; c.save(); c.translate(Math.sin(r) * (Rr - 32), -Math.cos(r) * (Rr - 32)); c.rotate(r); txt(c, s, 0, 0, i % 3 === 0 ? 22 : 18, '#fff', 'center'); c.restore(); });
  c.strokeStyle = C.mag; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -Rr + 26); c.lineTo(0, Rr - 26); c.stroke();
  c.restore();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(cx, cy - Rr - 2); c.lineTo(cx - 9, cy - Rr - 16); c.lineTo(cx + 9, cy - Rr - 16); c.closePath(); c.fill();
  c.fillStyle = '#000'; c.strokeStyle = '#fff'; c.lineWidth = 2; rrect(c, cx - 34, cy - Rr - 48, 68, 30, 4); c.fill(); c.stroke();
  txt(c, String(Math.round(hdg) % 360 || 360).padStart(3, '0') + '°', cx, cy - Rr - 32, 21, '#fff', 'center');
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(cx, cy - 16); c.lineTo(cx - 14, cy + 12); c.lineTo(cx, cy + 6); c.lineTo(cx + 14, cy + 12); c.closePath(); c.fill();
}

// ---------- Engine indications ----------
function dial(c, cx, cy, r, val, min, max, bands, label, readout, ok) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = v => a0 + (a1 - a0) * Math.max(0, Math.min(1, (v - min) / (max - min)));
  c.lineWidth = r * 0.17; bands.forEach(([a, b, col]) => { c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, r, ang(a), ang(b)); c.stroke(); });
  c.strokeStyle = '#d9dee4'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r * 1.1, a0, a1); c.stroke();
  if (ok) { c.fillStyle = '#fff'; c.save(); c.translate(cx, cy); c.rotate(ang(val)); c.beginPath(); c.moveTo(r * 1.08, 0); c.lineTo(r * 0.25, -5); c.lineTo(r * 0.25, 5); c.closePath(); c.fill(); c.restore(); }
  txt(c, label, cx + r * 0.1, cy + r * 0.12, r * 0.28, C.white, 'center');
  txt(c, ok ? readout : '---', cx + r * 0.1, cy + r * 0.55, r * 0.42, ok ? C.white : C.grey, 'center');
}
function hbar(c, x, y, w, label, val, min, max, readout, bands, ok, h = 54) {
  txt(c, label, x, y + 12, 17, C.white, 'left'); txt(c, ok ? readout : '---', x + w, y + 12, 19, ok ? C.white : C.grey, 'right');
  const by = y + 28;
  bands.forEach(([a, b, col]) => { c.fillStyle = col; c.fillRect(x + w * (a - min) / (max - min), by, w * (b - a) / (max - min), 10); });
  if (ok) { const px = x + w * Math.max(0, Math.min(1, (val - min) / (max - min))); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(px, by + 11); c.lineTo(px - 8, by + 24); c.lineTo(px + 8, by + 24); c.closePath(); c.fill(); }
  return y + h;
}
function eisStrip(c, x, w, H, s, ok) {
  c.fillStyle = '#05080b'; c.fillRect(x, 0, w, H); c.strokeStyle = C.line; c.lineWidth = 2; c.beginPath(); c.moveTo(x + w, 0); c.lineTo(x + w, H); c.stroke();
  const e = s.engine, ff = e.running ? (e.rpm / 2400) * 9.5 : 0;
  dial(c, x + w / 2 - 6, 88, 56, e.rpm, 0, 3000, [[500, 2700, G], [2700, 2800, R]], 'RPM', String(Math.round(e.rpm / 10) * 10), ok);
  const cht = 60 + (e.oilTemp - 15) * 1.9, egt = e.running ? 900 + e.rpm * 0.18 : 60 + (e.oilTemp - 15) * 2;
  let y = 156;
  y = hbar(c, x + 14, y, w - 28, 'GPH', ff, 0, 20, ff.toFixed(1), [[0, 20, G]], ok);
  y = hbar(c, x + 14, y, w - 28, 'OIL PSI', e.oilPress, 0, 115, String(Math.round(e.oilPress)), [[0, 25, R], [25, 55, Y], [55, 95, G], [95, 115, R]], ok);
  y = hbar(c, x + 14, y, w - 28, 'OIL °F', e.oilTemp * 9 / 5 + 32, 40, 260, String(Math.round(e.oilTemp * 9 / 5 + 32)), [[40, 100, Y], [100, 245, G], [245, 260, R]], ok);
  y = hbar(c, x + 14, y, w - 28, 'CHT °F', cht, 50, 520, String(Math.round(cht)), [[50, 150, Y], [150, 500, G], [500, 520, R]], ok);
  y = hbar(c, x + 14, y, w - 28, 'EGT °F', egt, 50, 1650, String(Math.round(egt)), [[50, 1650, G]], ok);
  txt(c, 'FUEL QTY GAL', x + 14, y + 12, 15, C.white, 'left');
  const by = y + 30, bw = w - 28;
  [[0, 3, R], [3, 8, Y], [8, 24, G]].forEach(([a, b, col]) => { c.fillStyle = col; c.fillRect(x + 14 + bw * a / 24, by, bw * (b - a) / 24, 10); });
  if (ok) [['L', s.fuel.L, -1], ['R', s.fuel.R, 1]].forEach(([l, v, d]) => {
    const px = x + 14 + bw * Math.min(1, v / 24); c.fillStyle = '#fff'; c.beginPath();
    if (d < 0) { c.moveTo(px, by - 1); c.lineTo(px - 9, by - 16); c.lineTo(px + 9, by - 16); } else { c.moveTo(px, by + 11); c.lineTo(px - 9, by + 26); c.lineTo(px + 9, by + 26); }
    c.closePath(); c.fill(); txt(c, l, px, d < 0 ? by - 10 : by + 20, 11, '#000', 'center', 800);
  });
  txt(c, ok ? 'L ' + s.fuel.L.toFixed(0) : 'L --', x + 14, by + 42, 17, C.white, 'left'); txt(c, ok ? s.fuel.R.toFixed(0) + ' R' : '-- R', x + w - 14, by + 42, 17, C.white, 'right');
  y = by + 70;
  txt(c, 'VOLTS', x + 14, y, 16); txt(c, ok ? s.elec.volts.toFixed(1) : '--', x + w - 14, y, 18, ok && (s.elec.volts < 24.5 || s.elec.volts > 29.5) ? Y : C.white, 'right');
  txt(c, 'AMPS', x + 14, y + 28, 16); txt(c, ok ? String(Math.round(s.elec.altAmps)) : '--', x + w - 14, y + 28, 18, C.white, 'right');
}

// ---------- G3X Touch: PFD with split MFD (Engine page, Weight & Balance) ----------
const G3 = { W: 1024, H: 680 };
function g3xMain(c, s, B, now) {
  const W = G3.W, H = G3.H, av = s.avionics, ok = powered('cb_engsensor');
  const split = av.mfd !== 'none', eisW = 200;
  eisStrip(c, 0, eisW, H, s, ok);
  B.push({ x: 0, y: 0, w: eisW, h: H - 40, fn: () => { av.mfd = av.mfd === 'eng' ? 'none' : 'eng'; } });
  const px = eisW, pw = (split ? 612 : W) - eisW;
  const adahrs = powered('cb_adahrs') && av.adahrsT > 18;
  if (adahrs) {
    attitude(c, px, 48, pw, H - 88, 2.5, 0);
    const tw = split ? 84 : 98;
    tape(c, px + 10, 130, tw, 300, 0, 10, 'IAS', v => String(v), 'L');
    tape(c, px + pw - tw - 34, 130, tw, 300, s.fieldElev, 100, 'ALT', v => String(v), 'R');
    c.fillStyle = 'rgba(30,36,44,0.62)'; c.fillRect(px + pw - 32, 160, 26, 240); txt(c, '0', px + pw - 19, 280, 14, '#fff', 'center');
    const bx = px + pw - tw - 34, byy = 450;
    c.fillStyle = '#000'; c.strokeStyle = C.line; c.lineWidth = 2; c.fillRect(bx, byy, tw, 34); c.strokeRect(bx, byy, tw, 34);
    txt(c, s.baro.toFixed(2) + 'IN', bx + tw / 2, byy + 18, 19, C.cyan, 'center');
    B.push({ x: bx, y: byy - 6, w: tw / 2, h: 46, fn: () => { s.baro = Math.round((s.baro - 0.01) * 100) / 100; } });
    B.push({ x: bx + tw / 2, y: byy - 6, w: tw / 2, h: 46, fn: () => { s.baro = Math.round((s.baro + 0.01) * 100) / 100; } });
    hsi(c, px + pw / 2, H + (split ? 40 : 60), split ? 150 : 175, 360);
  } else {
    c.fillStyle = '#0b0f14'; c.fillRect(px, 48, pw, H - 88);
    if (powered('cb_adahrs')) txt(c, 'AHRS ALIGN: KEEP WINGS LEVEL', px + pw / 2, 120, 21, C.amber, 'center');
    c.strokeStyle = R; c.lineWidth = 6;
    const xs = [[px + 30, px + 120], [px + pw / 2 - 90, px + pw / 2 + 90], [px + pw - 120, px + pw - 30]];
    xs.forEach(([a, b]) => { c.beginPath(); c.moveTo(a, 170); c.lineTo(b, 430); c.moveTo(b, 170); c.lineTo(a, 430); c.stroke(); });
  }
  // Autopilot status box: PFT runs for about 30 s after the autopilot is powered
  if (powered('cb_autopilot')) {
    const bw = 170, bx = px + pw / 2 - bw / 2;
    c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(bx, 50, bw, 30); c.strokeStyle = C.line; c.lineWidth = 2; c.strokeRect(bx, 50, bw, 30);
    if (av.pftT < 30) txt(c, 'PFT', bx + bw / 2, 66, 20, C.white, 'center');
  }
  // Top bar: COM, transponder, data fields
  c.fillStyle = '#05080b'; c.fillRect(px, 0, W - px, 48); c.strokeStyle = C.line; c.lineWidth = 2; c.beginPath(); c.moveTo(px, 48); c.lineTo(W, 48); c.stroke();
  const com = powered('cb_com1'), xp = powered('cb_gpsxpdr');
  txt(c, 'COM1', px + 10, 14, 13, C.grey); txt(c, 'STBY', px + 120, 14, 13, C.grey);
  txt(c, com ? s.com.act : '---.---', px + 10, 34, 22, com ? C.green : C.grey); txt(c, com ? s.com.stby : '---.---', px + 120, 34, 22, com ? C.cyan : C.grey);
  c.fillStyle = '#000'; c.strokeStyle = C.line; c.fillRect(px + 236, 4, 116, 40); c.strokeRect(px + 236, 4, 116, 40);
  txt(c, 'N100PT', px + 294, 14, 12, C.grey, 'center');
  txt(c, xp ? s.xpdr.code : '----', px + 266, 32, 20, xp ? C.white : C.grey, 'center'); txt(c, xp ? 'GND' : '', px + 324, 32, 16, C.green, 'center');
  button(c, B, px + 356, 6, 64, 36, 'IDENT', null, { size: 14 });
  if (!split) [['GS', '0KT'], ['DTK', '___°'], ['TRK', '___°'], ['ETE', '__:__']].forEach(([l, v], i) => { const fx = px + 440 + i * 86; txt(c, l, fx, 14, 12, C.grey); txt(c, v, fx, 34, 18, C.mag); });
  button(c, B, W - 70, 6, 62, 36, split ? 'Full' : 'Split', () => { av.mfd = split ? 'none' : (av.lastMfd || 'eng'); }, { size: 15 });
  // CAS window (touch to acknowledge)
  const cas = casMessages();
  if (cas.length) {
    const cw = 186, cx0 = px + pw - cw - 8, cy0 = H - 44 - cas.length * 30;
    c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(cx0 - 4, cy0 - 4, cw + 8, cas.length * 30 + 4);
    cas.forEach((m, i) => {
      const flash = !s.casAck[m.t] && (now % 1 < 0.5), col = m.c === 'red' ? R : m.c === 'amber' ? C.amber : C.white;
      if (flash) { c.fillStyle = col; c.fillRect(cx0, cy0 + i * 30, cw, 26); }
      txt(c, m.t, cx0 + cw / 2, cy0 + i * 30 + 14, 17, flash ? (m.c === 'red' ? '#fff' : '#000') : col, 'center', 800);
    });
    B.push({ x: cx0, y: cy0, w: cw, h: cas.length * 30, fn: () => cas.forEach(m => (s.casAck[m.t] = true)) });
  }
  // Status bar and soft keys
  c.fillStyle = '#05080b'; c.fillRect(px, H - 34, W - px, 34);
  txt(c, `TMR 00:00:00   OAT ${powered('cb_adahrs') ? '15°C' : '--'}   LCL ${new Date().toTimeString().slice(0, 8)}`, px + 12, H - 16, 15, C.white);
  button(c, B, W - 250, H - 32, 76, 30, 'ENG', () => { av.mfd = 'eng'; av.lastMfd = 'eng'; }, { size: 14, on: av.mfd === 'eng' });
  button(c, B, W - 168, H - 32, 76, 30, 'W&B', () => { av.mfd = 'wb'; av.lastMfd = 'wb'; }, { size: 14, on: av.mfd === 'wb' });
  button(c, B, W - 86, H - 32, 80, 30, 'MENU', () => { av.mfd = av.mfd === 'none' ? 'eng' : 'none'; }, { size: 14 });
  if (split) {
    c.fillStyle = C.panel; c.fillRect(612, 48, W - 612, H - 82); c.strokeStyle = C.line; c.beginPath(); c.moveTo(612, 48); c.lineTo(612, H - 34); c.stroke();
    av.mfd === 'eng' ? engPage(c, s, B, 612, 48, W - 612, H - 82, ok) : wbPage(c, s, B, 612, 48, W - 612, H - 82);
  }
}

function engPage(c, s, B, x, y, w, h, ok) {
  const av = s.avionics;
  ['Main', 'Fuel Calc'].forEach((l, i) => button(c, B, x + 10 + i * 140, y + 8, 132, 34, l, () => (av.engTab = i ? 'fuel' : 'main'), { on: (av.engTab === 'fuel') === !!i, size: 16 }));
  const yy = y + 56;
  if (av.engTab !== 'fuel') {
    const e = s.engine;
    dial(c, x + w / 2, yy + 92, 74, e.rpm, 0, 3000, [[500, 2700, G], [2700, 2800, R]], 'RPM', String(Math.round(e.rpm / 10) * 10), ok);
    let by = yy + 190;
    by = hbar(c, x + 18, by, w - 36, 'OIL PRES PSI', e.oilPress, 0, 115, String(Math.round(e.oilPress)), [[0, 25, R], [25, 55, Y], [55, 95, G], [95, 115, R]], ok);
    by = hbar(c, x + 18, by, w - 36, 'OIL TEMP °F', e.oilTemp * 9 / 5 + 32, 40, 260, String(Math.round(e.oilTemp * 9 / 5 + 32)), [[40, 100, Y], [100, 245, G], [245, 260, R]], ok);
    txt(c, 'FUEL USED', x + 18, by + 14, 15, C.grey); txt(c, av.fuelUsed.toFixed(1) + ' GAL', x + w - 18, by + 14, 17, C.white, 'right');
  } else {
    txt(c, 'Calculated only. Not a fuel gauge.', x + w / 2, yy + 12, 14, C.amber, 'center', 600);
    txt(c, 'FUEL REMAINING', x + 18, yy + 52, 16, C.grey);
    button(c, B, x + 18, yy + 70, 60, 56, '–', () => { av.fuelRem = Math.max(0, av.fuelRem - 1); av.fuelSet = true; }, { size: 32 });
    c.fillStyle = '#000'; c.fillRect(x + 88, yy + 70, w - 176, 56); c.strokeStyle = C.cyan; c.lineWidth = 2; c.strokeRect(x + 88, yy + 70, w - 176, 56);
    txt(c, av.fuelSet ? av.fuelRem.toFixed(1) + ' GAL' : '__._ GAL', x + w / 2, yy + 99, 30, av.fuelSet ? C.cyan : C.grey, 'center');
    button(c, B, x + w - 78, yy + 70, 60, 56, '+', () => { av.fuelRem = Math.min(48, av.fuelRem + 1); av.fuelSet = true; }, { size: 32 });
    txt(c, 'PRESETS', x + 18, yy + 152, 16, C.grey);
    button(c, B, x + 18, yy + 168, (w - 46) / 2, 50, 'Full  48.0', () => { av.fuelRem = 48; av.fuelSet = true; }, { size: 18 });
    button(c, B, x + 28 + (w - 46) / 2, yy + 168, (w - 46) / 2, 50, 'Tabs  34.0', () => { av.fuelRem = 34; av.fuelSet = true; }, { size: 18 });
    txt(c, 'FUEL USED', x + 18, yy + 246, 16, C.grey); txt(c, av.fuelUsed.toFixed(1) + ' GAL', x + w - 120, yy + 246, 20, C.white, 'right');
    button(c, B, x + w - 104, yy + 230, 86, 34, 'Reset', () => (av.fuelUsed = 0), { size: 15 });
  }
}

// Weight and balance from POH Section 6 (stations) and Section 2 (C.G. limits)
export const WB = { empty: [1582, 86.5], stations: [['Pilot', 80.5, 'pilot'], ['Copilot', 80.5, 'copilot'], ['Rear seat', 118.1, 'rear'], ['Fuel (gal)', 95.0, 'fuel']] };
export function wbTotals(wb) {
  let W = WB.empty[0], M = WB.empty[0] * WB.empty[1];
  WB.stations.forEach(([, arm, k]) => { const lb = k === 'fuel' ? wb[k] * 6 : wb[k]; W += lb; M += lb * arm; });
  const cg = M / W, fwd = W <= 2050 ? 82.0 : 82.0 + (W - 2050) * (88.6 - 82.0) / 500;
  return { W, cg, fwd, aft: 93.0, ok: W <= 2550 && cg >= fwd && cg <= 93.0 };
}
function wbPage(c, s, B, x, y, w, h) {
  const wb = s.avionics.wb;
  txt(c, 'Weight & Balance', x + 16, y + 22, 20);
  txt(c, 'Planning only', x + w - 14, y + 22, 13, C.grey, 'right', 600);
  txt(c, `Empty  ${WB.empty[0]} LB @ ${WB.empty[1]} IN`, x + 16, y + 52, 15, C.grey, 'left', 600);
  WB.stations.forEach(([l, arm, k], i) => {
    const ry = y + 76 + i * 52, step = k === 'fuel' ? 1 : 10;
    txt(c, l, x + 16, ry + 20, 17); txt(c, arm.toFixed(1) + ' IN', x + 140, ry + 20, 13, C.grey, 'left', 600);
    button(c, B, x + w - 186, ry, 46, 40, '–', () => { wb[k] = Math.max(0, wb[k] - step); s.avionics.wbSet = true; }, { size: 26 });
    c.fillStyle = '#000'; c.fillRect(x + w - 136, ry, 82, 40); c.strokeStyle = C.cyan; c.lineWidth = 2; c.strokeRect(x + w - 136, ry, 82, 40);
    txt(c, String(wb[k]), x + w - 95, ry + 21, 20, C.cyan, 'center');
    button(c, B, x + w - 50, ry, 46, 40, '+', () => { wb[k] = Math.min(k === 'fuel' ? 48 : 400, wb[k] + step); s.avionics.wbSet = true; }, { size: 26 });
  });
  const T = wbTotals(wb), ty = y + 300;
  txt(c, `TOTAL ${Math.round(T.W)} LB`, x + 16, ty, 18); txt(c, `CG ${T.cg.toFixed(1)} IN`, x + w - 16, ty, 18, C.white, 'right');
  const gx = x + 30, gy = ty + 18, gw = w - 60, gh = h - (ty - y) - 30;
  const X = cg => gx + (cg - 80) / 15 * gw, Yv = wt => gy + gh - (wt - 1500) / 1100 * gh;
  c.strokeStyle = C.line; c.lineWidth = 1; c.strokeRect(gx, gy, gw, gh);
  c.strokeStyle = C.cyan; c.lineWidth = 2; c.beginPath(); c.moveTo(X(82), Yv(1500)); c.lineTo(X(82), Yv(2050)); c.lineTo(X(88.6), Yv(2550)); c.lineTo(X(93), Yv(2550)); c.lineTo(X(93), Yv(1500)); c.stroke();
  c.fillStyle = T.ok ? C.green : R; c.beginPath(); c.arc(X(T.cg), Yv(T.W), 8, 0, Math.PI * 2); c.fill();
  txt(c, T.ok ? 'IN RANGE' : 'OUT OF RANGE', x + w / 2, gy + 16, 16, T.ok ? C.green : R, 'center');
}

function g3xDatabase(c, s, B) {
  const W = G3.W, H = G3.H, a = airac();
  c.fillStyle = C.panel; c.fillRect(0, 0, W, H);
  txt(c, 'Database Information', W / 2, 50, 30, C.white, 'center');
  [['Navigation', `Cycle ${a.id}`, `Expires ${a.end}`], ['Obstacle', `Cycle ${a.id}`, 'Current'], ['SafeTaxi', `Cycle ${a.id}`, 'Current'], ['Terrain', 'Version 2.10', 'Current'], ['Basemap', 'Version 1.05', 'Current'], ['Airport Directory', `Cycle ${a.id}`, 'Current']].forEach(([n, v, st], i) => {
    const y = 110 + i * 62; c.fillStyle = i % 2 ? '#121921' : '#0e141b'; c.fillRect(80, y, W - 160, 56);
    txt(c, n, 100, y + 28, 22); txt(c, v, 470, y + 28, 20, C.cyan); txt(c, st, W - 100, y + 28, 20, C.green, 'right');
  });
  txt(c, `Navigation data effective ${a.start}`, W / 2, H - 140, 18, C.grey, 'center', 600);
  button(c, B, W / 2 - 110, H - 110, 220, 64, 'Continue', () => { s.avionics.g3xPage = 'main'; s.avionics.dbViewed = true; }, { size: 24, on: true });
}

// ---------- G5 standby ----------
function g5(c, s) {
  const W = 400, H = 400, av = s.avionics;
  if (av.g5Boot < 3) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); txt(c, 'Self test', W / 2, H / 2, 26, C.white, 'center'); c.fillStyle = C.cyan; c.fillRect(100, 230, 200 * Math.min(1, av.g5Boot / 3), 6); return; }
  if (av.g5Boot < 9) { c.fillStyle = '#0b0f14'; c.fillRect(0, 0, W, H); txt(c, 'ALIGNING', W / 2, 150, 26, C.amber, 'center'); }
  else attitude(c, 0, 0, W, H, 2.5, 0);
  tape(c, 4, 80, 74, 220, 0, 10, '', v => String(v), 'L');
  tape(c, W - 84, 80, 80, 220, s.fieldElev, 100, '', v => String(v), 'R');
  c.fillStyle = '#000'; c.fillRect(0, H - 50, W, 50); txt(c, '360°', W / 2, H - 25, 24, C.white, 'center');
  txt(c, s.baro.toFixed(2), W - 50, H - 25, 18, C.cyan, 'center');
  if (!busPowered()) { c.fillStyle = C.amber; c.fillRect(100, 300, 200, 36); txt(c, 'ON BATTERY', W / 2, 318, 20, '#000', 'center', 800); }
}

// ---------- GNX 375: start-up, Instrument Test, then map with transponder bar ----------
function gnx(c, s, B) {
  const W = 640, H = 200, av = s.avionics, a = airac();
  c.fillStyle = '#05080b'; c.fillRect(0, 0, W, H);
  if (av.gnxBoot < 5) { txt(c, 'Starting', W / 2, 80, 26, C.white, 'center'); c.fillStyle = C.cyan; c.fillRect(170, 120, 300 * Math.min(1, av.gnxBoot / 5), 6); return; }
  if (av.gnxPage === 'start') {
    txt(c, 'Databases', 16, 20, 20); txt(c, 'SW 3.20', W - 16, 20, 15, C.grey, 'right');
    [['Navigation', a.id, `to ${a.end}`], ['Obstacle', a.id, 'Current'], ['Terrain', '', 'Current'], ['SafeTaxi', a.id, 'Current']].forEach(([n, v, st], i) => { const y = 50 + i * 30; txt(c, n, 16, y, 17); txt(c, v, 240, y, 17, C.cyan); txt(c, st, 470, y, 16, C.green); });
    button(c, B, W - 150, H - 46, 136, 40, 'Continue', () => (av.gnxPage = 'test'), { size: 18, on: true });
  } else if (av.gnxPage === 'test') {
    txt(c, 'Instrument Test', 16, 20, 20);
    ['CDI  centered', 'Flags  in view', 'Annunciators  on', 'Transponder  ALT'].forEach((l, i) => { txt(c, l, 16 + (i % 2) * 300, 64 + Math.floor(i / 2) * 40, 18); txt(c, 'OK', 260 + (i % 2) * 300, 64 + Math.floor(i / 2) * 40, 18, C.green, 'right'); });
    button(c, B, W - 150, H - 46, 136, 40, 'Continue', () => (av.gnxPage = 'map'), { size: 18, on: true });
  } else {
    c.fillStyle = '#0f2014'; c.fillRect(0, 0, W, H - 40);
    c.strokeStyle = '#26442c'; c.lineWidth = 2; for (let i = -2; i < 10; i++) { c.beginPath(); c.moveTo(i * 80, 0); c.lineTo(i * 80 + 60, H - 40); c.stroke(); }
    c.strokeStyle = '#d0d0d0'; c.lineWidth = 6; c.beginPath(); c.moveTo(300, 70); c.lineTo(360, 110); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(320, 76); c.lineTo(308, 104); c.lineTo(320, 98); c.lineTo(332, 104); c.closePath(); c.fill();
    txt(c, '2 NM', 16, H - 56, 15);
    c.fillStyle = '#000'; c.fillRect(0, H - 40, W, 40);
    // per the POH, the GNX 375 has no ground mode and always shows ALT
    txt(c, 'XPDR', 14, H - 20, 15, C.grey); txt(c, s.xpdr.code, 76, H - 20, 22); txt(c, 'ALT', 150, H - 20, 20, C.green);
    txt(c, 'GPS', W - 14, H - 20, 16, C.green, 'right'); txt(c, 'TERM', W - 70, H - 20, 16, C.white, 'right');
  }
}

// ---------- GNC 255A nav/com ----------
function gnc(c, s) {
  const W = 640, H = 150, av = s.avionics;
  c.fillStyle = '#04111a'; c.fillRect(0, 0, W, H);
  if (av.gncBoot < 2.5) { txt(c, 'NAV/COM', W / 2, H / 2, 30, C.cyan, 'center'); return; }
  txt(c, 'ACT', 12, 40, 16, C.cyan); txt(c, s.com.act, 60, 46, 54);
  txt(c, 'COM', 290, 26, 16, C.cyan); txt(c, 'STBY', 352, 40, 16, C.cyan); txt(c, s.com.stby, 404, 46, 54);
  txt(c, 'TOWER', 80, 100, 22, '#bfe6ff', 'left', 600); txt(c, 'GROUND', 424, 100, 22, '#bfe6ff', 'left', 600);
  c.fillStyle = '#1b3a4d'; c.fillRect(12, 124, 200, 10); c.fillStyle = C.cyan; c.fillRect(12, 124, 130, 10);
  txt(c, 'NAV 110.50', W - 14, 128, 18, C.grey, 'right');
}

function dimmer(c, W, H, k) { if (k < 0.999) { c.fillStyle = `rgba(0,0,0,${1 - k})`; c.fillRect(0, 0, W, H); } }
function black(c, W, H) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }

export function makeDisplays() {
  const [pfdC, p] = canvas(G3.W, G3.H), [g5C, g] = canvas(400, 400), [gnxC, x] = canvas(640, 200), [gncC, n] = canvas(640, 150);
  const buttons = { pfd: [], gnx: [] };
  function draw(s, now) {
    const av = s.avionics, dim = 0.35 + 0.65 * s.dimAvionics;
    buttons.pfd = []; buttons.gnx = [];
    if (!powered('cb_pfd')) black(p, G3.W, G3.H);
    else if (av.pfdBoot < 5) { black(p, G3.W, G3.H); txt(p, 'Starting up', G3.W / 2, G3.H / 2 - 20, 34, C.white, 'center', 400); p.fillStyle = C.cyan; p.fillRect(G3.W / 2 - 150, G3.H / 2 + 30, 300 * Math.min(1, av.pfdBoot / 5), 6); }
    else if (av.g3xPage === 'db') g3xDatabase(p, s, buttons.pfd);
    else g3xMain(p, s, buttons.pfd, now);
    dimmer(p, G3.W, G3.H, dim);
    if (!(powered('cb_stby') || (av.g5Boot > 0 && s.sw.batt))) black(g, 400, 400); else g5(g, s);
    dimmer(g, 400, 400, dim);
    if (!powered('cb_gpsxpdr')) black(x, 640, 200); else gnx(x, s, buttons.gnx);
    dimmer(x, 640, 200, dim);
    if (!powered('cb_com1')) black(n, 640, 150); else gnc(n, s);
    dimmer(n, 640, 150, dim);
  }
  // A touch on a screen, from the raycast hit's texture coordinates
  function touch(which, uv) {
    const W = which === 'pfd' ? G3.W : 640, H = which === 'pfd' ? G3.H : 200;
    const px = uv.x * W, py = (1 - uv.y) * H;
    const b = [...buttons[which]].reverse().find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    if (b) { b.fn(); emit('avionics'); return true; }
    return false;
  }
  return { pfdC, g5C, gnxC, gncC, draw, touch };
}
