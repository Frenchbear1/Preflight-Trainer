// Screen drawings for the PFD, standby instrument and radios. These are simplified training
// renderings driven by the airplane state, not copies of the manufacturer's screens.
import { casMessages, powered, busPowered, alternatorOnline } from './state.js';

function ctx(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const FONT = 'Helvetica, Arial, sans-serif';

function booting(c, w, h, t, label) {
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#9fb3c8'; c.font = `600 ${h * 0.07}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, w / 2, h * 0.45);
  c.fillStyle = '#1c2836'; c.fillRect(w * 0.3, h * 0.56, w * 0.4, h * 0.02);
  c.fillStyle = '#4fb3ff'; c.fillRect(w * 0.3, h * 0.56, w * 0.4 * Math.min(1, t), h * 0.02);
}

function attitude(c, x, y, w, h, pitch, roll) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.translate(x + w / 2, y + h / 2); c.rotate(-roll);
  const ppd = h / 40; // pixels per degree
  c.translate(0, pitch * ppd);
  c.fillStyle = '#2e7fd6'; c.fillRect(-w * 2, -h * 3, w * 4, h * 3);
  c.fillStyle = '#7a4d22'; c.fillRect(-w * 2, 0, w * 4, h * 3);
  c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-w * 2, 0); c.lineTo(w * 2, 0); c.stroke();
  c.fillStyle = '#fff'; c.font = `600 ${h * 0.035}px ${FONT}`; c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let p = -20; p <= 20; p += 2.5) {
    if (!p) continue; const len = p % 10 === 0 ? w * 0.13 : p % 5 === 0 ? w * 0.07 : w * 0.035;
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(-len, -p * ppd); c.lineTo(len, -p * ppd); c.stroke();
    if (p % 10 === 0) { c.fillText(Math.abs(p), -len - 6, -p * ppd); }
  }
  c.restore();
  // aircraft symbol
  c.save(); c.translate(x + w / 2, y + h / 2); c.fillStyle = '#ffd400'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-w * 0.12, h * 0.07); c.lineTo(-w * 0.04, h * 0.07); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(w * 0.12, h * 0.07); c.lineTo(w * 0.04, h * 0.07); c.closePath(); c.fill(); c.stroke();
  c.fillRect(-w * 0.3, -3, w * 0.1, 6); c.strokeRect(-w * 0.3, -3, w * 0.1, 6); c.fillRect(w * 0.2, -3, w * 0.1, 6); c.strokeRect(w * 0.2, -3, w * 0.1, 6);
  c.restore();
}

