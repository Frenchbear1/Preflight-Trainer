// Cockpit: instrument panel laid out from POH Figure 7-19, control quadrant (Figure 7-1),
// flight control console (Figure 7-3), fuel selector (Figure 7-11), seats, pedals and yokes.
import * as THREE from 'three';
import { drawPanel, OUTLINE, FIG, K } from './panelart.js';
import { makeDisplays } from './displays.js';
import { BREAKERS, SWITCHES } from './data.js';
import { rbox, tube, lerp } from './geom.js';
import { powered, busPowered } from './state.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const PZ = 1.62; // panel face station
export const PB = 0.97; // panel bottom height
export const EYE = V(-0.27, 1.43, 2.42); // pilot's eye

// figure pixel → world point on (or in front of) the panel face
const P = (u, v, dz = 0) => V((u - 872) * K, PB + (FIG.v1 - v) * K, PZ + dz);

const mat = {
  bezel: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.55, metalness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6, metalness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 1 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xa9adb2, roughness: 0.35, metalness: 0.9 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc81d1d, roughness: 0.45 }),
  seat: new THREE.MeshStandardMaterial({ color: 0xd8d0bf, roughness: 0.75 }),
  seatDark: new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 0.8 }),
  carpet: new THREE.MeshStandardMaterial({ color: 0x2b2c2f, roughness: 1 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.7 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xc9c2b2, roughness: 0.8 }),
  yoke: new THREE.MeshStandardMaterial({ color: 0x2d2f33, roughness: 0.55, metalness: 0.25 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.9 }),
  glare: new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.95 }),
  led: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 0 }),
  ledG: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3322, emissiveIntensity: 0 }),
};

function hot(o, id) { o.userData.hot = id; o.traverse?.(c => (c.userData.hot = id)); return o; }
function cyl(r, len, m, seg = 20) { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return new THREE.Mesh(g, m); }

// Canvas texture helper
function canvasTex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function label(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); return canvasTex(c); }

