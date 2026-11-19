// Exterior of the PA-28-181 Piper Pilot, built to the POH three-view (Figure 1-1):
// span 35'6", length 24', height 7'3.5", stabilator span 12'10.5", track 10', wheelbase 6'6.9",
// semi-tapered wing 5'3" root chord to 3'6.2" tip chord, 7° dihedral.
import * as THREE from 'three';
import { loft, sampler, polySDF, smooth, lerp, airfoilSurface, rbox, tube, tireGeometry, hingeGroup, intoHinge, clamp } from './geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;

export const M = {};
function materials() {
  if (M.paint) return M;
  M.paint = fuselageMaterial(false);
  M.glassCut = fuselageMaterial(true);
  M.white = new THREE.MeshPhysicalMaterial({ color: 0xeeeeea, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.12 });
  M.alu = new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.85, roughness: 0.35 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.2 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.8 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.92 });
  M.blade = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.55, metalness: 0.4 });
  M.tip = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 });
  M.red = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 });
  M.ribbon = new THREE.MeshStandardMaterial({ color: 0xd11b1b, roughness: 0.7, side: THREE.DoubleSide });
  M.yellow = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.6 });
  M.rope = new THREE.MeshStandardMaterial({ color: 0xd9cfa8, roughness: 0.9 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
  M.walk = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.95 });
  M.fuel = new THREE.MeshStandardMaterial({ color: 0x4f8fe6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
  const lens = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.9 });
  M.navRed = lens(0xff2a1a); M.navGreen = lens(0x18e05a); M.navWhite = lens(0xffffff); M.strobe = lens(0xffffff); M.landing = lens(0xfff4dc);
  return M;
}

// ---------------- Fuselage ----------------
// [s, top, bottom, half-width, superellipse exponent]
const FUSE = sampler([
  [0.255, 1.30, 1.10, 0.20, 2.0],
  [0.30, 1.40, 0.99, 0.38, 2.2],
  [0.45, 1.46, 0.89, 0.46, 2.4],
  [0.75, 1.49, 0.80, 0.51, 2.6],
  [1.10, 1.51, 0.73, 0.55, 2.8],
  [1.42, 1.52, 0.66, 0.58, 2.9],
  [1.70, 1.67, 0.62, 0.61, 3.0],
  [2.05, 1.80, 0.60, 0.62, 3.1],
  [2.60, 1.83, 0.59, 0.625, 3.1],
  [3.20, 1.80, 0.60, 0.61, 3.0],
  [3.60, 1.71, 0.63, 0.57, 2.9],
  [4.30, 1.55, 0.74, 0.46, 2.7],
  [5.20, 1.41, 0.88, 0.31, 2.5],
  [6.20, 1.32, 1.00, 0.17, 2.3],
  [7.05, 1.27, 1.10, 0.07, 2.2],
  [7.20, 1.24, 1.15, 0.025, 2.0],
]);
export function fuseSection(s) { const [top, bot, hw, n] = FUSE(s); return { top, bot, hw, n }; }
// point on the fuselage surface at station s, lateral x, on the top (+1) or bottom (-1)
export function fuseY(s, x, side = 1) {
  const { top, bot, hw, n } = fuseSection(s);
  const mid = (top + bot) / 2, h = side > 0 ? top - mid : mid - bot;
  const k = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x) / hw), n)), 1 / n);
  return mid + side * h * k;
}
// point on the side of the fuselage at height y
export function fuseX(s, y, sign = 1) {
  const { top, bot, hw, n } = fuseSection(s);
  const mid = (top + bot) / 2, h = y > mid ? top - mid : mid - bot;
  const k = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(y - mid) / h), n)), 1 / n);
  return sign * hw * k;
}

// Windows: rounded quads in (station, height) space, on the sides of the cabin only.
const R = 0.045; // corner radius
const FRONT_WIN = [[2.10, 1.235], [2.80, 1.235], [2.80, 1.665], [2.12, 1.695]];
const REAR_WIN = [[2.88, 1.255], [3.47, 1.30], [3.43, 1.545], [2.88, 1.665]];
// Same shape in JS, used for picking through the glass
export function windowSDF(s, x, y) {
  const hw = fuseSection(s).hw;
  const yLow = 1.315 + 0.195 * Math.pow(1 - Math.min(1, Math.abs(x) / hw), 1.6);
  const ws = Math.max(1.445 - s, s - 2.015, yLow - y);
  const sideOK = 0.72 * hw - Math.abs(x);
  const fw = Math.max(polySDF(s, y, FRONT_WIN) + R, sideOK);
  const rw = Math.max(polySDF(s, y, REAR_WIN) + R, sideOK);
  return Math.min(ws, fw, rw);
}
const v2 = ([a, b]) => `vec2(${a.toFixed(3)}, ${b.toFixed(3)})`;
const GLSL_WIN = `
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float cr2(vec2 a, vec2 b){ return a.x * b.y - a.y * b.x; }
float poly4(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d){
  float dd = min(min(sdSeg(p, a, b), sdSeg(p, b, c)), min(sdSeg(p, c, d), sdSeg(p, d, a)));
  bool ins = cr2(b - a, p - a) >= 0.0 && cr2(c - b, p - b) >= 0.0 && cr2(d - c, p - c) >= 0.0 && cr2(a - d, p - d) >= 0.0;
  return ins ? -dd : dd;
}
float winSDF(vec3 q, float hw){
  float s = q.z, x = q.x, y = q.y;
  float yLow = 1.315 + 0.195 * pow(1.0 - min(1.0, abs(x) / hw), 1.6);
  float ws = max(max(1.445 - s, s - 2.015), yLow - y);
  float sideOK = 0.72 * hw - abs(x);
  float fw = max(poly4(vec2(s, y), ${FRONT_WIN.map(v2).join(', ')}) + ${R.toFixed(3)}, sideOK);
  float rw = max(poly4(vec2(s, y), ${REAR_WIN.map(v2).join(', ')}) + ${R.toFixed(3)}, sideOK);
  return min(ws, min(fw, rw));
}
float band(float y, float a, float b){ float w = max(fwidth(y), 0.0015); return smoothstep(a - w, a + w, y) - smoothstep(b - w, b + w, y); }
`;
function fuselageMaterial(glass) {
  const m = glass
    ? new THREE.MeshPhysicalMaterial({ color: 0x9fb4c4, roughness: 0.04, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8 })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.18, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHW; attribute float aBot; varying vec3 vLoc; varying float vHW; varying float vBot;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vHW = aHW; vBot = aBot;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying float vHW; varying float vBot;' + GLSL_WIN)
      .replace('#include <color_fragment>', glass
        ? '#include <color_fragment>\n if (winSDF(vLoc, vHW) >= 0.0) discard;'
        : `#include <color_fragment>
  float sd = winSDF(vLoc, vHW);
  if (sd < 0.0) discard;
  float s = vLoc.z, y = vLoc.y;
  vec3 col = vec3(0.93, 0.93, 0.915);
  float sweep = smoothstep(3.7, 6.9, s);
  float base = 0.915 + sweep * 0.24 - smoothstep(0.25, 1.2, s) * 0.02;
  float on = step(0.42, s) * (1.0 - step(7.12, s));
  if (y < vBot + 0.06 && s > 1.2 && s < 4.6) col = vec3(0.80, 0.81, 0.82);
  col = mix(col, vec3(0.07, 0.15, 0.33), band(y, base, base + 0.075) * on);
  col = mix(col, vec3(0.66, 0.09, 0.11), band(y, base + 0.095, base + 0.115) * on);
  col = mix(col, vec3(0.08, 0.08, 0.09), 1.0 - smoothstep(0.012, 0.016, sd));
  diffuseColor.rgb = gl_FrontFacing ? col : vec3(0.62, 0.58, 0.51);`);
  };
  return m;
}

