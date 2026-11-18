// Preflight Trainer — scene, cameras, input and the render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildExterior, updateExterior, windowSDF } from './exterior.js';
import { buildCockpit, updateCockpit, EYE } from './cockpit.js';
import { state, tick, simulate, lightsOn, stallWarning, onChange, resetState } from './state.js';
import { ACTIONS, partList } from './actions.js';
import { INFO } from './data.js';
import { tone } from './audio.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.fog = new THREE.Fog(0xc9d8e6, 60, 420);

// Sky dome
{
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d7fc7) }, mid: { value: new THREE.Color(0x9cc4e8) }, bot: { value: new THREE.Color(0xdfe9f1) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0), 0.6)) : bot; c = mix(bot, c, smoothstep(-0.02, 0.08, h)); gl_FragColor = vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(geo, mat));
}

// Light
const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x6b6558, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(-9, 14, 6); sun.target.position.set(0, 0.8, 3.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 1, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// Ramp: concrete with expansion joints and a painted tie-down spot
function rampTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#9d9d97'; x.fillRect(0, 0, 1024, 1024);
  const img = x.getImageData(0, 0, 1024, 1024); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(60,58,52,${Math.random() * 0.06})`; x.beginPath(); x.arc(Math.random() * 1024, Math.random() * 1024, 20 + Math.random() * 80, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(45,45,42,0.55)'; x.lineWidth = 3; x.strokeRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.92 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.set(0, 0, 3); scene.add(ground);
{ // yellow parking T
  const m = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.8 });
  const a = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 9), m); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.003, 2.2); a.receiveShadow = true;
  const b = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.15), m); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.003, 2.9); b.receiveShadow = true;
  scene.add(a, b);
}

// Airplane
const plane = new THREE.Group(); scene.add(plane);
const ext = buildExterior(); plane.add(ext.group);
const cpt = buildCockpit(renderer); plane.add(cpt.group);

// ---------------- Cameras ----------------
const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 1200);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true; orbit.dampingFactor = 0.08;
orbit.minDistance = 0.4; orbit.maxDistance = 18; orbit.maxPolarAngle = Math.PI * 0.495;
orbit.target.set(0, 1.0, 3.3); camera.position.set(-7.8, 3.4, -4.2);
orbit.zoomToCursor = true;

let mode = 'outside';
const look = { yaw: 0, pitch: -0.12, fov: 62 };
const camAnim = { t: 1, from: null, to: null };

function setView(v, animate = true) {
  mode = v;
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'outside') {
    orbit.enabled = true;
    flyTo({ pos: new THREE.Vector3(-7.8, 3.4, -4.2), target: new THREE.Vector3(0, 1.0, 3.3), fov: 42 }, animate);
  } else {
    orbit.enabled = false;
    look.yaw = 0; look.pitch = -0.16; look.fov = 62;
    flyTo({ pos: EYE.clone(), target: lookTarget(EYE, look.yaw, look.pitch), fov: look.fov }, animate);
  }
}
function lookTarget(p, yaw, pitch) {
  return p.clone().add(new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)));
}
function flyTo({ pos, target, fov }, animate = true) {
  const from = { pos: camera.position.clone(), target: mode === 'outside' || !camAnim.to ? orbit.target.clone() : camAnim.to.target.clone(), fov: camera.fov };
  if (mode === 'cockpit') from.target = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()));
  camAnim.from = from; camAnim.to = { pos, target, fov }; camAnim.t = animate ? 0 : 1;
  if (!animate) applyCam(1);
}
function applyCam(k) {
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const { from, to } = camAnim;
  camera.position.lerpVectors(from.pos, to.pos, e);
  const tgt = from.target.clone().lerp(to.target, e);
  camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, e); camera.updateProjectionMatrix();
  if (mode === 'outside') { orbit.target.copy(tgt); }
  camera.lookAt(tgt);
}
// Zoom smoothly to a part: outside, orbit around it; in the cockpit, lean toward it.
function focusPart(id) {
  const obj = findHot(id);
  if (!obj) return;
  const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()).length();
  const ins = isInside(c);
  if (ins && mode !== 'cockpit') { mode = 'cockpit'; orbit.enabled = false; document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === 'cockpit')); }
  if (!ins && mode !== 'outside') { mode = 'outside'; orbit.enabled = true; document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === 'outside')); }
  if (mode === 'cockpit') {
    const dir = c.clone().sub(EYE); const dist = Math.max(0.16, Math.min(0.55, size * 2.4));
    const pos = c.clone().sub(dir.normalize().multiplyScalar(dist));
    look.yaw = Math.atan2(-dir.x, -dir.z); look.pitch = Math.asin(dir.y);
    flyTo({ pos, target: c, fov: 50 });
  } else {
    const dist = Math.max(0.9, Math.min(5, size * 3.2));
    const away = camera.position.clone().sub(c).normalize();
    if (away.y < 0.15) away.y = 0.15; away.normalize();
    flyTo({ pos: c.clone().add(away.multiplyScalar(dist)), target: c, fov: 42 });
  }
}
function isInside(p) { return p.z > 1.35 && p.z < 3.6 && p.y > 0.6 && p.y < 1.85 && Math.abs(p.x) < 0.6; }

// Cockpit look: drag to turn your head, pinch or scroll to zoom
const pointers = new Map();
let pinch0 = 0, fov0 = 60;
let downInfo = null, drag = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = look.fov; downInfo = null; drag = null; return; }
  downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  const hit = pick(e.clientX, e.clientY);
  const a = hit && ACTIONS[hit.id];
  if (a?.drag) { drag = { id: hit.id, a, x: e.clientX, y: e.clientY, start: a.drag.start?.(), point: hit.point, active: false }; orbit.enabled = false; }
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (downInfo) downInfo.moved += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 2 && mode === 'cockpit') {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    look.fov = THREE.MathUtils.clamp(fov0 * pinch0 / Math.max(10, d), 18, 80); camera.fov = look.fov; camera.updateProjectionMatrix(); return;
  }
  if (drag) {
    if (downInfo && downInfo.moved > 6) drag.active = true;
    if (drag.active) { drag.a.drag.move(e.clientX - drag.x, e.clientY - drag.y, drag.start); showCard(drag.id, false); }
    return;
  }
  if (mode === 'cockpit' && pointers.size === 1 && camAnim.t >= 1) {
    const k = camera.fov / 60 * 0.0042;
    look.yaw += dx * k; look.pitch = THREE.MathUtils.clamp(look.pitch + dy * k, -1.3, 1.1);
    camera.lookAt(lookTarget(camera.position, look.yaw, look.pitch));
  }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (downInfo && downInfo.moved < 8 && !drag?.active) onTap(e.clientX, e.clientY);
  if (drag?.a.hold) drag.a.release?.();
  downInfo = null; drag = null;
  if (mode === 'outside') orbit.enabled = true;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (drag?.a.hold) drag.a.release?.(); downInfo = null; drag = null; if (mode === 'outside') orbit.enabled = true; });
canvas.addEventListener('wheel', e => {
  if (mode !== 'cockpit') return;
  e.preventDefault(); look.fov = THREE.MathUtils.clamp(look.fov * (1 + e.deltaY * 0.001), 18, 80); camera.fov = look.fov; camera.updateProjectionMatrix();
}, { passive: false });

// Picking
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function hotOf(o) { while (o) { if (o.userData?.hot) return o.userData.hot; o = o.parent; } return null; }
function pick(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(plane, true);
  for (const h of hits) {
    if (!h.object.visible || !visibleChain(h.object)) continue;
    const w = h.object.userData.windowed;
    if (w) { // the fuselage and its glass share one surface; the window shape decides which was hit
      const inWin = windowSDF(h.point.z, h.point.x, h.point.y) < 0;
      if (w === 'body' && inWin) continue;
      if (w === 'glass' && (!inWin || mode === 'cockpit')) continue;
      if (w === 'glass' && hits.some(o => o !== h && hotOf(o.object) && !o.object.userData.windowed && o.distance - h.distance < 1.2)) continue;
    }
    const id = hotOf(h.object);
    if (id) return { id, point: h.point };
    if (h.object.material?.transparent) continue;
    return null;
  }
  return null;
}
function visibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function findHot(id) { let f = null; plane.traverse(o => { if (!f && o.userData?.hot === id && o.isMesh) f = o; }); return f; }

function onTap(x, y) {
  const hit = pick(x, y);
  if (!hit) { hideCard(); return; }
  const a = ACTIONS[hit.id];
  if (a?.tap) a.tap(hit);
  showCard(hit.id, true);
}

// ---------------- Card ----------------
const card = document.getElementById('card');
let cardId = null;
function showCard(id, rebuild = true) {
  const info = INFO[ACTIONS[id]?.info || id] || { name: id, text: '' };
  const a = ACTIONS[id] || {};
  card.hidden = false;
  if (rebuild || cardId !== id) {
    cardId = id;
    document.getElementById('cardName').textContent = a.name?.() || info.name;
    document.getElementById('cardRef').textContent = info.ref || '';
    document.getElementById('cardText').textContent = info.text || '';
    const box = document.getElementById('cardActions'); box.innerHTML = '';
    (a.options?.() || []).forEach(o => {
      if (o.range) {
        const r = document.createElement('input'); r.type = 'range'; r.min = o.min; r.max = o.max; r.step = o.step; r.value = o.value();
        r.oninput = () => { o.set(+r.value); updateCardState(); }; r.setAttribute('aria-label', o.label); box.append(r); return;
      }
      const b = document.createElement('button'); b.textContent = o.label; b.onclick = () => { o.do(); showCard(id, true); };
      if (o.selected?.()) b.classList.add('sel'); box.append(b);
    });
    const z = document.createElement('button'); z.textContent = 'Zoom to it'; z.onclick = () => focusPart(id); box.append(z);
  }
  updateCardState();
}
function updateCardState() {
  if (!cardId) return;
  const a = ACTIONS[cardId]; const el = document.getElementById('cardState');
  const st = a?.state?.();
  el.innerHTML = st ? `State: <span class="v ${/^(ON|IN|OPEN|SET|RUNNING)/.test(st) ? 'on' : ''}">${st}</span>` : '';
}
function hideCard() { card.hidden = true; cardId = null; }
document.getElementById('cardClose').onclick = hideCard;
onChange(() => { if (cardId) updateCardState(); });

// Parts list
const partsEl = document.getElementById('parts');
document.getElementById('btnParts').onclick = () => { partsEl.hidden = !partsEl.hidden; renderParts(''); document.getElementById('partsSearch').value = ''; };
document.getElementById('partsClose').onclick = () => (partsEl.hidden = true);
document.getElementById('partsSearch').oninput = e => renderParts(e.target.value);
function renderParts(q) {
  const list = document.getElementById('partsList'); list.innerHTML = '';
  q = q.trim().toLowerCase();
  partList().forEach(group => {
    const items = group.items.filter(id => !q || (INFO[ACTIONS[id]?.info || id]?.name || id).toLowerCase().includes(q));
    if (!items.length) return;
    const h = document.createElement('h3'); h.textContent = group.title; list.append(h);
    items.forEach(id => {
      const b = document.createElement('button'); b.textContent = ACTIONS[id]?.name?.() || INFO[ACTIONS[id]?.info || id]?.name || id;
      b.onclick = () => { focusPart(id); showCard(id, true); if (innerWidth < 900) partsEl.hidden = true; }; list.append(b);
    });
  });
}

document.querySelectorAll('#viewSeg button').forEach(b => (b.onclick = () => setView(b.dataset.view)));
document.getElementById('btnReset').onclick = () => { resetState(); hideCard(); };

// ---------------- Loop ----------------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let t0 = performance.now();
let stallTone = null;
function frame(now) {
  const dt = tick(now);
  const t = (now - t0) / 1000;
  const lights = lightsOn();
  updateExterior(ext.parts, state, lights, t, dt);
  updateCockpit(cpt, state, t, dt);
  // stall warning horn
  const sw = stallWarning();
  if (sw && !stallTone) stallTone = tone(2900, 0.08); else if (!sw && stallTone) { stallTone.stop(); stallTone = null; }
  if (camAnim.t < 1) { camAnim.t = Math.min(1, camAnim.t + dt / 0.9); applyCam(camAnim.t); }
  else if (mode === 'outside') orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
setView('outside', false);
document.getElementById('loading').classList.add('gone');
setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 6000);
requestAnimationFrame(frame);

// For automated checks
window.__pt = { camAnim, simulate, THREE, scene, camera, state, setView, focusPart, ext, cpt, renderer, look, pick, ACTIONS, showCard, mode: () => mode };
