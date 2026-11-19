// A small generic airport: runway 9/27 (3,600 ft x 75 ft), a parallel taxiway, an exit, the ramp
// with a parking T, hold-short markings, hangars and a windsock, set in farmland.
import * as THREE from 'three';
import { AIRPORT as A } from './flight.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function noise(x, w, h, base, amt) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
const flat = (w, l, mat, x, z, y = 0, rot = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y, z); m.receiveShadow = true; return m; };

export function buildAirport() {
  const g = new THREE.Group(); g.name = 'airport';
  const asphalt = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (x, w, h) => noise(x, w, h, '#5a5c5f', 24), [1, 1]), roughness: 0.95 });
  const concrete = new THREE.MeshStandardMaterial({ map: canvasTex(1024, 1024, (x, w, h) => { noise(x, w, h, '#a3a39c', 20); x.strokeStyle = 'rgba(55,55,50,0.5)'; x.lineWidth = 3; x.strokeRect(0, 0, w, h); }, [1, 1]), roughness: 0.92 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.75 });
  const tiled = (mat, rx, ry) => { const m = mat.clone(); m.map = mat.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(rx, ry); return m; };

  // Farmland that follows the airplane (main.js re-centres it and scrolls the texture)
  const fieldTex = canvasTex(1024, 1024, (x, w, h) => {
    const cols = ['#6f8f45', '#7d9b4c', '#8fa35a', '#a89a5c', '#6a7f3e', '#94b060', '#b5a66a', '#5f7a38'];
    x.fillStyle = '#6f8a45'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { x.fillStyle = cols[i % cols.length]; const fx = Math.random() * w, fy = Math.random() * h; x.save(); x.translate(fx, fy); x.rotate((Math.random() - 0.5) * 0.15); x.fillRect(-60, -60, 60 + Math.random() * 180, 60 + Math.random() * 160); x.restore(); }
    x.strokeStyle = 'rgba(70,60,40,0.35)'; x.lineWidth = 2; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(Math.random() * w, 0); x.lineTo(Math.random() * w, h); x.stroke(); }
    const img = x.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; } x.putImageData(img, 0, 0);
  }, [1, 1]);
  const FIELD = 30000, TILE = 1500;
  fieldTex.repeat.set(FIELD / TILE, FIELD / TILE);
  const ground = flat(FIELD, FIELD, new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 1 }), 0, 0, -0.02);
  g.add(ground);
  // grass around the airport so the ramp sits in a mowed field
  g.add(flat(1500, 260, new THREE.MeshStandardMaterial({ color: 0x6f9447, roughness: 1 }), (A.east + A.west) / 2, -40, -0.01));

  // Runway 9/27
  const len = A.east - A.west, cx = (A.east + A.west) / 2;
  g.add(flat(len, A.rwyW, tiled(asphalt, len / 20, 1), cx, A.rwyZ, 0.01));
  // centreline: 120 ft stripes with 80 ft gaps
  for (let x = A.west + 70; x < A.east - 70; x += 61) g.add(flat(36.6, 0.9, white, x + 18, A.rwyZ, 0.02));
  // threshold bars and side stripes
  [[A.east - 5, 1], [A.west + 5, -1]].forEach(([tx, dir]) => {
    for (let i = 0; i < 4; i++) [-1, 1].forEach(sd => g.add(flat(45, 1.75, white, tx - dir * 25, A.rwyZ + sd * (2.4 + i * 2.6), 0.02)));
    // aiming point blocks
    [-1, 1].forEach(sd => g.add(flat(45, 3, white, tx - dir * 310, A.rwyZ + sd * 6.5, 0.021)));
  });
  // runway numbers, readable from the approach end
  const num = (txt, x, rot) => {
    const t = canvasTex(256, 512, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.font = 'bold 430px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 20); });
    const m = flat(9, 18, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7 }), x, A.rwyZ, 0.022, rot); g.add(m);
  };
  num('27', A.east - 80, Math.PI / 2); num('9', A.west + 80, -Math.PI / 2);
  // edge lines
  [-1, 1].forEach(sd => g.add(flat(len, 0.45, white, cx, A.rwyZ + sd * (A.rwyW / 2 - 0.5), 0.02)));

  // Taxiways: A from the ramp to the runway, the parallel, and the exit
  const twy = (x0, z0, x1, z1, w = 10.5) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, -(z1 - z0));
    const m = flat(w, L + w * 0.6, tiled(asphalt, w / 20, L / 20), (x0 + x1) / 2, (z0 + z1) / 2, 0.008, -ang); g.add(m);
    const c = flat(0.18, L, yellow, (x0 + x1) / 2, (z0 + z1) / 2, 0.018, -ang); g.add(c);
  };
  twy(0, -20, 0, A.rwyZ + 6);
  twy(A.exitX, A.rwyZ + 6, A.exitX, A.parallelZ);
  twy(A.exitX, A.parallelZ, 0, A.parallelZ);
  // run-up pad
  g.add(flat(30, 16, tiled(asphalt, 1.5, 0.8), 0, A.runup[1], 0.007));
  // hold-short markings across taxiway A and the exit: two solid lines (taxiway side), two dashed (runway side)
  const holdShort = (x, z) => {
    [0, 0.45].forEach(o => g.add(flat(10.5, 0.15, yellow, x, z + 0.9 + o, 0.02)));
    [0, 0.45].forEach(o => { for (let k = -4; k <= 4; k += 2) g.add(flat(0.9, 0.15, yellow, x + k * 1.1, z - 0.4 - o, 0.02)); });
  };
  holdShort(0, A.hold[1] - 2.5); holdShort(A.exitX, A.hold[1] - 2.5);
  // hold-short sign (red with white "27-9")
  const sign = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#c4161c'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 64px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('27-9', w / 2, h / 2 + 4); });
  const sg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.12), [0, 0, 0, 0, 1, 1].map(i => (i ? new THREE.MeshStandardMaterial({ map: sign }) : new THREE.MeshStandardMaterial({ color: 0x222222 }))));
  sg.position.set(-7.5, 0.55, A.hold[1] - 2.5); g.add(sg);

  // Ramp with the parking T and tie-down spots
  g.add(flat(80, 46, tiled(concrete, 4, 2.3), 0, 6, 0.006));
  g.add(flat(0.15, 9, yellow, 0, 2.2, 0.016)); g.add(flat(9, 0.15, yellow, 0, 2.9, 0.016));
  [-22, 22].forEach(x => { g.add(flat(0.15, 9, yellow, x, 2.2, 0.016)); g.add(flat(9, 0.15, yellow, x, 2.9, 0.016)); });
  // Hangars south of the ramp
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.6, metalness: 0.3 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6f7780, roughness: 0.6, metalness: 0.4 });
  [[-28, 44], [8, 46], [40, 44]].forEach(([x, z], i) => {
    const w = i === 1 ? 26 : 20, d = 18, h = 7;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hangarMat); b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true; g.add(b);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 28), roofMat); r.rotation.z = Math.PI / 2; r.scale.set(0.32, 1, 1); r.position.set(x, h, z); r.castShadow = true; g.add(r); // curved roof along the length
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.85), new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.5, roughness: 0.4 })); door.position.set(x, h * 0.43, z - d / 2 - 0.02); door.rotation.y = Math.PI; g.add(door);
  });
  // Windsock
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 10), new THREE.MeshStandardMaterial({ color: 0xdddddd })); pole.position.set(-260, 3, A.rwyZ + 40); g.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a00, side: THREE.DoubleSide, roughness: 0.8 }));
  sock.rotation.z = Math.PI / 2 + 0.9; sock.position.set(-261.2, 5.0, A.rwyZ + 40); g.add(sock);
  // Runway edge lights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 });
  for (let x = A.west; x <= A.east; x += 60) [-1, 1].forEach(sd => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 6), lightMat); l.position.set(x, 0.18, A.rwyZ + sd * (A.rwyW / 2 + 1.5)); g.add(l); });

  return { group: g, ground, fieldTex, TILE };
}