function buildFuselage(g) {
  const geo = loft({ s0: 0.255, s1: 7.2, nS: 220, nA: 120, section: fuseSection });
  const fus = new THREE.Mesh(geo, M.paint); fus.castShadow = true; fus.receiveShadow = true; fus.name = 'fuselage'; fus.userData.windowed = 'body'; fus.userData.hot = 'fuselage';
  // invisible markers so the camera can frame whole regions
  const mark = (id, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.position.set(x, y, z); m.visible = false; m.userData.hot = id; g.add(m); };
  mark('cowl', 1.0, 0.75, 1.1, 0, 1.12, 0.8); mark('empennage', 3.9, 1.1, 1.6, 0, 1.55, 6.6);
  // the shadow pass must also see the window holes
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  dm.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHW; varying vec3 vLoc; varying float vHW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vHW = aHW;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying float vHW;' + GLSL_WIN).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (winSDF(vLoc, vHW) < 0.0) discard;');
  };
  fus.customDepthMaterial = dm;
  const gl = new THREE.Mesh(geo, M.glassCut); gl.renderOrder = 5; gl.userData.hot = 'windshield'; gl.userData.windowed = 'glass';
  g.add(fus, gl);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.white); cap.position.set(0, 1.195, 7.2); g.add(cap);
  return fus;
}

// ---------------- Wing ----------------
const DIH = 7 * D2R, INC = 2 * D2R;
const WING_ROOT_Y = 0.70; // chord line height at the root (x = 0.45)
export function wingSec(x) {
  // x is distance from centreline (positive). Inner panel constant chord to 2.65 m, then taper.
  const ax = Math.abs(x);
  const taper = clamp((ax - 2.65) / (5.30 - 2.65), 0, 1);
  let chord = lerp(1.60, 1.07, taper);
  let leZ = 2.08 + 0.265 * taper;
  const twist = -2 * D2R * taper;
  let thick = 1;
  if (ax > 5.30) { // rounded tip
    const k = clamp((ax - 5.30) / 0.11, 0, 1);
    thick = Math.sqrt(1 - k * k * 0.92); chord = 1.07 - 0.22 * k * k; leZ = 2.345 + 0.06 * k * k;
  }
  const y = WING_ROOT_Y + (ax - 0.45) * Math.tan(DIH);
  const a = INC + twist;
  const chordDir = V(0, -Math.sin(a), Math.cos(a));
  const up = V(-Math.sign(x || 1) * Math.sin(DIH), Math.cos(DIH), 0).applyAxisAngle(V(1, 0, 0), -a).normalize();
  return { le: V(x, y, leZ), chordDir, up, chord, thickScale: thick };
}
// surface point on the wing at span x, chord fraction c, upper (+1) or lower (-1)
export function wingPt(x, c, side = 1) {
  const s = wingSec(x), t = 0.15, m = 0.02, p = 0.4;
  const yt = 5 * t * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4) * s.thickScale;
  const yc = c < p ? (m / (p * p)) * (2 * p * c - c * c) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * c - c * c);
  return s.le.clone().addScaledVector(s.chordDir, c * s.chord).addScaledVector(s.up, (yc + side * yt) * s.chord);
}
function wingPiece(x0, x1, n, opt) {
  const secs = [];
  for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); secs.push({ ...wingSec(x), c0: opt.c0, c1: opt.c1 }); }
  return airfoilSurface(secs, { t: 0.15, m: 0.02, n: 30, ...opt });
}