export function buildCockpit(renderer) {
  const g = new THREE.Group(); g.name = 'cockpit';
  const parts = { toggles: {}, breakers: {}, knobs: {} };

  // ---------- Panel face ----------
  const shape = new THREE.Shape();
  OUTLINE.forEach(([u, v], i) => { const x = (u - 872) * K, y = PB + (FIG.v1 - v) * K; i ? shape.lineTo(x, y) : shape.moveTo(x, y); });
  const pg = new THREE.ShapeGeometry(shape, 24);
  const uv = pg.attributes.uv, pos = pg.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const u = x / K + 872, v = FIG.v1 - (y - PB) / K;
    uv.setXY(i, (u - FIG.u0) / (FIG.u1 - FIG.u0), (FIG.v1 - v) / (FIG.v1 - FIG.v0));
  }
  const panelTex = canvasTex(drawPanel()); panelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const panel = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.8, metalness: 0.1 }));
  panel.position.z = PZ; panel.receiveShadow = true; g.add(panel);
  // panel back (so it reads as a solid sheet from the engine side)
  const back = new THREE.Mesh(pg, mat.plastic); back.position.z = PZ - 0.004; back.rotation.y = Math.PI; back.scale.x = -1; g.add(back);

  // ---------- Glareshield ----------
  {
    const top = [], N = 40;
    for (let i = 0; i <= N; i++) {
      const u = lerp(80, 1665, i / N); // find panel top v at this u by interpolating the outline's upper part
      const up = OUTLINE.slice(2, 15); let v = 115;
      for (let k = 0; k < up.length - 1; k++) if (u >= up[k][0] && u <= up[k + 1][0]) v = lerp(up[k][1], up[k + 1][1], (u - up[k][0]) / (up[k + 1][0] - up[k][0]));
      top.push([(u - 872) * K, PB + (FIG.v1 - v) * K]);
    }
    const P3 = [], I = [];
    top.forEach(([x, y]) => { P3.push(x, y - 0.018, PZ + 0.035, x, y + 0.012, PZ + 0.02, x * 1.03, y + 0.075 + 0.03 * (1 - Math.abs(x) / 0.56), PZ - 0.2); });
    for (let i = 0; i < N; i++) { const a = i * 3; for (let k = 0; k < 2; k++) I.push(a + k, a + 3 + k, a + k + 1, a + 3 + k, a + 4 + k, a + k + 1); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3)); gg.setIndex(I); gg.computeVertexNormals();
    const gm = new THREE.Mesh(gg, mat.glare); gm.material.side = THREE.DoubleSide; gm.castShadow = true; g.add(gm);
    // red LED strip under the lip
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.0015, 0.004), mat.led); strip.position.set(0, PB + (FIG.v1 - 150) * K - 0.016, PZ + 0.022); g.add(strip);
    parts.led = mat.led;
  }

  // ---------- Avionics ----------
  const D = makeDisplays(); parts.displays = D;
  const screen = (cv, u0, v0, u1, v1, dz, id) => {
    const tex = canvasTex(cv); tex.anisotropy = 4;
    const w = (u1 - u0) * K, h = (v1 - v0) * K;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.copy(P((u0 + u1) / 2, (v0 + v1) / 2, dz)); hot(m, id); g.add(m); return tex;
  };
  const bezel = (u0, v0, u1, v1, depth, id) => {
    const w = (u1 - u0) * K, h = (v1 - v0) * K;
    const m = new THREE.Mesh(rbox(w, h, depth, 0.006), mat.bezel); m.position.copy(P((u0 + u1) / 2, (v0 + v1) / 2, depth / 2)); m.castShadow = true; hot(m, id); g.add(m); return m;
  };
  // 2. G3X Touch 10.6" PFD
  bezel(280, 193, 698, 482, 0.03, 'pfd');
  parts.pfdTex = screen(D.pfdC, 298, 208, 680, 462, 0.0305, 'pfd');
  [0, 1, 2, 3].forEach(i => { const b = new THREE.Mesh(rbox(0.016, 0.006, 0.006, 0.002), mat.plastic); b.position.copy(P(560 + i * 30, 472, 0.031)); hot(b, 'pfd'); g.add(b); });
  // 3. G5 standby
  bezel(776, 150, 908, 288, 0.032, 'g5');
  parts.g5Tex = screen(D.g5C, 786, 158, 898, 262, 0.0325, 'g5');
  [[796, 274], [882, 274]].forEach(([u, v], i) => { const k = cyl(i ? 0.009 : 0.006, 0.012, i ? mat.black : mat.plastic); k.position.copy(P(u, v, 0.032)); hot(k, 'g5'); g.add(k); });
  // 5. GNX 375, 6. GNC 255A, 7. GMC 507
  bezel(728, 292, 970, 370, 0.026, 'gnx');
  parts.gnxTex = screen(D.gnxC, 748, 300, 930, 362, 0.0265, 'gnx');
  { const k = cyl(0.011, 0.016, mat.black); k.position.copy(P(952, 353, 0.026)); hot(k, 'gnx'); g.add(k); }
  bezel(728, 372, 970, 438, 0.026, 'gnc');
  parts.gncTex = screen(D.gncC, 778, 378, 920, 413, 0.0265, 'gnc');
  [[747, 388, 0.008], [747, 420, 0.008], [952, 420, 0.011]].forEach(([u, v, r]) => { const k = cyl(r, 0.016, mat.black); k.position.copy(P(u, v, 0.026)); hot(k, 'gnc'); g.add(k); });
  ['C/N', 'OBS', 'T/F', 'FUNC', 'CLR', 'ENT'].forEach((l, i) => { const b = new THREE.Mesh(rbox(0.014, 0.0065, 0.005, 0.0015), mat.plastic); b.position.copy(P(778 + i * 28, 426, 0.027)); hot(b, 'gnc'); g.add(b); });
  bezel(728, 440, 970, 520, 0.024, 'gmc');
  const gmcTex = label(640, 210, (c, w, h) => {
    c.fillStyle = '#131416'; c.fillRect(0, 0, w, h);
    const keys = ['AP', 'FD', 'HDG', 'TRK', 'NAV', 'APR', 'VS', 'ALT', 'IAS', 'LVL'];
    keys.forEach((k, i) => {
      const col = i % 5, row = Math.floor(i / 5), x = 26 + col * 104, y = 30 + row * 86;
      c.fillStyle = '#2b2d31'; c.fillRect(x, y, 86, 60); c.strokeStyle = '#4a4d52'; c.lineWidth = 3; c.strokeRect(x, y, 86, 60);
      c.fillStyle = '#e8eaee'; c.font = '700 26px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(k, x + 43, y + 32);
    });
    c.fillStyle = '#2b2d31'; c.fillRect(560, 26, 56, 154); c.fillStyle = '#e8eaee'; c.font = '700 26px Helvetica'; c.fillText('UP', 588, 50); c.fillText('DN', 588, 160);
  });
  const gmcFace = new THREE.Mesh(new THREE.PlaneGeometry((958 - 740) * K, (512 - 448) * K), new THREE.MeshStandardMaterial({ map: gmcTex, roughness: 0.6, emissive: 0xffffff, emissiveMap: gmcTex, emissiveIntensity: 0 }));
  gmcFace.position.copy(P(849, 480, 0.0245)); hot(gmcFace, 'gmc'); g.add(gmcFace); parts.gmcFace = gmcFace;

  // ---------- Switches ----------
  const toggle = (u, v, id, long = 0.022) => {
    const base = cyl(0.0055, 0.006, mat.chrome, 16); base.position.copy(P(u, v, 0)); g.add(base);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.002, 6), mat.chrome); nut.rotation.x = Math.PI / 2; nut.position.copy(P(u, v, 0.001)); g.add(nut);
    const grp = new THREE.Group(); grp.position.copy(P(u, v, 0.006)); g.add(grp);
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0018, long, 12), mat.chrome); bat.rotation.x = Math.PI / 2; bat.position.z = long / 2; grp.add(bat);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 12, 8), mat.chrome); tip.position.z = long; grp.add(tip);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.03), new THREE.MeshBasicMaterial({ visible: false })); hit.position.copy(P(u, v, 0.014)); g.add(hit);
    [base, bat, tip, hit].forEach(o => hot(o, id));
    parts.toggles[id] = grp; return grp;
  };
  SWITCHES.forEach(s => toggle(s.u, 657, s.id));
  toggle(780, 582, 'magL'); toggle(813, 582, 'magR');
  toggle(935, 208, 'mapLight', 0.016);
  // ELT remote switch with LED
  toggle(1466, 475, 'elt', 0.016);
  const eltLed = new THREE.Mesh(new THREE.SphereGeometry(0.003, 10, 8), mat.ledG); eltLed.position.copy(P(1466, 455, 0.002)); g.add(eltLed); parts.eltLed = mat.ledG;
  // 17. Engine start push button
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0022, 8, 24), mat.chrome); ring.position.copy(P(731, 583, 0.002)); g.add(ring);
    const btn = cyl(0.0085, 0.008, mat.black); btn.position.copy(P(731, 583, 0)); g.add(btn); parts.startBtn = btn;
    hot(ring, 'start'); hot(btn, 'start');
  }
  // 8. Dimming rheostats
  const knob = (u, v, id, r = 0.0085) => {
    const grp = new THREE.Group(); grp.position.copy(P(u, v, 0)); g.add(grp);
    const k = cyl(r, 0.014, mat.black, 24); grp.add(k);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0012, r * 0.8, 0.001), mat.white); mark.position.set(0, r * 0.5, 0.0145); grp.add(mark);
    hot(grp, id); parts.knobs[id] = grp; return grp;
  };
  knob(1025, 581, 'dimAvionics'); knob(1080, 581, 'dimPanel');
  // 14. Alternate air lever (vertical slot: up CLOSE, down OPEN)
  {
    const grp = new THREE.Group(); g.add(grp); parts.altAir = grp;
    const stem = cyl(0.0025, 0.02, mat.chrome); grp.add(stem);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 12), mat.black); k.position.z = 0.022; k.scale.set(1, 1.4, 1); grp.add(k);
    hot(grp, 'altAir');
  }
  // 9. Heat / defrost levers (horizontal slots: left OFF, right ON)
  ['heat', 'defrost'].forEach((id, i) => {
    const grp = new THREE.Group(); g.add(grp); parts[id] = { grp, v: i ? 557 : 531 };
    const stem = cyl(0.002, 0.014, mat.chrome); grp.add(stem);
    const k = new THREE.Mesh(rbox(0.014, 0.008, 0.008, 0.003), mat.black); k.position.z = 0.016; grp.add(k);
    hot(grp, id);
  });
  // 13. Circuit breakers (push-to-reset; a white band shows when popped)
  BREAKERS.forEach(b => {
    const v = b.row === 1 ? 655 : 727;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(b.big ? 0.0085 : 0.0072, b.big ? 0.0085 : 0.0072, 0.003, b.big ? 6 : 24), mat.chrome); nut.rotation.x = Math.PI / 2; nut.position.copy(P(b.u, v, 0.0015)); g.add(nut);
    const grp = new THREE.Group(); grp.position.copy(P(b.u, v, 0)); g.add(grp);
    const band = cyl(b.big ? 0.0052 : 0.0042, 0.01, mat.white); grp.add(band);
    const cap = cyl(b.big ? 0.0058 : 0.0048, 0.007, mat.black); cap.position.z = 0.006; grp.add(cap);
    const ampTex = label(64, 64, (c, w, h) => { c.fillStyle = '#0c0c0d'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '700 30px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(b.amps), w / 2, h / 2 + 2); });
    const face = new THREE.Mesh(new THREE.CircleGeometry(b.big ? 0.0056 : 0.0046, 20), new THREE.MeshStandardMaterial({ map: ampTex, roughness: 0.5 })); face.position.z = 0.0131; grp.add(face);
    hot(nut, b.id); hot(grp, b.id);
    parts.breakers[b.id] = grp;
  });
  // Eyeball vents left and right
  [[202, 348], [1537, 352]].forEach(([u, v]) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 10, 30), mat.chrome); r.position.copy(P(u, v, 0.004)); g.add(r);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.021, 20, 14), mat.black); ball.position.copy(P(u, v, -0.004)); ball.scale.z = 0.6; g.add(ball);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.position.copy(P(u, v, 0.009)); g.add(hole);
  });
  // Headset jacks and USB
  [[118, 706], [118, 745], [1625, 706], [1625, 745]].forEach(([u, v]) => { const j = cyl(0.0065, 0.004, mat.chrome); j.position.copy(P(u, v, 0)); hot(j, 'usb'); g.add(j); const h = new THREE.Mesh(new THREE.CircleGeometry(0.003, 12), mat.black); h.position.copy(P(u, v, 0.0045)); g.add(h); });
  // Hobbs meters
  [[1550, 475], [1550, 537]].forEach(([u, v], i) => {
    const t = label(200, 70, (c, w, h) => { c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h); ['0', '1', '2', '4', '7', '3'].forEach((d, k) => { c.fillStyle = k === 5 ? '#eee' : '#111'; c.fillRect(8 + k * 31, 10, 27, 50); c.fillStyle = k === 5 ? '#111' : '#eee'; c.font = '700 38px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(i ? String((+d + 3) % 10) : d, 21 + k * 31, 37); }); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(50 * K, 17 * K), new THREE.MeshStandardMaterial({ map: t })); m.position.copy(P(u, v, 0.0006)); hot(m, 'hobbs'); g.add(m);
  });

  // ---------- Control quadrant (Figure 7-1) ----------
  {
    const qx = 0.048; // quadrant centre, slightly right of the panel centre line (figure u ≈ 940)
    const hous = new THREE.Mesh(rbox(0.11, 0.17, 0.11, 0.012), mat.plastic); hous.position.set(qx, PB + 0.03, PZ + 0.045); hous.castShadow = true; g.add(hous);
    const face = new THREE.Mesh(rbox(0.10, 0.012, 0.13, 0.004), mat.black); face.position.set(qx, PB + 0.118, PZ + 0.06); face.rotation.x = -0.25; g.add(face);
    // slots
    [-0.022, 0.022].forEach(dx => { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.11), new THREE.MeshBasicMaterial({ color: 0x000000 })); sl.position.set(qx + dx, PB + 0.125, PZ + 0.06); sl.rotation.x = -0.25; g.add(sl); });
    const lever = (dx, id, knobMesh) => {
      const piv = new THREE.Group(); piv.position.set(qx + dx, PB - 0.02, PZ + 0.02); g.add(piv);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.2, 0.012), mat.alu); arm.position.y = 0.1; piv.add(arm);
      knobMesh.position.y = 0.205; piv.add(knobMesh);
      hot(piv, id); return piv;
    };
    // Throttle: black flat handle reaching toward the pilot
    const thK = new THREE.Group();
    const bar = new THREE.Mesh(rbox(0.075, 0.022, 0.03, 0.009), mat.black); bar.position.x = -0.03; thK.add(bar);
    parts.throttle = lever(-0.022, 'throttle', thK);
    // Mixture: red knob with ridges
    const mxK = new THREE.Group();
    const mk = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.03, 10), mat.red); mk.rotation.z = Math.PI / 2; mk.position.x = 0.01; mxK.add(mk);
    parts.mixture = lever(0.022, 'mixture', mxK);
    // Friction lever on the right side
    const fr = new THREE.Group(); fr.position.set(qx + 0.058, PB + 0.06, PZ + 0.07); g.add(fr);
    const frm = new THREE.Mesh(rbox(0.008, 0.05, 0.012, 0.003), mat.black); frm.position.y = 0.022; fr.add(frm); hot(fr, 'friction'); parts.friction = fr;
    // Pedestal down to the floor
    const ped = new THREE.Mesh(rbox(0.12, 0.33, 0.09, 0.01), mat.plastic); ped.position.set(qx, 0.80, PZ + 0.035); ped.castShadow = true; g.add(ped);
    // Rudder trim knob, right side of the pedestal, with an indicator
    const rt = new THREE.Group(); rt.position.set(qx + 0.06, 0.86, PZ + 0.05); g.add(rt);
    const rtk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 20), mat.black); rtk.rotation.z = Math.PI / 2; rtk.position.x = 0.011; rt.add(rtk);
    const rtm = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.004), mat.white); rtm.position.set(0.023, 0.009, 0); rt.add(rtm);
    hot(rt, 'rudderTrim'); parts.rudderTrim = rt;
    // Parking brake: pistol-grip hand brake below, behind and left of the quadrant
    const pb = new THREE.Group(); pb.position.set(qx - 0.07, 0.90, PZ + 0.04); g.add(pb);
    const grip = new THREE.Mesh(rbox(0.026, 0.026, 0.14, 0.01), mat.black); grip.position.set(0, -0.01, 0.07); grip.rotation.x = 0.2; pb.add(grip);
    const pbk = cyl(0.009, 0.012, mat.chrome); pbk.rotation.y = -Math.PI / 2; pbk.position.set(-0.012, 0.0, 0.05); pb.add(pbk);
    hot(pb, 'parkBrake'); parts.parkBrake = pb;
  }

  // ---------- Under the panel ----------
  { // Alternate static source knob (pull aft to open)
    const as = new THREE.Group(); as.position.set(-0.32, PB - 0.025, PZ + 0.0); g.add(as);
    const stem = cyl(0.003, 0.02, mat.chrome); as.add(stem); const k = cyl(0.011, 0.012, mat.black); k.position.z = 0.02; as.add(k);
    hot(as, 'altStatic'); parts.altStatic = as;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.012), new THREE.MeshStandardMaterial({ map: label(128, 48, (c, w, h) => { c.fillStyle = '#ddd'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = '700 20px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ALT STATIC', w / 2, h / 2); }) }));
    tag.position.set(-0.32, PB - 0.007, PZ + 0.002); g.add(tag);
  }
  // Firewall / kick panel and lower shroud
  { const fw = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.4), mat.plastic); fw.position.set(0, 0.78, 1.36); g.add(fw); }
  // Floor
  { const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 2.9), mat.carpet); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.645, 2.8); fl.receiveShadow = true; g.add(fl); }

  // Rudder pedals with toe brakes (pairs for pilot and copilot)
  parts.pedals = [];
  [-0.35, -0.19, 0.19, 0.35].forEach((x, i) => {
    const piv = new THREE.Group(); piv.position.set(x, 0.67, 1.44); g.add(piv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.012), mat.alu); arm.position.y = 0.065; arm.rotation.x = 0.25; piv.add(arm);
    const pedal = new THREE.Mesh(rbox(0.075, 0.12, 0.014, 0.006), mat.alu); pedal.position.set(0, 0.11, 0.03); pedal.rotation.x = -0.45; piv.add(pedal);
    const toe = new THREE.Mesh(rbox(0.07, 0.035, 0.012, 0.005), mat.plastic); toe.position.set(0, 0.165, 0.005); toe.rotation.x = -0.45; piv.add(toe);
    hot(piv, 'pedals'); parts.pedals.push({ piv, right: i % 2 === 1 });
  });
  { const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 10), mat.alu); tt.rotation.z = Math.PI / 2; tt.position.set(0, 0.665, 1.43); g.add(tt); }

  // ---------- Control wheels ----------
  parts.yokes = [];
  [[490, 545], [1250, 545]].forEach(([u, v]) => {
    const hub = P(u, v, 0);
    const shaft = cyl(0.012, 0.22, mat.chrome); shaft.position.copy(hub); g.add(shaft);
    const boot = cyl(0.026, 0.012, mat.black); boot.position.copy(hub); g.add(boot);
    const yk = new THREE.Group(); yk.position.copy(hub).add(V(0, 0, 0.19)); g.add(yk);
    const hubM = cyl(0.03, 0.05, mat.yoke); hubM.position.z = -0.02; yk.add(hubM);
    // Piper-style "ram's horn" wheel: a bar under the hub that sweeps up into two grips
    const path = [V(-0.175, 0.10, 0.0), V(-0.17, 0.02, 0.0), V(-0.14, -0.045, 0.0), V(-0.06, -0.07, 0.005), V(0, -0.072, 0.01), V(0.06, -0.07, 0.005), V(0.14, -0.045, 0.0), V(0.17, 0.02, 0.0), V(0.175, 0.10, 0.0)];
    const wheel = new THREE.Mesh(tube(path, 0.016, 40, 12), mat.yoke); wheel.castShadow = true; yk.add(wheel);
    const web = new THREE.Mesh(rbox(0.2, 0.06, 0.03, 0.012), mat.yoke); web.position.set(0, -0.04, -0.005); yk.add(web);
    [-1, 1].forEach(sx => {
      const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.085, 14), mat.grip); gr.position.set(sx * 0.176, 0.125, 0); gr.rotation.z = sx * 0.12; yk.add(gr);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.019, 14, 10), mat.grip); cap.position.set(sx * 0.181, 0.168, 0); yk.add(cap);
    });
    // push-to-talk and trim switch on the left grip
    const ptt = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), mat.red); ptt.position.set(-0.168, 0.15, 0.016); yk.add(ptt);
    const ap = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), mat.red); ap.position.set(0.168, 0.15, 0.016); yk.add(ap);
    hot(yk, 'yoke'); hot(shaft, 'yoke');
    parts.yokes.push({ g: yk, base: yk.position.clone() });
  });

  // ---------- Fuel selector (left kick panel, Figure 7-11) ----------
  {
    const fs = new THREE.Group(); fs.position.set(-0.535, 0.80, 1.78); fs.rotation.y = Math.PI / 2; g.add(fs);
    const plateTex = label(256, 256, (c, w, h) => {
      c.fillStyle = '#1b1c1f'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
      c.strokeStyle = '#d9d9d9'; c.lineWidth = 4; c.beginPath(); c.arc(128, 128, 112, 0, 7); c.stroke();
      const tag = (txt, sub, a) => {
        c.save(); c.translate(128, 128); c.rotate(a); c.translate(0, -88);
        c.fillStyle = '#0a0a0a'; c.fillRect(-30, -22, 60, 40); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '800 20px Helvetica'; c.fillText(txt, 0, -8); c.font = '700 11px Helvetica'; c.fillText(sub, 0, 9); c.restore();
      };
      tag('L', 'TANK 24 GAL', 0); tag('R', 'TANK 24 GAL', Math.PI / 2); tag('FUEL', 'OFF', -Math.PI / 2);
    });
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.055, 40), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.6 })); fs.add(plate);
    const h = new THREE.Group(); fs.add(h); parts.fuelSel = h;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.018, 18), mat.red); body.rotation.x = Math.PI / 2; body.position.z = 0.01; h.add(body);
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 12), mat.red); ptr.position.set(0, 0.036, 0.012); ptr.scale.z = 0.55; h.add(ptr);
    const tail = new THREE.Mesh(rbox(0.02, 0.03, 0.016, 0.006), mat.red); tail.position.set(0, -0.02, 0.012); h.add(tail);
    const btn = cyl(0.006, 0.006, mat.chrome); btn.position.z = 0.019; h.add(btn);
    hot(fs, 'fuelSel');
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), mat.trim); wall.position.set(-0.545, 0.82, 1.80); wall.rotation.y = Math.PI / 2; g.add(wall);
  }
  // Pitot and static drain valves, left lower sidewall
  [0, 1].forEach(i => { const d = cyl(0.006, 0.014, mat.chrome); d.rotation.y = Math.PI / 2; d.position.set(-0.56, 0.72, 2.0 + i * 0.04); hot(d, 'pitotDrain'); g.add(d); });

  // ---------- Console between the seats (Figure 7-3) ----------
  {
    const con = new THREE.Mesh(rbox(0.17, 0.12, 0.62, 0.04), mat.trim); con.position.set(0, 0.68, 2.28); con.castShadow = true; g.add(con);
    // Flap handle: pivot at the aft end, handle reaching forward
    const fp = new THREE.Group(); fp.position.set(-0.05, 0.745, 2.55); g.add(fp);
    const fh = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.46), mat.alu); fh.position.z = -0.23; fp.add(fh);
    const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 12), mat.black); fg.rotation.x = Math.PI / 2; fg.position.z = -0.42; fp.add(fg);
    const fb = cyl(0.006, 0.01, mat.chrome); fb.position.z = -0.475; fb.rotation.y = Math.PI; fp.add(fb);
    hot(fp, 'flaps'); parts.flaps = fp;
    // Stabilator trim wheel
    const tw = new THREE.Group(); tw.position.set(0.045, 0.715, 2.24); g.add(tw);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.022, 36), mat.black); wheel.rotation.z = Math.PI / 2; tw.add(wheel);
    for (let i = 0; i < 24; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.006, 0.006), mat.plastic); const a = (i / 24) * Math.PI * 2; r.position.set(0, Math.cos(a) * 0.081, Math.sin(a) * 0.081); r.rotation.x = -a; tw.add(r); }
    hot(tw, 'pitchTrim'); parts.pitchTrim = tw;
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.06), mat.white); ind.position.set(0.075, 0.745, 2.12); g.add(ind); parts.trimInd = ind;
  }

  // ---------- Seats ----------
  const seat = (x, z, w = 0.46) => {
    const s = new THREE.Group(); s.position.set(x, 0, z); g.add(s);
    const pan = new THREE.Mesh(rbox(w, 0.1, 0.48, 0.045), mat.seat); pan.position.set(0, 0.86, 0); pan.rotation.x = -0.08; s.add(pan);
    const back = new THREE.Mesh(rbox(w * 0.96, 0.62, 0.11, 0.05), mat.seat); back.position.set(0, 1.17, 0.27); back.rotation.x = -0.2; s.add(back);
    const head = new THREE.Mesh(rbox(w * 0.6, 0.16, 0.1, 0.04), mat.seat); head.position.set(0, 1.55, 0.35); head.rotation.x = -0.2; s.add(head);
    const base = new THREE.Mesh(rbox(w * 0.8, 0.2, 0.36, 0.02), mat.seatDark); base.position.set(0, 0.74, 0.02); s.add(base);
    [pan, back, head].forEach(m => (m.castShadow = m.receiveShadow = true));
    return s;
  };
  seat(-0.28, 2.50); seat(0.28, 2.50); seat(0, 3.32, 0.56);
  // Armrests on the sidewalls
  [-1, 1].forEach(sx => { const a = new THREE.Mesh(rbox(0.07, 0.05, 0.5, 0.02), mat.trim); a.position.set(sx * 0.56, 1.02, 2.45); g.add(a); });
  // Wet compass on the windshield bow
  { const cmp = new THREE.Group(); cmp.position.set(0, 1.715, 1.97); g.add(cmp); const b = new THREE.Mesh(rbox(0.06, 0.05, 0.06, 0.012), mat.black); cmp.add(b); const w = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.018), new THREE.MeshBasicMaterial({ color: 0xe8e2c8 })); w.position.z = 0.031; cmp.add(w); }

  // Interior fill light
  const fill = new THREE.PointLight(0xfff1dd, 1.2, 2.6, 1.6); fill.position.set(0, 1.62, 2.55); g.add(fill);
  const mapLight = new THREE.SpotLight(0xffffff, 0, 1.6, 0.9, 0.6, 1); mapLight.position.set(0, 1.40, 1.66); mapLight.target.position.set(0, 0.7, 2.3); g.add(mapLight, mapLight.target); parts.mapLight = mapLight;

  g.traverse(o => { if (o.isMesh && o.castShadow === false && o.geometry.type !== 'PlaneGeometry') o.castShadow = false; });
  return { group: g, parts, lastDraw: 0 };
}

