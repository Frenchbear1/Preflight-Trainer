// Panel face artwork, drawn in the coordinates of POH Figure 7-19 (instrument panel).
// Drawing units are "figure pixels" (u, v): the panel spans u 70–1675 and v 115–795.
import { BREAKERS, SWITCHES } from './data.js';

export const FIG = { u0: 70, u1: 1675, v0: 115, v1: 795 };
export const SCALE = 2; // canvas pixels per figure pixel

// Panel outline traced from the figure (clockwise from bottom left)
export const OUTLINE = [
  [92, 795], [100, 560], [72, 335], [92, 290], [150, 228], [260, 175], [420, 140], [620, 121], [872, 115], [1120, 121], [1330, 140], [1480, 172], [1590, 222], [1655, 290], [1673, 335], [1648, 560], [1652, 795],
];

export function drawPanel() {
  const W = (FIG.u1 - FIG.u0) * SCALE, H = (FIG.v1 - FIG.v0) * SCALE;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.scale(SCALE, SCALE); c.translate(-FIG.u0, -FIG.v0);
  // Base: dark charcoal with a fine matte texture
  c.fillStyle = '#1d1f22'; c.fillRect(FIG.u0, FIG.v0, FIG.u1 - FIG.u0, FIG.v1 - FIG.v0);
  const img = c.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 9; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  c.putImageData(img, 0, 0);
  const text = (s, u, v, size = 7, opts = {}) => {
    c.save(); c.fillStyle = opts.color || '#e9ecef'; c.font = `${opts.weight || 700} ${size}px Helvetica, Arial, sans-serif`;
    c.textAlign = opts.align || 'center'; c.textBaseline = 'middle';
    String(s).split('\n').forEach((line, i, a) => c.fillText(line, u, v + (i - (a.length - 1) / 2) * size * 1.08));
    c.restore();
  };
  const box = (u, v, w, h, stroke = '#cfd4d9', lw = 0.9) => { c.strokeStyle = stroke; c.lineWidth = lw; c.strokeRect(u, v, w, h); };
  const screw = (u, v) => { c.fillStyle = '#5b5f65'; c.beginPath(); c.arc(u, v, 3.2, 0, 7); c.fill(); c.strokeStyle = '#2b2d30'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(u - 2, v); c.lineTo(u + 2, v); c.moveTo(u, v - 2); c.lineTo(u, v + 2); c.stroke(); };

  // panel fastener screws around the edge (from the figure)
  [[118, 278], [105, 475], [100, 580], [100, 780], [370, 152], [623, 133], [872, 133], [983, 133], [1095, 133], [1235, 135], [1515, 190], [1633, 293], [1643, 780], [612, 780], [1140, 780], [1392, 780]].forEach(([u, v]) => screw(u, v));

  // 1. Registration plate
  c.fillStyle = '#d9dcdf'; c.fillRect(470, 161, 58, 23); box(470, 161, 58, 23, '#555', 1); text('N100PT', 499, 172.5, 11, { color: '#111' });
  // Va placard (left of the PFD)
  c.fillStyle = '#e6e8ea'; c.fillRect(178, 268, 68, 30);
  text('Vo 113 KIAS AT 2550 LBS.\nVo  89 KIAS AT 1917 LBS.\nDEMO X-WIND 17 KTS.', 212, 283, 4.3, { color: '#111' });
  // 4. Map light switch label
  text('ON', 935, 189, 5.5); text('OFF', 935, 228, 5.5); text('MAP', 958, 208, 5.5, { align: 'left' });
  // 15. Switch row labels and ON/OFF bracket
  SWITCHES.forEach(s => text(s.label, s.u, 620, 5.2));
  c.strokeStyle = '#e9ecef'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(598, 640); c.lineTo(598, 633); c.lineTo(866, 633); c.lineTo(866, 640); c.stroke(); text('ON', 730, 632, 5.5);
  c.beginPath(); c.moveTo(598, 678); c.lineTo(598, 685); c.lineTo(866, 685); c.lineTo(866, 678); c.stroke(); text('OFF', 730, 686, 5.5);
  // 16. Magnetos and 17. start
  text('LEFT\nMAG', 780, 556, 5.2); text('RIGHT\nMAG', 813, 556, 5.2);
  c.beginPath(); c.moveTo(765, 569); c.lineTo(765, 565); c.lineTo(828, 565); c.lineTo(828, 569); c.stroke(); text('ON', 796, 565, 5.2);
  c.beginPath(); c.moveTo(765, 597); c.lineTo(765, 602); c.lineTo(828, 602); c.lineTo(828, 597); c.stroke(); text('OFF', 796, 603, 5.2);
  text('ENGINE\nSTART', 731, 551, 5.2);
  // 8. Dimming
  text('DIMMING', 1052, 546, 5.5); text('AVIONICS', 1025, 560, 5); text('PANEL', 1080, 560, 5);
  c.beginPath(); c.moveTo(1008, 556); c.lineTo(1008, 549); c.lineTo(1030, 549); c.moveTo(1074, 549); c.lineTo(1094, 549); c.lineTo(1094, 556); c.stroke();
  // 14. ALT AIR
  box(1089, 633, 32, 102, '#cfd4d9'); text('CLOSE', 1105, 642, 5.5); text('ALT.\nAIR', 1105, 684, 8, { weight: 400 }); text('OPEN', 1105, 726, 5.5);
  c.fillStyle = '#0b0c0d'; c.fillRect(1050, 645, 6, 102);
  // 13. Circuit breakers
  const row1 = BREAKERS.filter(b => b.row === 1), row2 = BREAKERS.filter(b => b.row === 2);
  box(1126, 615, 448, 25); box(1126, 688, 382, 22);
  row1.forEach(b => text(b.label, b.u, 627, 4.6));
  row2.forEach(b => text(b.label, b.u, 699, 4.6));
  // 9. Heat / defrost
  c.fillStyle = '#0b0c0d'; c.fillRect(1395, 529, 77, 5); c.fillRect(1395, 555, 77, 5);
  text('OFF', 1385, 545, 5.5, { align: 'right' }); text('ON', 1482, 545, 5.5, { align: 'left' });
  text('HEAT', 1433, 520, 5); text('DEF', 1433, 568, 5);
  // 10. ELT remote
  c.fillStyle = '#2b2e31'; c.fillRect(1440, 435, 52, 78); box(1440, 435, 52, 78, '#9aa0a6');
  text('ELT', 1466, 446, 6); text('ON', 1466, 462, 4.5); text('ARM/OFF', 1466, 488, 4.2); text('TEST', 1466, 505, 4.2);
  // 11, 12. Hobbs meters
  [[1550, 470, 'MAINTENANCE'], [1550, 532, 'BILLING']].forEach(([u, v, l]) => {
    c.fillStyle = '#d9dcdf'; c.fillRect(u - 30, v - 22, 60, 10); text(l, u, v - 17, 5, { color: '#111' });
    c.fillStyle = '#0c0c0c'; c.fillRect(u - 28, v - 8, 56, 26); box(u - 28, v - 8, 56, 26, '#888');
    text('TOTAL HOURS', u, v + 15, 3.6, { color: '#ccc' });
  });
  // 18. USB and headset jacks
  [[178, 725], [1563, 725]].forEach(([u, v]) => { c.fillStyle = '#0a0a0a'; c.fillRect(u - 12, v - 7, 24, 14); box(u - 12, v - 7, 24, 14, '#aaa'); text('USB', u, v - 14, 4.5); });
  [[118, 706, 'PHONE'], [118, 745, 'MIC'], [1625, 706, 'PHONE'], [1625, 745, 'MIC']].forEach(([u, v, l]) => text(l, u + (u < 500 ? 22 : -24), v, 4.2));
  // Alternate static placard
  c.fillStyle = '#e6e8ea'; c.fillRect(277, 745, 195, 27);
  text('ALTERNATE STATIC SOURCE - PULL AFT TO OPEN', 375, 753, 5.4, { color: '#111' });
  text('ALL CABIN VENTS MUST BE CLOSED AND CABIN VENT FAN OFF. HEATER\nAND DEFROSTER MUST BE ON. OPEN FOR STATIC SYSTEM DRAIN', 375, 765, 3.4, { color: '#111', weight: 400 });
  // GMC 507 face (drawn here; the bezel is a 3D part)
  return cv;
}

// Convert a figure point to panel-local metres (x right, y up from the panel bottom)
export const K = 1.07 / (FIG.u1 - FIG.u0); // metres per figure pixel
export const uv2m = (u, v) => [(u - 872) * K, (FIG.v1 - v) * K];