function buildWing(g, sign, parts) {
  const S = sign; // +1 right, -1 left
  const piece = (a, b, n, opt) => wingPiece(S * a, S * b, n, opt);
  const add = (geo, mat = M.white) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.userData.hot = S > 0 ? 'wingR' : 'wingL'; g.add(m); return m; };
  const HINGE = 0.76;
  add(piece(0.30, 0.62, 2, { c0: 0, c1: 1 }));
  add(piece(0.62, 2.95, 10, { c0: 0, c1: HINGE }));
  add(piece(2.95, 3.05, 1, { c0: 0, c1: 1 }));
  add(piece(3.05, 5.15, 10, { c0: 0, c1: HINGE }));
  add(piece(5.15, 5.30, 2, { c0: 0, c1: 1 }));
  const tip = add(piece(5.30, 5.41, 5, { c0: 0, c1: 1 }));
  tip.userData.hot = S > 0 ? 'navR' : 'navL';
  // Flap: hinge near the lower surface at 77% chord
  const fA = wingPt(S * 0.62, 0.775, -1), fB = wingPt(S * 2.95, 0.775, -1);
  const flap = hingeGroup(fA, fB); g.add(flap);
  const fm = new THREE.Mesh(intoHinge(piece(0.625, 2.945, 8, { c0: 0.772, c1: 1 }), flap), M.white); fm.castShadow = true;
  fm.userData.hot = S > 0 ? 'flapR' : 'flapL'; flap.add(fm);
  // Aileron: hinge on the mid-line at 76%
  const aA = wingPt(S * 3.05, 0.765, 1).lerp(wingPt(S * 3.05, 0.765, -1), 0.5), aB = wingPt(S * 5.15, 0.765, 1).lerp(wingPt(S * 5.15, 0.765, -1), 0.5);
  const ail = hingeGroup(aA, aB); g.add(ail);
  const am = new THREE.Mesh(intoHinge(piece(3.055, 5.145, 8, { c0: 0.768, c1: 1 }), ail), M.white); am.castShadow = true;
  am.userData.hot = S > 0 ? 'aileronR' : 'aileronL'; ail.add(am);
  // static wicks on the aileron trailing edge
  [4.35, 5.0].forEach(x => {
    const p = wingPt(S * x, 1, 1); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 5), M.black);
    w.rotation.x = Math.PI / 2; w.position.copy(p).add(V(0, 0, 0.05)).sub(ail.position); w.userData.hot = S > 0 ? 'wicksR' : 'wicksL'; ail.add(w);
  });
  parts[S > 0 ? 'flapR' : 'flapL'] = flap; parts[S > 0 ? 'aileronR' : 'aileronL'] = ail;

  // Fuel tank seam (a fine line along the outboard end of the tank) and filler cap
  const capP = wingPt(S * 2.25, 0.13, 1), nrm = wingSec(S * 2.25).up;
  const capG = new THREE.Group(); capG.position.copy(capP); capG.quaternion.setFromUnitVectors(V(0, 1, 0), nrm); g.add(capG);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.008, 28), M.chrome); capG.add(ring);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 20, 1, true), M.dark); neck.position.y = -0.03; capG.add(neck);
  const capLid = new THREE.Group(); capLid.position.set(0, 0.006, -0.045); capG.add(capLid);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.012, 28), M.chrome); lid.position.set(0, 0.004, 0.045); capLid.add(lid);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.007, 0.016), M.alu); tab.position.set(0, 0.012, 0.045); capLid.add(tab);
  [ring, lid, tab].forEach(m => (m.userData.hot = S > 0 ? 'fuelCapR' : 'fuelCapL'));
  // fuel seen through the open neck, with the 17-gallon indicator tab
  const fuelSurf = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), M.fuel); fuelSurf.rotation.x = -Math.PI / 2; fuelSurf.position.y = -0.05; capG.add(fuelSurf);
  const ind = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.02), M.alu); ind.position.set(0, -0.045, -0.025); capG.add(ind);
  parts[S > 0 ? 'capR' : 'capL'] = { lid: capLid, fuel: fuelSurf };
  for (let i = 0; i < 12; i++) { // tank seam rivet line at the outboard end
    const p = wingPt(S * 2.62, 0.02 + i * 0.022, 1); const r = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), M.alu); r.position.copy(p); g.add(r);
  }
  // Sump drain at the inboard, lowest corner of the tank
  const sump = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 12), M.chrome);
  sump.position.copy(wingPt(S * 0.78, 0.16, -1)).add(V(0, -0.015, 0)); sump.userData.hot = S > 0 ? 'sumpR' : 'sumpL'; g.add(sump);
  // Fuel tank vent tube under the wing
  const vb = wingPt(S * 2.4, 0.18, -1);
  const vent = new THREE.Mesh(tube([vb, vb.clone().add(V(0, -0.05, 0)), vb.clone().add(V(0, -0.06, -0.04))], 0.006, 10, 6), M.alu);
  vent.userData.hot = S > 0 ? 'ventR' : 'ventL'; g.add(vent);
  // Fresh air inlet in the inboard leading edge
  const inlet = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 10), M.black);
  inlet.rotation.z = Math.PI / 2; inlet.scale.set(1, 1, 0.5); inlet.position.copy(wingPt(S * 0.72, 0.004, 1)).add(V(0, -0.02, -0.004));
  inlet.userData.hot = S > 0 ? 'airInletR' : 'airInletL'; g.add(inlet);
  // Wing tip lights: nav (red left / green right) and strobe
  const lp = wingPt(S * 5.36, 0.06, 1).lerp(wingPt(S * 5.36, 0.06, -1), 0.5);
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10, 0, Math.PI), S > 0 ? M.navGreen : M.navRed);
  nav.position.copy(lp); nav.rotation.y = S > 0 ? Math.PI / 2 : -Math.PI / 2; nav.userData.hot = S > 0 ? 'navR' : 'navL'; g.add(nav);
  const st = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), M.strobe); st.position.copy(lp).add(V(S * 0.02, 0, 0.07)); g.add(st);
  const navL = new THREE.PointLight(S > 0 ? 0x22ff66 : 0xff2a1a, 0, 3); navL.position.copy(lp).add(V(S * 0.08, 0, 0)); g.add(navL);
  const stL = new THREE.PointLight(0xffffff, 0, 8); stL.position.copy(lp).add(V(S * 0.1, 0.05, 0.07)); g.add(stL);
  parts[S > 0 ? 'navRightLight' : 'navLeftLight'] = navL; parts[S > 0 ? 'strobeR' : 'strobeL'] = stL;
  // Tie-down ring
  const td = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), M.chrome);
  td.position.copy(wingPt(S * 3.9, 0.45, -1)).add(V(0, -0.035, 0)); td.rotation.y = Math.PI / 2; g.add(td);
  parts[S > 0 ? 'tdRingR' : 'tdRingL'] = td.position.clone();

  if (S < 0) {
    // Pitot/static head under the left wing
    const pb = wingPt(-3.6, 0.22, -1);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.07), M.alu); mast.position.copy(pb).add(V(0, -0.06, 0.01));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.2, 14), M.alu); head.rotation.x = Math.PI / 2; head.position.copy(pb).add(V(0, -0.115, -0.07));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.005, 10), M.black); hole.position.copy(head.position).add(V(0, 0, -0.1005)); hole.rotation.y = Math.PI;
    [mast, head].forEach(m => (m.userData.hot = 'pitotTube')); g.add(mast, head, hole);
    parts.pitotHead = head.position.clone();
    // Pitot cover with REMOVE BEFORE FLIGHT streamer
    const cover = new THREE.Group(); cover.position.copy(head.position);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 14), M.red); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = -0.03;
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.42, 1, 8), M.ribbon); ribbon.position.set(0, -0.22, -0.08);
    [sleeve, ribbon].forEach(m => (m.userData.hot = 'pitotCover')); cover.add(sleeve, ribbon); g.add(cover);
    parts.pitotCover = cover; parts.ribbon = ribbon;
    // Stall warning lift detector on the left leading edge
    const sv = new THREE.Group(); sv.position.copy(wingPt(-3.05, 0.002, 1)).add(V(0, -0.01, -0.005)); g.add(sv);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.035), M.alu); plate.position.z = -0.012; plate.rotation.x = 0.3;
    plate.userData.hot = 'stallVane'; sv.add(plate); parts.stallVane = plate;
    // OAT probe
    const oat = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.07, 8), M.alu);
    oat.position.copy(wingPt(-1.15, 0.45, -1)).add(V(0, -0.035, 0)); oat.userData.hot = 'oat'; g.add(oat);
  } else {
    // Non-skid walkway on the right wing root (the boarding side)
    const pts = [];
    const walk = new THREE.Group(); g.add(walk);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
      const x = 0.66 + i * 0.07, c = 0.35 + j * 0.055;
      pts.push(wingPt(x, c, 1).addScaledVector(wingSec(x).up, 0.002));
    }
    const geo = new THREE.BufferGeometry(); const P = [], I = [];
    pts.forEach(p => P.push(p.x, p.y, p.z));
    for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) { const a = i * 8 + j, b = a + 8; I.push(a, a + 1, b, b, a + 1, b + 1); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals();
    const wm = new THREE.Mesh(geo, M.walk); wm.material.side = THREE.DoubleSide; wm.receiveShadow = true; walk.add(wm);
  }
}

