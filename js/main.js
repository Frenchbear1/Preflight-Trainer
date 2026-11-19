// Preflight Trainer — scene, cameras, input and the render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildExterior, updateExterior, windowSDF } from './exterior.js';
import { buildCockpit, updateCockpit, EYE } from './cockpit.js';
import { state, tick, simulate, lightsOn, stallWarning, onChange, resetState } from './state.js';
import { ACTIONS, partList, setDisplays } from './actions.js';
import { INFO } from './data.js';
import { tone, chime } from './audio.js';
import { CHECKLISTS, flatSteps } from './checklists.js';

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
setDisplays(cpt.parts.displays);

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
// view: 'in' for the pilot's seat, or a direction [x, y, z] from the part toward the camera.
function focusPart(id, view, far) {
  const obj = findHot(id);
  if (!obj) return;
  const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()).length();
  const inside = view ? view === 'in' : isInside(c);
  setModeQuiet(inside ? 'cockpit' : 'outside');
  if (inside) {
    const dir = c.clone().sub(EYE); const dist = Math.max(0.2, Math.min(0.6, size * 2.2));
    const pos = c.clone().sub(dir.clone().normalize().multiplyScalar(dist));
    if (pos.distanceTo(EYE) > 0.55) pos.lerp(EYE, 0.35); // stay roughly in the seat
    flyTo({ pos, target: c, fov: 52 });
  } else {
    const dist = far || Math.max(1.5, Math.min(5, size * 2.6));
    const away = Array.isArray(view) ? new THREE.Vector3(...view).normalize() : camera.position.clone().sub(c).normalize();
    const pos = c.clone().add(away.multiplyScalar(dist)); pos.y = Math.max(0.22, pos.y);
    flyTo({ pos, target: c, fov: 42 });
  }
}
function setModeQuiet(m) {
  if (mode === m) return; mode = m; orbit.enabled = m === 'outside';
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === m));
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
    let id = hotOf(h.object);
    if (id === 'fuselage') id = h.point.z < 1.4 ? 'cowl' : h.point.z > 5.6 ? 'empennage' : 'fuselage';
    if (id) return { id, point: h.point, uv: h.uv, screen: h.object.userData.screen, part: partTag(h.object) };
    if (h.object.material?.transparent) continue;
    return null;
  }
  return null;
}
function partTag(o) { while (o) { if (o.userData?.part) return o.userData.part; o = o.parent; } return null; }
function visibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function findHot(id) { let f = null; plane.traverse(o => { if (!f && o.userData?.hot === id && o.isMesh) f = o; }); return f; }

function onTap(x, y) {
  const hit = pick(x, y);
  if (!hit) { hideCard(); return; }
  const a = ACTIONS[hit.id];
  if (a?.tap) a.tap(hit);
  showCard(hit.id, true);
  const st = run.steps[run.idx];
  if (run.list && st && st.look && sameTarget(hit.id, st.target)) completeStep(run.idx);
}
function sameTarget(a, b) { return a === b || (b === 'windshield' && a === 'windshield') || (b === 'pfd' && a === 'pfd'); }

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

