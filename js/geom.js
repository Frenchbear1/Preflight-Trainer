// Geometry helpers: a lofted fuselage with real window openings, airfoil surfaces for the
// wing and tail, and small parametric parts. Units are metres. +x is the right wing,
// +y is up, +z is aft (the nose points toward -z). Station s = distance aft of the spinner tip.
import * as THREE from 'three';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Catmull-Rom through station table rows [s, ...values]
export function sampler(rows) {
  return s => {
    let i = 0;
    while (i < rows.length - 2 && s > rows[i + 1][0]) i++;
    const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(rows.length - 1, i + 2)];
    const t = clamp((s - p1[0]) / (p2[0] - p1[0] || 1), 0, 1);
    const out = [];
    for (let k = 1; k < p1.length; k++) {
      const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      const v = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      // keep monotone-ish: clamp to neighbours' range to avoid overshoot
      out.push(clamp(v, Math.min(b, c) - Math.abs(c - b) * 0.15, Math.max(b, c) + Math.abs(c - b) * 0.15));
    }
    return out;
  };
}

// Signed distance to a convex polygon in 2D (negative inside)
export function polySDF(px, py, poly) {
  let d = Infinity, inside = true;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, Math.hypot(dx, dy));
    if (ex * wy - ey * wx < 0) inside = false; // polygons are counter-clockwise
  }
  return inside ? -d : d;
}

/**
 * Lofted body. section(s) returns {top, bot, hw, n} (heights above ground, half width,
 * superellipse exponent). holeFn(s, x, y, side) < 0 marks window openings.
 * colorFn(s, x, y) returns [r,g,b] paint. Returns { body, glass } geometries.
 */
export function loft({ s0, s1, nS, nA, section }) {
  const pos = [], hw = [], bot = [], top = [], uv = [], idx = [];
  for (let i = 0; i <= nS; i++) {
    const s = lerp(s0, s1, i / nS);
    const sec = section(s);
    const mid = (sec.top + sec.bot) / 2, e = 2 / sec.n;
    for (let j = 0; j <= nA; j++) {
      const th = (j / nA) * Math.PI * 2;
      const c = Math.cos(th), si = Math.sin(th);
      const y = mid + (c >= 0 ? sec.top - mid : mid - sec.bot) * Math.sign(c) * Math.pow(Math.abs(c), e);
      const x = sec.hw * Math.sign(si) * Math.pow(Math.abs(si), e);
      pos.push(x, y, s); hw.push(sec.hw); bot.push(sec.bot); top.push(sec.top); uv.push(j / nA, i / nS);
    }
  }
  const row = nA + 1;
  for (let i = 0; i < nS; i++) for (let j = 0; j < nA; j++) { const a = i * row + j, b = a + row; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aHW', new THREE.Float32BufferAttribute(hw, 1));
  g.setAttribute('aBot', new THREE.Float32BufferAttribute(bot, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// NACA-style airfoil ordinates. Returns points around the section from the trailing edge,
// over the top to the leading edge and back along the bottom, between chord fractions c0..c1.
export function airfoil(t = 0.15, m = 0.02, p = 0.4, n = 28, c0 = 0, c1 = 1) {
  const yt = x => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = x => (m === 0 ? 0 : x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x));
  // Fixed point count for any chord range, so sections with different ranges can be joined.
  const xs = [];
  const b0 = Math.acos(1 - 2 * c0), b1 = Math.acos(1 - 2 * c1);
  for (let i = 0; i <= n; i++) xs.push((1 - Math.cos(b0 + (b1 - b0) * (i / n))) / 2); // cosine spacing
  const up = xs.map(x => [x, yc(x) + yt(x)]);
  const lo = xs.map(x => [x, yc(x) - yt(x)]);
  // upper from c1 → c0, lower c0 → c1 (the leading-edge point is shared when c0 = 0)
  return [...up.reverse(), ...(c0 === 0 ? lo.slice(1) : lo)];
}

/**
 * Surface between span sections. sections: [{ le: Vector3, chordDir: Vector3, up: Vector3, chord, thick }]
 * Builds a closed shell for chord fractions c0..c1 with end caps.
 */
export function airfoilSurface(sections, { t = 0.15, m = 0.02, c0 = 0, c1 = 1, n = 28 } = {}) {
  const pts = [], idx = [];
  const prof = sections.map(sec => airfoil(sec.t ?? t, sec.m ?? m, 0.4, n, sec.c0 ?? c0, sec.c1 ?? c1));
  if (sections.some(sec => (sec.c0 ?? c0) === 0) && sections.some(sec => (sec.c0 ?? c0) > 0)) throw new Error('mixed leading edges');
  const L = prof[0].length;
  sections.forEach((sec, i) => {
    prof[i].forEach(([x, y]) => {
      const th = sec.thickScale ?? 1;
      const p = sec.le.clone().addScaledVector(sec.chordDir, x * sec.chord).addScaledVector(sec.up, y * sec.chord * th);
      pts.push(p.x, p.y, p.z);
    });
  });
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < L - 1; j++) {
    const a = i * L + j, b = a + L;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  { // close the trailing gap (c1) face on its own vertices
    const start = pts.length / 3;
    for (let i = 0; i < sections.length; i++) { const a = i * L, b = i * L + L - 1; pts.push(pts[a * 3], pts[a * 3 + 1], pts[a * 3 + 2], pts[b * 3], pts[b * 3 + 1], pts[b * 3 + 2]); }
    for (let i = 0; i < sections.length - 1; i++) { const a = start + i * 2, b = a + 1, a2 = a + 2, b2 = a + 3; idx.push(b, b2, a, b2, a2, a); }
  }
  const cap = (i, flip) => { // fan cap on its own copy of the ring vertices
    const ring = i * L, start = pts.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < L; j++) { const x = pts[(ring + j) * 3], y = pts[(ring + j) * 3 + 1], z = pts[(ring + j) * 3 + 2]; pts.push(x, y, z); cx += x; cy += y; cz += z; }
    const c = pts.length / 3; pts.push(cx / L, cy / L, cz / L);
    for (let j = 0; j < L; j++) { const a = start + j, b = start + ((j + 1) % L); flip ? idx.push(c, b, a) : idx.push(c, a, b); }
  };
  cap(0, false); cap(sections.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Rounded box
export function rbox(w, h, d, r = 0.01, seg = 3) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * Math.min(r, d / 2 - 0.0005), bevelEnabled: true, bevelThickness: Math.min(r, d / 2 - 0.0005), bevelSize: r * 0.6, bevelSegments: seg, curveSegments: seg });
  g.center();
  return g;
}

export function tube(points, radius, seg = 24, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.TubeGeometry(curve, seg, radius, radial, closed);
}

// Tire: lathe profile around the x axis (axle along x)
export function tireGeometry(dia, width) {
  const R = dia / 2, w = width / 2, rim = R * 0.48;
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    pts.push(new THREE.Vector2(rim + (R - rim) * (0.55 + 0.45 * Math.cos(a)) + (R - rim) * 0.0, w * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function hingeGroup(pivotA, pivotB) {
  const g = new THREE.Group();
  g.position.copy(pivotA);
  g.userData.axis = pivotB.clone().sub(pivotA).normalize();
  g.userData.setAngle = a => g.quaternion.setFromAxisAngle(g.userData.axis, a);
  return g;
}
// Move a world-space geometry into a hinge group's local space
export function intoHinge(geo, group) { geo.translate(-group.position.x, -group.position.y, -group.position.z); return geo; }