// ---------------- Tail ----------------
function buildTail(g, parts) {
  // Stabilator: all-moving slab, pivot at 25% chord. LE s = 6.50, chord 0.76, at y = 1.11
  const stabY = 1.11, LE = 6.50, C = 0.76, half = 1.96;
  const piv = V(0, stabY, LE + C * 0.25);
  const stab = new THREE.Group(); stab.position.copy(piv); g.add(stab); parts.stab = stab;
  const sec = x => {
    const k = Math.abs(x) > half - 0.08 ? clamp((Math.abs(x) - (half - 0.08)) / 0.08, 0, 1) : 0;
    return { le: V(x, stabY, LE + 0.02 * k * k).sub(piv), chordDir: V(0, 0, 1), up: V(0, 1, 0), chord: C - 0.08 * k * k, thickScale: Math.sqrt(1 - 0.9 * k * k), t: 0.12, m: 0 };
  };
  const span = (a, b, n, c0, c1) => { const ss = []; for (let i = 0; i <= n; i++) ss.push({ ...sec(lerp(a, b, i / n)), c0, c1 }); return airfoilSurface(ss, { t: 0.12, m: 0, n: 22 }); };
  [[-half, -1.15], [-1.15, -0.1], [-0.1, 0.1], [0.1, 1.15], [1.15, half]].forEach(([a, b], i) => {
    const full = i === 0 || i === 2 || i === 4;
    const m = new THREE.Mesh(span(a, b, i % 2 === 0 ? 4 : 6, 0, full ? 1 : 0.86), M.white); m.castShadow = true; m.userData.hot = 'stabilator'; stab.add(m);
  });
  // Trim tab on the trailing edge (one per side, moved together)
  const tabs = [];
  [[-1.15, -0.1], [0.1, 1.15]].forEach(([a, b]) => {
    const hp = V(0, 0, LE + C * 0.86 - piv.z);
    const tg = new THREE.Group(); tg.position.copy(hp); stab.add(tg);
    const geo = span(a + 0.005, b - 0.005, 5, 0.862, 1); geo.translate(0, 0, -hp.z);
    const tm = new THREE.Mesh(geo, M.white); tm.userData.hot = 'stabilator'; tg.add(tm); tabs.push(tg);
  });
  parts.tabs = tabs;
  [-1.9, 1.9].forEach(x => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), M.black); w.rotation.x = Math.PI / 2; w.position.set(x, 0, C * 0.75 + 0.04); w.userData.hot = 'wicksTail'; stab.add(w); });

  // Fin and rudder. Root at y 1.27, tip at 2.20; hinge line s 6.95 → 6.985
  const fin = (y, which) => {
    const k = (y - 1.27) / (2.20 - 1.27);
    const le = lerp(5.92, 6.62, k), te = lerp(7.30, 7.27, k), hinge = lerp(6.95, 6.985, k);
    const chord = te - le, ch = (hinge - le) / chord;
    const capK = y > 2.12 ? clamp((y - 2.12) / 0.08, 0, 1) : 0;
    return { le: V(0, y, le), chordDir: V(0, 0, 1), up: V(1, 0, 0), chord, thickScale: Math.sqrt(1 - 0.85 * capK * capK), t: 0.11, m: 0, c0: which === 'r' ? ch + 0.004 : 0, c1: which === 'r' ? 1 : ch };
  };
  const finSecs = [], rudSecs = [];
  for (let i = 0; i <= 12; i++) { const y = lerp(1.22, 2.20, i / 12); finSecs.push(fin(y, 'f')); }
  for (let i = 0; i <= 10; i++) { const y = lerp(1.24, 2.18, i / 10); rudSecs.push(fin(y, 'r')); }
  const finM = new THREE.Mesh(airfoilSurface(finSecs, { n: 22 }), M.white); finM.castShadow = true; g.add(finM);
  const hA = V(0, 1.24, 6.951), hB = V(0, 2.18, 6.985);
  const rud = hingeGroup(hA, hB); g.add(rud); parts.rudder = rud;
  const rm = new THREE.Mesh(intoHinge(airfoilSurface(rudSecs, { n: 22 }), rud), M.white); rm.castShadow = true; rm.userData.hot = 'rudder'; rud.add(rm);
  const rw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), M.black); rw.rotation.x = Math.PI / 2; rw.position.set(0, 1.85, 7.33).sub(rud.position); rw.userData.hot = 'wicksTail'; rud.add(rw);
  // fin stripe (navy band near the top) as a thin overlay on each side
  // Dorsal fillet and ventral fin
  const dors = new THREE.Shape(); dors.moveTo(5.25, 1.36); dors.lineTo(6.05, 1.36); dors.lineTo(6.05, 1.47); dors.quadraticCurveTo(5.7, 1.40, 5.25, 1.36);
  const dg = new THREE.ExtrudeGeometry(dors, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  dg.rotateY(-Math.PI / 2); dg.translate(0.025, 0, 0);
  const dm = new THREE.Mesh(dg, M.white); dm.castShadow = true; g.add(dm);
  const ven = new THREE.Shape(); ven.moveTo(6.15, 1.03); ven.lineTo(6.95, 1.10); ven.lineTo(6.9, 0.97); ven.quadraticCurveTo(6.5, 0.98, 6.15, 1.03);
  const vg = new THREE.ExtrudeGeometry(ven, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
  vg.rotateY(-Math.PI / 2); vg.translate(0.01, 0, 0); g.add(new THREE.Mesh(vg, M.white));
  // tail position light and tail tie-down
  const tl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), M.navWhite); tl.position.set(0, 1.20, 7.225); g.add(tl);
  const tlL = new THREE.PointLight(0xffffff, 0, 2.5); tlL.position.set(0, 1.2, 7.35); g.add(tlL); parts.tailLight = tlL;
  const td = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), M.chrome); td.position.set(0, 0.96, 6.85); td.rotation.y = Math.PI / 2; g.add(td);
  parts.tdRingT = td.position.clone();
  // VOR antenna on the fin
  [-1, 1].forEach(sx => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.55, 6), M.black); a.position.set(sx * 0.2, 1.9, 6.6); a.rotation.z = sx * 1.25; a.userData.hot = 'antennas'; g.add(a); });
}

