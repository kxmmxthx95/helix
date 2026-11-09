import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Detached prototype: bright cartoon overgrown-city scene from standalone GLBs. No app routes/auth/DB.
const errors = []; addEventListener('error', e => errors.push(e.message)); addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const holder = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; holder.append(renderer.domElement);
const scene = new THREE.Scene();
{ const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#56a8e6'); gr.addColorStop(.55, '#a9dcf5'); gr.addColorStop(1, '#eaf7ee'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
scene.fog = new THREE.Fog('#cfeaf2', 45, 120);
scene.add(new THREE.HemisphereLight('#d4ecff', '#9ec055', 2.0));
const sun = new THREE.DirectionalLight('#fff1cf', 2.4); sun.position.set(-14, 26, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 }); sun.shadow.normalBias = .04; sun.shadow.bias = -.0002; scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(32, 1, .5, 220);
const OFFSET = new THREE.Vector3(0, 19, 25);
const STAGES = [
  { name: 'ด่านตัวอย่าง 1 · ทางเข้าเมืองร้าง', desc: 'จุดตัวอย่างบนทางดิน (ไม่ใช่ข้อมูลบทเรียนจริง)', at: [-1, 0, 7] },
  { name: 'ด่านตัวอย่าง 2 · ร้านค้าริมทาง', desc: 'จุดตัวอย่างหน้าร้านและบันได (ไม่ใช่ข้อมูลบทเรียนจริง)', at: [6, 0, 2] },
  { name: 'ด่านตัวอย่าง 3 · สระใต้รูปปั้นยักษ์', desc: 'จุดตัวอย่างปลายทาง (ไม่ใช่ข้อมูลบทเรียนจริง)', at: [6, 0, -4], lookY: 5.5 },
];
let stage = 0; const target = new THREE.Vector3(...STAGES[0].at);
function size() { const w = holder.clientWidth, h = holder.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < .8 ? 46 : 32; camera.updateProjectionMatrix(); }
new ResizeObserver(size).observe(holder); size();
const loader = new GLTFLoader(); const cache = new Map(); const placed = [];
async function get(id) {
  if (!cache.has(id)) { const g = await loader.loadAsync(`/models/overgrown/${id}.glb`);
    g.scene.traverse(o => { if (o.isMesh) { if (!o.geometry.attributes.uv || !o.material.map) throw Error('Incomplete mesh ' + id); o.castShadow = id !== 'ground-grass' && id !== 'ground-path'; o.receiveShadow = true; } });
    cache.set(id, g.scene); }
  return cache.get(id);
}
function put(id, x, y, z, ry = 0, s = 1, rot = null) {
  const o = cache.get(id).clone(true); o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); if (rot) o.rotation.set(rot[0], rot[1], rot[2], 'ZXY');
  scene.add(o); placed.push({ id, p: [x, y, z] }); return o;
}
const IDS = ['ground-grass', 'ground-path', 'statue-head', 'building-ivy-a', 'building-ivy-b', 'building-ivy-c', 'shop-awning', 'van-wrecked', 'car-wrecked', 'stairs-stone', 'pond-small', 'waterfall-stream', 'tree-round', 'bush-round'];
async function boot() {
  for (const id of IDS) await get(id);
  for (let gx = -7; gx <= 6; gx++) for (let gz = -6; gz <= 4; gz++) {
    const x = gx * 8, z = gz * 8; if (x === -8 && gz >= -2) put('ground-path', x, 0, z, 0, 1); else put('ground-grass', x, 0, z, 0, 1);
  }
  // distant / mid-ground ivy towers
  put('building-ivy-a', -12, 0, -14, 0, 1.8); put('building-ivy-b', 15, 0, -17, 0, 1.7); put('building-ivy-c', -17, 0, 0, .25, 1.5);
  put('building-ivy-a', 1, 0, -25, 0, 2.1); put('building-ivy-b', -26, 0, -12, 0, 1.6); put('building-ivy-c', 24, 0, -5, -.2, 1.5);
  // giant head lying on its side
  const head = put('statue-head', 8, 0, -8, 0, 2.6, [-.5, 0, 1.2]);
  head.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(head); head.position.y -= box.min.y + 2.1; // spike tips sink into the ground so the head rests on hair/shoulder
  head.updateMatrixWorld(true); const mouth = head.localToWorld(new THREE.Vector3(0, -.555 + 2.8, 1.05));
  put('pond-small', mouth.x, 0, mouth.z + 1.2, 0, .9);
  const wf = put('waterfall-stream', mouth.x, 0, mouth.z + .1, 0, 1); wf.scale.set(1.2, Math.max(.4, mouth.y / 3.2), 1.2);
  window.__mouth = mouth.toArray();
  put('shop-awning', 9, 0, 6, -.12, 1.6); put('stairs-stone', 3.2, 0, 8, 0, 1.2);
  put('van-wrecked', -9, 0, 9, -.55, 1.5); put('car-wrecked', 12, 0, 14, 2.7, 1.5);
  for (const [x, z, s] of [[-6, -3, 1.2], [-20, 6, 1.4], [18, -1, 1.1], [-4, 15, 1.3], [-22, -4, 1.2], [20, 8, 1.2], [1, -10, 1.1]]) put('tree-round', x, 0, z, Math.random() * 6, s);
  for (const [x, z, s] of [[-3, 6, 1.2], [-11, 4, 1], [6, 12, 1.1], [0, 1, 1], [14, 1, 1.2], [-6, 14, 1], [-15, 9, 1.2], [4, -9, 1.3], [12, -3, 1]]) put('bush-round', x, 0, z, Math.random() * 6, s);
  scene.updateMatrixWorld(true);
  document.querySelector('#status').textContent = `${IDS.length} GLBs · ${placed.length} placements`;
  document.querySelector('#dots').innerHTML = STAGES.map((_, i) => `<button class="dot" data-i="${i}" aria-pressed="${i === 0}">${i + 1}</button>`).join('');
  document.querySelectorAll('.dot').forEach(b => b.addEventListener('click', () => go(+b.dataset.i)));
  go(0, true);
  window.overgrown = { ready: true, errors, ids: IDS, placements: placed.length, get stage() { return stage; }, get cam() { return camera.position.toArray(); }, get target() { return target.toArray(); } };
}
function go(i, jump) {
  stage = (i + STAGES.length) % STAGES.length; goal.set(...STAGES[stage].at);
  document.querySelector('#title').textContent = STAGES[stage].name; document.querySelector('#desc').textContent = STAGES[stage].desc;
  document.querySelectorAll('.dot').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === stage)));
  if (jump || reduce) target.copy(goal);
}
const goal = new THREE.Vector3();
document.querySelector('#prev').addEventListener('click', () => go(stage - 1)); document.querySelector('#next').addEventListener('click', () => go(stage + 1));
renderer.domElement.addEventListener('wheel', e => e.preventDefault(), { passive: false });
const dbg = new URLSearchParams(location.search).get('cam');
let lookY = 2.2;
function loop() { lookY += ((STAGES[stage].lookY ?? 2.2) - lookY) * (reduce ? 1 : .06); if (dbg) { const v = dbg.split(',').map(Number); camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]); renderer.render(scene, camera); requestAnimationFrame(loop); return; } target.lerp(goal, reduce ? 1 : .06); camera.position.copy(target).add(OFFSET); camera.lookAt(target.x, lookY, target.z - 2); renderer.render(scene, camera); requestAnimationFrame(loop); }
boot().then(loop).catch(e => { errors.push(String(e)); document.querySelector('#status').textContent = String(e); console.error(e); });