// ---------------- Checklist runner ----------------
const run = { list: null, steps: [], idx: 0, done: {}, arrived: 0 };
const clEl = document.getElementById('cl'), menuEl = document.getElementById('menu');
const save = () => { try { localStorage.setItem('pt.run.' + run.list.id, JSON.stringify({ idx: run.idx, done: run.done })); } catch {} };
const saved = id => { try { return JSON.parse(localStorage.getItem('pt.run.' + id)); } catch { return null; } };
function renderMenu() {
  const list = document.getElementById('menuList'); list.innerHTML = '';
  CHECKLISTS.forEach(cl => {
    const n = flatSteps(cl).length, sv = saved(cl.id), doneN = sv ? Object.keys(sv.done).length : 0;
    const b = document.createElement('button'); b.innerHTML = `<b>${cl.title} walk-around</b><span>${cl.ref} · ${n} items · cockpit, right wing, nose, left wing, tail</span>`;
    b.onclick = () => startList(cl, null); list.append(b);
    if (sv && doneN && doneN < n) { const r = document.createElement('div'); r.className = 'row'; const c = document.createElement('button'); c.innerHTML = `<b>Resume</b><span>${doneN} of ${n} done</span>`; c.onclick = () => startList(cl, sv); r.append(c); list.append(r); }
  });
  [['Before start through shutdown', 'POH 4.5b–4.5p · coming next'], ['Emergency procedures', 'POH Section 3 · coming next']].forEach(([t, d]) => { const b = document.createElement('button'); b.disabled = true; b.innerHTML = `<b>${t}</b><span>${d}</span>`; list.append(b); });
}
document.getElementById('btnLists').onclick = () => { menuEl.hidden = !menuEl.hidden; if (!menuEl.hidden) renderMenu(); };
document.getElementById('menuClose').onclick = () => (menuEl.hidden = true);
document.getElementById('clClose').onclick = () => stopList();
function startList(cl, resume) {
  menuEl.hidden = true; partsEl.hidden = true; hideCard();
  if (!resume) resetState();
  run.list = cl; run.steps = flatSteps(cl); run.done = resume?.done || {}; run.idx = 0;
  clEl.hidden = false; document.body.classList.add('cl-open'); resize();
  document.getElementById('clTitle').textContent = cl.title; document.getElementById('clRef').textContent = cl.ref;
  goStep(resume ? nextOpen(resume.idx) : 0);
}
function stopList() { run.list = null; clEl.hidden = true; document.body.classList.remove('cl-open'); resize(); pip.active = false; ring.visible = false; document.getElementById('pip').hidden = true; }
function nextOpen(from) { for (let i = from; i < run.steps.length; i++) if (!run.done[run.steps[i].key]) return i; for (let i = 0; i < from; i++) if (!run.done[run.steps[i].key]) return i; return run.steps.length; }
function goStep(i) {
  run.idx = i; run.arrived = performance.now();
  const st = run.steps[i];
  renderCL();
  if (!st) { pip.active = false; ring.visible = false; document.getElementById('pip').hidden = true; return; }
  focusPart(st.target, st.view, st.far);
  setupPip(st);
  save();
}
function completeStep(i) {
  const st = run.steps[i]; if (!st || run.done[st.key]) return;
  run.done[st.key] = true; chime(); renderCL(); save();
  clearTimeout(run.t); run.t = setTimeout(() => { if (run.idx === i) goStep(nextOpen(i + 1)); }, 700);
}
function renderCL() {
  const n = run.steps.length, d = Object.keys(run.done).length, st = run.steps[run.idx];
  document.getElementById('clBar').style.width = (100 * d / n) + '%';
  const now = document.getElementById('clNow');
  if (!st) {
    now.className = 'done-all';
    now.innerHTML = `<div class="sec">${run.list.title}</div><div class="item">Walk-around complete</div><div class="tip">${d} of ${n} items checked. The airplane is ready for the Before Starting Engine checklist.</div><div class="btns"><button class="primary" id="clAgain">Start over</button></div>`;
    document.getElementById('clAgain').onclick = () => startList(run.list, null);
  } else {
    now.className = '';
    const isDone = run.done[st.key];
    now.innerHTML = `<div class="sec">${st.sec} · ${st.i + 1} of ${run.list.sections[st.si].steps.length}</div>
      <div class="item">${st.t}</div><div class="act">${st.a}</div>
      ${st.tip ? `<div class="tip">${st.tip}</div>` : ''}
      <div class="how">${isDone ? 'Done.' : st.look && !st.check ? 'Look it over, then tap the part or press Checked.' : st.check ? 'Do it on the airplane. It ticks off by itself.' : ''}</div>
      <div class="btns">${st.look || !st.check ? '<button class="primary" id="clOk">Checked</button>' : ''}<button id="clShow">Show me</button><button id="clBack">Back</button><button id="clSkip">Skip</button></div>`;
    document.getElementById('clOk')?.addEventListener('click', () => completeStep(run.idx));
    document.getElementById('clShow').onclick = () => { focusPart(st.target, st.view, st.far); setupPip(st); };
    document.getElementById('clBack').onclick = () => goStep(Math.max(0, run.idx - 1));
    document.getElementById('clSkip').onclick = () => goStep(Math.min(run.steps.length, run.idx + 1));
  }
  const list = document.getElementById('clList'); list.innerHTML = '';
  run.list.sections.forEach((sec, si) => {
    const h = document.createElement('h3'); h.textContent = sec.title; list.append(h);
    sec.steps.forEach((x, i) => {
      const k = `${si}.${i}`, idx = run.steps.findIndex(y => y.key === k);
      const b = document.createElement('button'); b.className = (run.done[k] ? 'done ' : '') + (idx === run.idx ? 'cur' : '');
      b.innerHTML = `<span class="mk">${run.done[k] ? '✓' : ''}</span><span>${x.t} — <i>${x.a}</i></span>`;
      b.onclick = () => goStep(idx); list.append(b);
      if (idx === run.idx) setTimeout(() => b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    });
  });
}
function checkRun() {
  if (!run.list) return;
  const st = run.steps[run.idx];
  if (!st || run.done[st.key] || !st.check || camAnim.t < 1 || performance.now() - run.arrived < 900) return;
  try { if (st.check()) completeStep(run.idx); } catch {}
}

// Close-up inset for small parts, and a pulsing ring on the current part
const pipCam = new THREE.PerspectiveCamera(30, 1.4, 0.01, 200);
const pip = { active: false, id: null, dir: null };
function setupPip(st) {
  const el0 = document.getElementById('pip');
  if (st.watch) { pip.active = true; pip.fixed = { pos: new THREE.Vector3(2.2, 3.4, 13.5), target: new THREE.Vector3(0, 1.1, 3.6) }; el0.hidden = false; return; }
  pip.fixed = null;
  const id = st.target, obj = findHot(id);
  const el = document.getElementById('pip');
  if (!obj) { pip.active = false; el.hidden = true; return; }
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).length();
  pip.active = !!st.watch || size < 0.28; pip.id = id;
  pip.dir = st.watch ? new THREE.Vector3(0.35, 0.45, 1).normalize() : null;
  pip.inside = st.view === 'in' && !st.watch;
  pip.size = size;
  el.hidden = !pip.active;
}
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.strokeStyle = '#4fb3ff'; x.lineWidth = 9; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), depthTest: false, transparent: true }));
ring.renderOrder = 999; ring.visible = false; scene.add(ring);
function updateRing(t) {
  const st = run.list && run.steps[run.idx];
  if (!st || run.done[st.key]) { ring.visible = false; return; }
  const obj = findHotCached(st.target); if (!obj) { ring.visible = false; return; }
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  ring.position.copy(c); const k = Math.max(0.035, Math.min(mode === 'cockpit' ? 0.22 : 1.6, size * 0.9)) * (1 + 0.12 * Math.sin(t * 5));
  ring.scale.set(k, k, 1); ring.material.opacity = 0.55 + 0.35 * Math.sin(t * 5); ring.visible = true;
}
const hotCache = new Map();
function findHotCached(id) { if (!hotCache.has(id)) hotCache.set(id, findHot(id)); return hotCache.get(id); }
function renderPip() {
  if (!pip.active || !run.list) return;
  const el = document.getElementById('pip');
  const obj = pip.fixed ? null : findHotCached(pip.id); if (!obj && !pip.fixed) return;
  const w = Math.round(Math.min(340, innerWidth * 0.32)), h = Math.round(w * 0.72);
  el.style.width = w + 'px'; el.style.height = h + 'px';
  const r = el.getBoundingClientRect();
  if (pip.fixed) { pipCam.position.copy(pip.fixed.pos); pipCam.fov = 30; pipCam.aspect = w / h; pipCam.updateProjectionMatrix(); pipCam.lookAt(pip.fixed.target); }
  else {
    const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const dist = Math.max(0.12, Math.min(1.6, pip.size * 1.9));
    const dir = pip.inside ? EYE.clone().sub(c).normalize() : camera.position.clone().sub(c).normalize();
    pipCam.position.copy(c).addScaledVector(dir, dist); if (pipCam.position.y < 0.08) pipCam.position.y = 0.08;
    pipCam.fov = 30; pipCam.aspect = w / h; pipCam.updateProjectionMatrix(); pipCam.lookAt(c);
  }
  renderer.setScissorTest(true);
  renderer.setViewport(r.left, innerHeight - r.bottom, w, h); renderer.setScissor(r.left, innerHeight - r.bottom, w, h);
  renderer.render(scene, pipCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
}

document.querySelectorAll('#viewSeg button').forEach(b => (b.onclick = () => setView(b.dataset.view)));
document.getElementById('btnReset').onclick = () => { resetState(); hideCard(); if (run.list) { run.done = {}; goStep(0); } };

// ---------------- Loop ----------------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const panel = document.body.classList.contains('cl-open') && w > 820 ? Math.min(372, w * 0.4) : 0;
  if (panel) camera.setViewOffset(w, h, -panel / 2, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
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
  checkRun(); updateRing(t);
  renderer.render(scene, camera);
  renderPip();
  requestAnimationFrame(frame);
}
setView('outside', false);
document.getElementById('loading').classList.add('gone');
setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 6000);
requestAnimationFrame(frame);

// For automated checks
window.__pt = { run, startList, CHECKLISTS, goStep, completeStep, camAnim, simulate, THREE, scene, camera, state, setView, focusPart, ext, cpt, renderer, look, pick, ACTIONS, showCard, mode: () => mode };