// ---------------- Nose, cowl and prop ----------------
function buildNose(g, parts) {
  // Spinner: ogive from s 0.02 to 0.30, radius 0.165, centre height 1.20
  const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(0.165 * Math.sqrt(Math.sin(t * Math.PI / 2)), t * 0.28)); }
  const sp = new THREE.LatheGeometry(prof, 40); sp.rotateX(Math.PI / 2); sp.translate(0, 0, 0.02); // tip at s 0.02, base at s 0.30
  const propG = new THREE.Group(); propG.position.set(0, 1.20, 0); g.add(propG); parts.prop = propG;
  const spin = new THREE.Mesh(sp, M.chrome); spin.userData.hot = 'prop'; spin.castShadow = true; propG.add(spin);
  // Blades: 76" diameter, twist ~38° root to ~14° tip
  for (const b of [0, Math.PI]) {
    const secs = [], tipSecs = [];
    for (let i = 0; i <= 12; i++) {
      const r = lerp(0.14, 0.965, i / 12), k = (r - 0.14) / 0.825;
      const pitch = lerp(38, 14, k) * D2R, chord = lerp(0.15, 0.11, k) * (k > 0.9 ? 1 - (k - 0.9) * 3 : 1);
      const dir = V(Math.cos(pitch), 0, Math.sin(pitch)), up = V(-Math.sin(pitch), 0, Math.cos(pitch)).multiplyScalar(-1);
      const s = { le: V(-chord * 0.35 * Math.cos(pitch), r, 0.12 - chord * 0.35 * Math.sin(pitch)), chordDir: dir, up, chord, t: lerp(0.22, 0.08, k), m: 0.03 };
      (r > 0.885 ? tipSecs : secs).push(s);
      if (Math.abs(r - 0.885) < 0.07 && r <= 0.885) { /* overlap */ }
    }
    tipSecs.unshift(secs.at(-1));
    const bladeG = new THREE.Group(); bladeG.rotation.z = b; propG.add(bladeG);
    const bm = new THREE.Mesh(airfoilSurface(secs, { n: 14 }), M.blade); bm.castShadow = true; bm.userData.hot = 'prop';
    const tm = new THREE.Mesh(airfoilSurface(tipSecs, { n: 14 }), M.tip); tm.userData.hot = 'prop';
    bladeG.add(bm, tm);
  }
  // Prop disc shown while turning
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.965, 48), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.set(0, 1.20, 0.125); g.add(disc); parts.propDisc = disc;
  // Cowl front inlets either side of the spinner, set on the actual cowl surface
  const onFront = (x, y) => { let s = 0.255; while (s < 0.6) { const { top, bot, hw, n } = fuseSection(s); const mid = (top + bot) / 2, h = y > mid ? top - mid : mid - bot; if (Math.pow(Math.abs(x) / hw, n) + Math.pow(Math.abs(y - mid) / h, n) < 1) break; s += 0.002; } return s; };
  [-1, 1].forEach(sx => {
    const x = sx * 0.235, y = 1.12, s = onFront(x, y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 10, 32), M.white);
    const inl = new THREE.Mesh(new THREE.CircleGeometry(0.07, 28), M.black);
    [ring, inl].forEach(m => { m.position.set(x, y, s + 0.004); m.rotation.y = Math.PI - sx * 0.6; m.scale.set(1, 0.9, 1); m.userData.hot = 'cowlInlets'; g.add(m); });
  });
  // Landing light lens below the spinner
  const ll = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), M.landing); ll.position.set(0, 1.0, onFront(0, 1.0) + 0.003); ll.rotation.y = Math.PI; ll.rotation.x = -0.6; ll.userData.hot = 'landingLens'; g.add(ll);
  const spot = new THREE.SpotLight(0xfff2d8, 0, 40, 0.35, 0.5, 1.2); spot.position.set(0, 0.99, 0.30); spot.target.position.set(0, 0.2, -14); g.add(spot, spot.target); parts.landingLight = spot;
  parts.landingLens = ll;
  // Oil filler door on the top right of the cowl
  const oilG = new THREE.Group(); const os = 0.70, ox = 0.20; oilG.position.set(ox, fuseY(os, ox, 1) + 0.004, os - 0.11); g.add(oilG);
  oilG.rotation.z = -0.32;
  const doorM = new THREE.Mesh(rbox(0.16, 0.012, 0.22, 0.01), M.white); doorM.position.set(0, 0, 0.11); doorM.userData.hot = 'oilDoor'; oilG.add(doorM);
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.015), M.chrome); latch.position.set(0, 0.008, 0.2); latch.userData.hot = 'oilDoor'; oilG.add(latch);
  parts.oilDoor = oilG;
  const dip = new THREE.Group(); dip.position.set(ox, fuseY(os, ox, 1) - 0.07, os); g.add(dip); dip.rotation.z = -0.32;
  const dipCap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 12), M.yellow); dipCap.userData.hot = 'oilDoor'; dipCap.userData.part = 'dipstick'; dip.add(dipCap);
  const dipRod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.32, 6), M.chrome); dipRod.position.y = -0.17; dip.add(dipRod);
  parts.dipstick = dip;
  // Fuel strainer drain, lower left nose
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), M.chrome); str.position.set(-0.24, fuseY(1.0, -0.24, -1) - 0.02, 1.0); str.userData.hot = 'strainer'; g.add(str);
  // Exhaust tailpipe lower right
  const ex = new THREE.Mesh(tube([V(0.25, 0.80, 0.95), V(0.30, 0.72, 1.05), V(0.32, 0.66, 1.18)], 0.028, 12, 12), new THREE.MeshStandardMaterial({ color: 0x6b5d50, metalness: 0.8, roughness: 0.45 }));
  g.add(ex);
}