function tape(c, x, y, w, h, value, step, major, fmt, align) {
  c.save(); c.fillStyle = 'rgba(20,24,30,0.72)'; c.fillRect(x, y, w, h); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const ppu = h / (step * 8);
  c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.font = `600 ${w * 0.26}px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = align === 'left' ? 'left' : 'right';
  const start = Math.floor((value - step * 5) / step) * step;
  for (let v = start; v < value + step * 5; v += step) {
    if (v < 0) continue;
    const yy = y + h / 2 - (v - value) * ppu; const isMaj = v % major === 0;
    c.lineWidth = 1.5; c.beginPath();
    if (align === 'left') { c.moveTo(x, yy); c.lineTo(x + (isMaj ? w * 0.22 : w * 0.12), yy); } else { c.moveTo(x + w, yy); c.lineTo(x + w - (isMaj ? w * 0.22 : w * 0.12), yy); }
    c.stroke();
    if (isMaj) c.fillText(fmt(v), align === 'left' ? x + w * 0.3 : x + w * 0.72, yy);
  }
  c.restore();
  // readout box
  c.fillStyle = '#000'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
  c.fillRect(x - 2, y + h / 2 - w * 0.2, w + 4, w * 0.4); c.strokeRect(x - 2, y + h / 2 - w * 0.2, w + 4, w * 0.4);
  c.fillStyle = '#fff'; c.font = `700 ${w * 0.3}px ${FONT}`; c.textAlign = 'center'; c.fillText(fmt(Math.round(value)), x + w / 2, y + h / 2 + 1);
}

function arcGauge(c, cx, cy, r, val, min, max, bands, label, txt) {
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
  const ang = v => a0 + (a1 - a0) * Math.max(0, Math.min(1, (v - min) / (max - min)));
  c.lineWidth = r * 0.16;
  bands.forEach(([from, to, col]) => { c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, r, ang(from), ang(to)); c.stroke(); });
  c.strokeStyle = '#fff'; c.lineWidth = 3; const a = ang(val);
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05); c.stroke();
  c.fillStyle = '#fff'; c.font = `700 ${r * 0.42}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, cx, cy + r * 0.55);
  c.fillStyle = '#9fb3c8'; c.font = `600 ${r * 0.26}px ${FONT}`; c.fillText(label, cx, cy - r * 0.35);
}
function bar(c, x, y, w, label, val, min, max, txt, bands) {
  c.fillStyle = '#9fb3c8'; c.font = `600 ${w * 0.11}px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, x, y);
  c.fillStyle = '#fff'; c.textAlign = 'right'; c.font = `700 ${w * 0.12}px ${FONT}`; c.fillText(txt, x + w, y);
  const by = y + w * 0.1, bh = w * 0.045;
  bands.forEach(([a, b, col]) => { c.fillStyle = col; c.fillRect(x + w * (a - min) / (max - min), by, w * (b - a) / (max - min), bh); });
  const px = x + w * Math.max(0, Math.min(1, (val - min) / (max - min)));
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(px, by - 2); c.lineTo(px - 6, by - 11); c.lineTo(px + 6, by - 11); c.closePath(); c.fill();
}

export function makeDisplays() {
  const [pfdC, pfd] = ctx(1024, 680), [g5C, g5] = ctx(400, 400), [gnxC, gnx] = ctx(640, 200), [gncC, gnc] = ctx(640, 150);
  return { pfdC, g5C, gnxC, gncC, draw: s => drawAll(s, { pfd, g5, gnx, gnc }) };
}

function drawAll(s, { pfd, g5, gnx, gnc }) {
  const e = s.engine, av = s.avionics;
  const dim = 0.35 + 0.65 * s.dimAvionics;
  // ---- G3X PFD ----
  {
    const c = pfd, W = 1024, H = 680;
    if (!powered('cb_pfd')) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    else if (av.pfdBoot < 4) booting(c, W, H, av.pfdBoot / 4, 'Starting up');
    else {
      // Engine strip on the left
      const ex = 0, ew = 230;
      c.fillStyle = '#05080c'; c.fillRect(ex, 0, ew, H);
      const ok = powered('cb_engsensor');
      arcGauge(c, ew / 2, 92, 66, ok ? e.rpm : 0, 0, 2800, [[500, 2700, '#1fbf4a'], [2700, 2800, '#e02020']], 'RPM', ok ? String(Math.round(e.rpm / 10) * 10) : '---');
      const rows = [
        ['FF', e.running ? (e.rpm / 2400) * 9.5 : 0, 0, 20, x => x.toFixed(1) + ' GPH', [[0, 20, '#1fbf4a']]],
        ['OIL PRES', e.oilPress, 0, 115, x => Math.round(x) + ' PSI', [[0, 25, '#e02020'], [25, 55, '#f0c020'], [55, 95, '#1fbf4a'], [95, 115, '#e02020']]],
        ['OIL TEMP', e.oilTemp * 9 / 5 + 32, 40, 260, x => Math.round(x) + ' °F', [[40, 100, '#f0c020'], [100, 245, '#1fbf4a'], [245, 260, '#e02020']]],
        ['FUEL L', s.fuel.L, 0, 25, x => x.toFixed(0) + ' GAL', [[0, 3, '#e02020'], [3, 8, '#f0c020'], [8, 25, '#1fbf4a']]],
        ['FUEL R', s.fuel.R, 0, 25, x => x.toFixed(0) + ' GAL', [[0, 3, '#e02020'], [3, 8, '#f0c020'], [8, 25, '#1fbf4a']]],
        ['VOLTS', s.elec.volts, 20, 32, x => x.toFixed(1) + ' V', [[20, 24.5, '#f0c020'], [24.5, 29.5, '#1fbf4a'], [29.5, 32, '#e02020']]],
        ['ALT AMPS', s.elec.altAmps, 0, 70, x => Math.round(x) + ' A', [[0, 70, '#1fbf4a']]],
      ];
      rows.forEach((r, i) => bar(c, 18, 196 + i * 66, ew - 36, r[0], ok ? r[1] : 0, r[2], r[3], ok ? r[4](r[1]) : '---', r[5]));
      // Flight instruments
      const ax = ew, aw = W - ew;
      if (powered('cb_adahrs') && av.pfdBoot > 6) {
        attitude(c, ax, 0, aw, H, 2.5 - s.yokePitch * 0, 0);
        tape(c, ax + 24, 110, 96, 400, 0, 10, 20, v => String(v), 'right');
        tape(c, W - 130, 110, 106, 400, 380, 100, 200, v => String(v), 'left');
        c.fillStyle = '#9fb3c8'; c.font = `600 18px ${FONT}`; c.textAlign = 'center'; c.fillText('KIAS', ax + 72, 100); c.fillText('29.92', W - 77, 530);
        // heading arc
        c.save(); c.beginPath(); c.arc(ax + aw / 2, H + 120, 250, Math.PI, 2 * Math.PI); c.fillStyle = 'rgba(10,14,20,0.8)'; c.fill(); c.restore();
        c.fillStyle = '#fff'; c.font = `700 26px ${FONT}`; c.fillText('360°', ax + aw / 2, H - 100);
      } else {
        c.fillStyle = '#0b0f14'; c.fillRect(ax, 0, aw, H);
        c.strokeStyle = '#e02020'; c.lineWidth = 6; c.beginPath(); c.moveTo(ax + 80, 80); c.lineTo(W - 80, H - 80); c.moveTo(W - 80, 80); c.lineTo(ax + 80, H - 80); c.stroke();
        c.fillStyle = '#fff'; c.font = `700 30px ${FONT}`; c.textAlign = 'center'; c.fillText(powered('cb_adahrs') ? 'ALIGNING' : 'ATTITUDE FAIL', ax + aw / 2, H / 2);
      }
      // Top bar: com / nav
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(ax, 0, aw, 46);
      c.font = `700 22px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = powered('cb_com1') ? '#22e06a' : '#555'; c.fillText('COM 119.100', ax + 14, 23);
      c.fillStyle = powered('cb_nav') ? '#22e06a' : '#555'; c.fillText('NAV 110.50', ax + 214, 23);
      c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText(powered('cb_gpsxpdr') ? 'XPDR 1200 ALT' : 'XPDR ---', W - 14, 23);
      // CAS window lower right
      const cas = casMessages();
      if (cas.length) {
        const bx = W - 240, by = H - 26 - cas.length * 34;
        c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(bx, by, 228, cas.length * 34 + 12);
        cas.forEach((m, i) => {
          c.fillStyle = m.c === 'red' ? '#e3241b' : '#f2b705'; c.fillRect(bx + 8, by + 8 + i * 34, 212, 28);
          c.fillStyle = m.c === 'red' ? '#fff' : '#000'; c.font = `800 20px ${FONT}`; c.textAlign = 'center'; c.fillText(m.t, bx + 114, by + 23 + i * 34);
        });
      }
    }
    applyDim(c, W, H, dim);
  }
  // ---- G5 standby ----
  {
    const c = g5, W = 400, H = 400;
    const on = powered('cb_stby') || (av.g5Boot > 0 && s.sw.batt);
    if (!on) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    else if (av.g5Boot < 3) booting(c, W, H, av.g5Boot / 3, 'Standby');
    else {
      attitude(c, 0, 0, W, H, 2.5, 0);
      tape(c, 6, 70, 70, 260, 0, 10, 20, v => String(v), 'right');
      tape(c, W - 82, 70, 76, 260, 380, 100, 200, v => String(v), 'left');
      if (!busPowered()) { c.fillStyle = '#f2b705'; c.fillRect(120, 350, 160, 34); c.fillStyle = '#000'; c.font = `800 20px ${FONT}`; c.textAlign = 'center'; c.fillText('ON BATTERY', 200, 368); }
    }
    applyDim(c, W, H, dim);
  }
  // ---- GNX 375 ----
  {
    const c = gnx, W = 640, H = 200;
    if (!powered('cb_gpsxpdr')) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    else if (av.gnxBoot < 5) booting(c, W, H, av.gnxBoot / 5, 'GPS navigator');
    else {
      c.fillStyle = '#0d1a10'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#2d4a2f'; c.lineWidth = 1; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(i * 60, 0); c.lineTo(i * 60 - 80, H); c.stroke(); }
      c.strokeStyle = '#d23cd2'; c.lineWidth = 4; c.beginPath(); c.moveTo(160, H); c.lineTo(420, 20); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(200, 120); c.lineTo(188, 150); c.lineTo(212, 150); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(0, 0, W, 40);
      c.fillStyle = '#fff'; c.font = `700 22px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('GPS  TERM', 12, 20);
      c.textAlign = 'right'; c.fillStyle = '#22e06a'; c.fillText('1200  ALT', W - 12, 20);
    }
    applyDim(c, W, H, dim);
  }
  // ---- GNC 255A ----
  {
    const c = gnc, W = 640, H = 150;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (powered('cb_com1')) {
      if (av.gncBoot < 2.5) booting(c, W, H, av.gncBoot / 2.5, 'Nav / Com');
      else {
        c.fillStyle = '#071620'; c.fillRect(0, 0, W, H);
        c.textBaseline = 'middle'; c.textAlign = 'left';
        c.fillStyle = '#7fd3ff'; c.font = `700 18px ${FONT}`; c.fillText('ACT', 14, 52); c.fillText('STBY', 348, 52);
        c.fillStyle = '#fff'; c.font = `700 56px ${FONT}`; c.fillText('119.100', 60, 56); c.fillText('124.550', 404, 56);
        c.fillStyle = '#7fd3ff'; c.font = `700 22px ${FONT}`; c.fillText('COM', 290, 46);
        c.fillStyle = '#cfe8f7'; c.font = `600 22px ${FONT}`; c.fillText('TOWER', 80, 112); c.fillText('ATIS', 424, 112);
      }
    }
    applyDim(c, W, H, dim);
  }
}
function applyDim(c, W, H, k) { if (k < 0.999) { c.fillStyle = `rgba(0,0,0,${1 - k})`; c.fillRect(0, 0, W, H); } }