const D2R = Math.PI / 180;
function ease(o, prop, target, dt, k = 12) { o[prop] += (target - o[prop]) * Math.min(1, dt * k); }

export function updateCockpit(cpt, s, t, dt) {
  const p = cpt.parts;
  // Toggle switches: up = ON
  for (const [id, grp] of Object.entries(p.toggles)) {
    const on = id === 'elt' ? s.elt : s.sw[id];
    const target = id === 'elt' ? (on === 'ON' ? -0.5 : on === 'TEST' ? 0.5 : 0) : on ? -0.5 : 0.5;
    ease(grp.rotation, 'x', target, dt, 20);
  }
  // Breakers: popped ones stand out by 6 mm and show the white band
  for (const [id, grp] of Object.entries(p.breakers)) ease(grp.position, 'z', PZ + (s.breakers[id] ? -0.0055 : 0.0005), dt, 18);
  p.startBtn.position.z = PZ + (s.startPressed ? -0.003 : 0);
  // Knobs
  p.knobs.dimAvionics.rotation.z = -(s.dimAvionics - 0.5) * 4.5;
  p.knobs.dimPanel.rotation.z = -(s.dimPanel - 0.5) * 4.5;
  // Alternate air: up CLOSE, down OPEN
  { const v = s.altAir === 'OPEN' ? 736 : 648; const target = P(1053, v, 0); p.altAir.position.x = target.x; ease(p.altAir.position, 'y', target.y, dt); p.altAir.position.z = PZ; }
  ['heat', 'defrost'].forEach(id => { const { grp, v } = p[id]; const u = 1398 + s[id] * 71; const pt = P(u, v + 2, 0); grp.position.set(pt.x, pt.y, PZ); });
  // Quadrant levers: aft is idle / cut-off
  // (positive rotation tips the knob aft toward the pilot)
  p.throttle.rotation.x = lerp(0.55, -0.12, s.throttle);
  p.mixture.rotation.x = lerp(0.55, -0.12, s.mixture);
  p.friction.rotation.x = -0.3 + s.friction * 0.6;
  p.rudderTrim.rotation.x = s.rudderTrim * 2.6;
  ease(p.parkBrake.rotation, 'x', s.parkBrake ? 0.32 : 0, dt);
  ease(p.altStatic.position, 'z', PZ + (s.altStatic ? 0.025 : 0), dt);
  // Fuel selector: L up, R toward the front (pilot's right when looking at it), OFF aft
  ease(p.fuelSel.rotation, 'z', s.fuelSel === 'L' ? 0 : s.fuelSel === 'R' ? -Math.PI / 2 : Math.PI / 2, dt, 10);
  // Flap handle angles for 0, 10, 25, 40
  const fa = { 0: 0.0, 10: 0.22, 25: 0.46, 40: 0.7 }[s.flaps] ?? 0;
  ease(p.flaps.rotation, 'x', fa, dt, 10);
  p.pitchTrim.rotation.x = -s.pitchTrim * 6;
  p.trimInd.position.z = 2.12 - s.pitchTrim * 0.03;
  // Yokes: pull aft for nose up, turn for roll
  p.yokes.forEach(y => { y.g.position.z = y.base.z + s.yokePitch * 0.075 - (s.controlLock ? 0.04 : 0); y.g.rotation.z = -s.yokeRoll * 0.75; });
  p.pedals.forEach(pd => (pd.piv.rotation.x = (pd.right ? -s.rudder : s.rudder) * 0.22 + (pd.right ? -1 : 1) * s.rudderTrim * 0.02));
  // Lighting
  const panelLit = powered('cb_paneldim');
  p.led.emissiveIntensity = panelLit ? s.dimPanel * 0.7 : 0;
  p.mapLight.intensity = s.sw.mapLight && panelLit ? 1.5 + s.dimPanel * 3 : 0;
  p.gmcFace.material.emissiveIntensity = powered('cb_autopilot') ? 0.35 * s.dimAvionics : 0;
  p.eltLed.emissiveIntensity = s.elt === 'ON' || (s.elt === 'TEST' && (t % 1) < 0.5) ? 3 : 0;
  // Screens at ~12 frames per second
  if (t - cpt.lastDraw > 0.08) {
    cpt.lastDraw = t; p.displays.draw(s);
    p.pfdTex.needsUpdate = p.g5Tex.needsUpdate = p.gnxTex.needsUpdate = p.gncTex.needsUpdate = true;
  }
}