// ---------------- Landing gear ----------------
function wheel(g, pos, hot) {
  const w = new THREE.Group(); w.position.copy(pos); g.add(w);
  const tire = new THREE.Mesh(tireGeometry(0.43, 0.16), M.rubber); tire.castShadow = true; tire.userData.hot = hot; w.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.13, 20), M.alu); hub.rotation.z = Math.PI / 2; hub.userData.hot = hot; w.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.15, 14), M.chrome); cap.rotation.z = Math.PI / 2; w.add(cap);
  return w;
}
function buildGear(g, parts) {
  // Mains: track 10 ft (±1.524 m), axle at s 2.92. Strut extension 4.5 in.
  [-1, 1].forEach(S => {
    const x = S * 1.524, hot = S > 0 ? 'mainGearR' : 'mainGearL';
    const top = wingPt(x, 0.5, -1);
    const axle = V(x, 0.215, 2.92);
    const chromeTop = 0.215 + 0.08 + 0.114;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, top.y - chromeTop, 16), M.white);
    sleeve.position.set(x, (top.y + chromeTop) / 2, 2.86); sleeve.castShadow = true; sleeve.userData.hot = hot; g.add(sleeve);
    const oleo = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.114, 16), M.chrome); oleo.position.set(x, chromeTop - 0.057, 2.86); oleo.userData.hot = hot; g.add(oleo);
    const fork = new THREE.Mesh(rbox(0.07, 0.10, 0.12, 0.02), M.white); fork.position.set(x - S * 0.09, 0.27, 2.89); fork.userData.hot = hot; g.add(fork);
    // torque links
    const tl = new THREE.Mesh(tube([V(x, chromeTop + 0.04, 2.92), V(x, chromeTop - 0.06, 2.99), V(x, 0.31, 2.93)], 0.008, 8, 6), M.white); g.add(tl);
    wheel(g, axle, hot);
    // brake disc and caliper on the inboard side
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.008, 28), M.alu); disc.rotation.z = Math.PI / 2; disc.position.set(x - S * 0.075, 0.215, 2.92); disc.userData.hot = hot; g.add(disc);
    const cal = new THREE.Mesh(rbox(0.03, 0.06, 0.05, 0.008), M.dark); cal.position.set(x - S * 0.075, 0.27, 2.985); cal.userData.hot = hot; g.add(cal);
    const line = new THREE.Mesh(tube([V(x - S * 0.06, 0.29, 2.99), V(x - S * 0.06, 0.45, 2.92), V(x - S * 0.05, top.y - 0.02, 2.88)], 0.004, 12, 5), M.black); g.add(line);
    parts[S > 0 ? 'wheelR' : 'wheelL'] = axle;
  });
  // Nose gear: wheelbase 6'6.91" ahead of the mains, extension 3.25 in
  const axle = V(0, 0.215, 2.92 - 2.03);
  const topY = fuseY(0.82, 0, -1) + 0.02, chromeTop = 0.215 + 0.12 + 0.083;
  const nsl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, topY - chromeTop, 16), M.white); nsl.position.set(0, (topY + chromeTop) / 2, 0.86); nsl.userData.hot = 'noseGear'; nsl.castShadow = true; g.add(nsl);
  const nol = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.083, 16), M.chrome); nol.position.set(0, chromeTop - 0.0415, 0.86); nol.userData.hot = 'noseGear'; g.add(nol);
  [-1, 1].forEach(sx => { const f = new THREE.Mesh(rbox(0.02, 0.16, 0.06, 0.008), M.white); f.position.set(sx * 0.095, 0.29, axle.z); f.userData.hot = 'noseGear'; g.add(f); });
  const yoke = new THREE.Mesh(rbox(0.21, 0.025, 0.07, 0.008), M.white); yoke.position.set(0, 0.37, axle.z); g.add(yoke);
  const damp = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 10), M.dark); damp.rotation.z = Math.PI / 2; damp.position.set(0.09, 0.47, 0.90); damp.rotation.y = 0.5; damp.userData.hot = 'noseGear'; g.add(damp);
  wheel(g, axle, 'noseGear');
  parts.wheelN = axle;
}

// ---------------- Antennas, door and small parts ----------------
function buildDetails(g, parts) {
  const blade = (s, x, up, h = 0.2) => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.14, 0); sh.lineTo(0.1, h); sh.lineTo(0.06, h); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
    geo.rotateY(-Math.PI / 2); if (!up) geo.rotateX(Math.PI);
    const m = new THREE.Mesh(geo, M.dark); m.position.set(x + 0.006, fuseY(s, x, up ? 1 : -1), s - 0.07); m.userData.hot = 'antennas'; m.castShadow = true; g.add(m);
  };
  blade(2.95, 0, true); blade(3.55, 0, true, 0.17); blade(3.3, 0, false, 0.09); blade(5.6, 0, true, 0.12);
  [2.3, 2.5].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.018, 20), M.white); p.position.set(0, fuseY(s, 0, 1) + 0.006, s); p.userData.hot = 'antennas'; g.add(p); });
  // Cabin door outline (right side) and handle
  const outline = [];
  const door = [[1.985, 0.82], [2.80, 0.82], [2.80, 1.70], [2.03, 1.75]];
  for (let i = 0; i < door.length; i++) {
    const [s0, y0] = door[i], [s1, y1] = door[(i + 1) % door.length];
    for (let k = 0; k <= 16; k++) { const s = lerp(s0, s1, k / 16), y = lerp(y0, y1, k / 16); outline.push(V(fuseX(s, y, 1) + 0.002, y, s)); }
  }
  const dl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline, true, 'catmullrom', 0.01), 160, 0.0035, 4, true), M.dark); dl.userData.hot = 'door'; g.add(dl);
  const dh = new THREE.Mesh(rbox(0.03, 0.025, 0.13, 0.008), M.chrome); dh.position.set(fuseX(2.68, 1.18, 1) + 0.012, 1.18, 2.68); dh.userData.hot = 'door'; g.add(dh);
  // Baggage door (right side, aft of the cabin)
  const bag = []; [[3.55, 0.98], [4.05, 0.98], [4.0, 1.42], [3.6, 1.48]].forEach(([s, y], i, a) => { const [s1, y1] = a[(i + 1) % a.length]; for (let k = 0; k <= 10; k++) bag.push(V(fuseX(lerp(s, s1, k / 10), lerp(y, y1, k / 10), 1) + 0.002, lerp(y, y1, k / 10), lerp(s, s1, k / 10))); });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bag, true), 80, 0.003, 4, true), M.dark));
  // Step behind the right wing
  const step = new THREE.Mesh(tube([V(fuseX(3.85, 0.66, 1) - 0.02, 0.62, 3.85), V(0.60, 0.45, 3.87), V(0.62, 0.45, 3.87)], 0.012, 8, 6), M.chrome); g.add(step);
  const pad = new THREE.Mesh(rbox(0.12, 0.012, 0.08, 0.004), M.walk); pad.position.set(0.62, 0.45, 3.87); g.add(pad);
  // External power receptacle door, right side aft of the wing
  const ep = new THREE.Mesh(rbox(0.008, 0.08, 0.1, 0.003), M.white); ep.position.set(fuseX(4.25, 0.95, 1) + 0.006, 0.95, 4.25); ep.userData.hot = 'extPower'; g.add(ep);
  // ELT access plate, right side below the stabilator leading edge
  const elt = new THREE.Mesh(rbox(0.004, 0.08, 0.12, 0.003), M.white); elt.position.set(fuseX(6.3, 1.12, 1) + 0.004, 1.12, 6.3); g.add(elt);
  // Registration (generic, no operator markings)
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const c = cv.getContext('2d');
  c.fillStyle = '#16264f'; c.font = 'bold 78px Helvetica, Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText('N100PT', 8, 52);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  [-1, 1].forEach(sx => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.115), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    const s = 5.35, y = 1.17; m.position.set(fuseX(s, y, sx) + sx * 0.006, y, s); m.rotation.y = sx * Math.PI / 2;
    g.add(m);
  });
}

// ---------------- Ground equipment (removable during the preflight) ----------------
function buildGroundItems(g, parts) {
  const chock = (pos, front) => {
    const sh = new THREE.Shape(); sh.moveTo(-0.09, 0); sh.lineTo(0.09, 0); sh.lineTo(0.04, 0.08); sh.lineTo(-0.04, 0.08); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }); geo.translate(0, 0, -0.11); geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.yellow); m.position.set(pos.x, 0, pos.z + (front ? -0.24 : 0.24)); m.castShadow = true; return m;
  };
  [['chockL', parts.wheelL], ['chockR', parts.wheelR], ['chockN', parts.wheelN]].forEach(([id, w]) => {
    const ch = new THREE.Group(); ch.add(chock(w, true)); if (id !== 'chockN') ch.add(chock(w, false));
    ch.traverse(o => (o.userData.hot = id)); g.add(ch); parts[id] = ch;
  });
  const rope = (from, hot) => {
    const anchor = V(from.x, 0.005, from.z);
    const r = new THREE.Group();
    const m = new THREE.Mesh(tube([from, from.clone().lerp(anchor, 0.5).add(V(0.02, 0, 0.02)), anchor], 0.007, 16, 6), M.rope); m.userData.hot = hot; r.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 16), M.dark); ring.rotation.x = Math.PI / 2; ring.position.copy(anchor); r.add(ring);
    g.add(r); return r;
  };
  parts.tiedownL = rope(parts.tdRingL, 'tiedownL'); parts.tiedownR = rope(parts.tdRingR, 'tiedownR'); parts.tiedownT = rope(parts.tdRingT, 'tiedownT');
}

export function buildExterior() {
  materials();
  const g = new THREE.Group(); g.name = 'exterior';
  const parts = {};
  parts.fuselage = buildFuselage(g);
  const wings = new THREE.Group(); g.add(wings);
  buildWing(wings, 1, parts); buildWing(wings, -1, parts);
  buildTail(g, parts); buildNose(g, parts); buildGear(g, parts); buildDetails(g, parts); buildGroundItems(g, parts);
  g.traverse(o => { if (o.isMesh && !o.material.transparent && o.castShadow === false) o.castShadow = true; if (o.isMesh && o.material.transparent) o.castShadow = false; });
  return { group: g, parts };
}

// Apply airplane state to the exterior each frame
export function updateExterior(parts, s, lights, t, dt) {
  // Controls: yoke roll right = right aileron up; differential travel.
  const roll = s.yokeRoll, pitch = s.yokePitch;
  const up = 25 * D2R, dn = 12.5 * D2R;
  parts.aileronR.userData.setAngle(roll > 0 ? -roll * up : -roll * dn);
  parts.aileronL.userData.setAngle(roll > 0 ? -roll * dn : -roll * up);
  parts.flapR.userData.setAngle(s.flapAnim * D2R);
  parts.flapL.userData.setAngle(-s.flapAnim * D2R);
  // yoke aft (pitch > 0) raises the stabilator trailing edge
  parts.stab.rotation.x = -(pitch > 0 ? pitch * 14 : pitch * 4) * D2R;
  // anti-servo tab moves the same way as the stabilator, plus trim (nose-up trim = tab down)
  parts.tabs.forEach(tb => (tb.rotation.x = parts.stab.rotation.x * 0.6 + s.pitchTrim * 8 * D2R));
  // right pedal swings the rudder trailing edge right
  parts.rudder.userData.setAngle((s.rudder + s.rudderTrim * 0.15) * 27 * D2R);
  // Lights
  M.navRed.emissiveIntensity = M.navGreen.emissiveIntensity = M.navWhite.emissiveIntensity = lights.nav ? 2.2 : 0;
  parts.navLeftLight.intensity = parts.navRightLight.intensity = lights.nav ? 1.2 : 0; parts.tailLight.intensity = lights.nav ? 0.6 : 0;
  const flash = lights.strobe && ((t % 1.2) < 0.06 || ((t % 1.2) > 0.15 && (t % 1.2) < 0.2));
  M.strobe.emissiveIntensity = flash ? 8 : 0; parts.strobeL.intensity = parts.strobeR.intensity = flash ? 30 : 0;
  M.landing.emissiveIntensity = lights.landing ? 3 : 0; parts.landingLight.intensity = lights.landing ? 60 : 0;
  // Prop
  const rps = s.engine.rpm / 60;
  parts.prop.rotation.z -= rps * Math.PI * 2 * dt * (s.engine.rpm > 600 ? 0.13 : 1); // strobe-like slow-down for visibility
  parts.propDisc.material.opacity = s.engine.rpm > 600 ? 0.12 : 0;
  // Ground items and doors
  parts.pitotCover.visible = s.ext.pitotCover;
  parts.ribbon.rotation.z = Math.sin(t * 2.1) * 0.12; parts.ribbon.rotation.x = Math.sin(t * 1.3) * 0.15;
  parts.chockL.visible = s.ext.chockL; parts.chockR.visible = s.ext.chockR; parts.chockN.visible = s.ext.chockN;
  parts.tiedownL.visible = s.ext.tiedownL; parts.tiedownR.visible = s.ext.tiedownR; parts.tiedownT.visible = s.ext.tiedownT;
  const ease = (o, target) => (o.rotation.x += (target - o.rotation.x) * Math.min(1, dt * 6));
  ease(parts.capL.lid, s.ext.fuelCapL === 'open' ? -1.9 : 0); ease(parts.capR.lid, s.ext.fuelCapR === 'open' ? -1.9 : 0);
  parts.capL.fuel.position.y = -0.11 + Math.min(1, s.fuel.L / 25) * 0.07; parts.capR.fuel.position.y = -0.11 + Math.min(1, s.fuel.R / 25) * 0.07;
  const oil = parts.oilDoor; oil.rotation.x += ((s.ext.oilDoor === 'open' ? -1.25 : 0) - oil.rotation.x) * Math.min(1, dt * 6);
  parts.dipstick.position.y += ((s.ext.dipstick === 'out' ? 1.72 : 1.43) - parts.dipstick.position.y) * Math.min(1, dt * 5);
  parts.stallVane.rotation.x = s.ext.stallVaneUp ? -0.25 : 0.3;
}
