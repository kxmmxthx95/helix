import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildAssetDecor, loadTemplates, MAX_LIGHTS, planDecor, type AssetDecor, type AssetId } from "./forestAssets";

/**
 * Fixed-camera 3D forest used by the study map (ported from the approved forest prototype).
 * Everything is authored here: no external model/texture requests, no data access.
 * Camera angle and scale never change; only the focus point eases along the trail.
 */
export type StagePoint = { x: number; y: number; hidden: boolean };
export type ForestWorld = {
  focus(index: number, immediate?: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
  readonly stageZ: number[];
  /** Resolves when the decor is in place: "assets" (GLB pack) or "fallback" (procedural forest). Never rejects. */
  readonly ready: Promise<"assets" | "fallback">;
};
export type ForestWorldOptions = {
  stageCount: number;
  reducedMotion: () => boolean;
  onFrame: (points: StagePoint[]) => void;
};

export const pathX = (z: number) => Math.sin(z * 0.16) * 1.6;
const START_Z = 8;

/** Trail spacing: 6 m up to ~9 stages, then tightens (never below 3.2 m) so the world stays bounded. */
export function stageSpacing(count: number) {
  return count <= 1 ? 6 : Math.min(6, Math.max(3.2, 48 / (count - 1)));
}
export const stageZs = (count: number) => Array.from({ length: Math.max(count, 1) }, (_, i) => START_Z - stageSpacing(count) * i);

export function createForestWorld(canvas: HTMLCanvasElement, opts: ForestWorldOptions): ForestWorld {
  const count = Math.max(opts.stageCount, 1);
  const zs = stageZs(count);
  const zLast = zs[zs.length - 1]!;
  const templeZ = zLast - 12; // fallback temple centred 12 m past the last stage; the asset temple ends ~19 m past it
  const dz = templeZ + 19;
  const zFar = templeZ - 16; // far end of the playable world

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#163930");
  scene.fog = new THREE.FogExp2("#24483d", 0.019);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const camera = new THREE.OrthographicCamera(-14, 14, 10, -10, 0.1, 130);
  const focusPos = new THREE.Vector3(pathX(zs[0]!), 0, zs[0]! - 3);
  const targetFocus = focusPos.clone();
  const cameraOffset = new THREE.Vector3(12, 17, 22);
  scene.add(new THREE.HemisphereLight("#b4d5c4", "#162d24", 1.2));
  const sun = new THREE.DirectionalLight("#fff1bd", 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target, new THREE.AmbientLight("#4a9c93", 0.25));

  let seed = 93271;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const between = (a: number, b: number) => a + rand() * (b - a);

  const mats = {
    bark: new THREE.MeshStandardMaterial({ color: "#544e31", roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: "#617b64", roughness: 1, flatShading: true }),
    darkStone: new THREE.MeshStandardMaterial({ color: "#344e44", roughness: 1, flatShading: true }),
    moss: new THREE.MeshStandardMaterial({ color: "#678340", roughness: 1 }),
    crystal: new THREE.MeshStandardMaterial({ color: "#57dbc3", emissive: "#0fc6aa", emissiveIntensity: 0.38, roughness: 0.25, metalness: 0.15, flatShading: true }),
  };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rock = new THREE.IcosahedronGeometry(1, 1);
  const branch = (points: THREE.Vector3[], radius: number, material: THREE.Material = mats.bark) =>
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 6, false), material, 0, 0, 0);

  // ---- painted ground (dirt trail, lichen, leaf litter). Texture length follows the world length.
  const zMax = 29, zMin = zFar - 6, zc = (zMax + zMin) / 2, L = zMax - zMin, W = 100;
  const paint = document.createElement("canvas"); paint.width = 2048; paint.height = Math.min(6144, Math.max(2048, Math.round((2048 * L) / W)));
  const ctx = paint.getContext("2d")!; ctx.fillStyle = "#314c2c"; ctx.fillRect(0, 0, paint.width, paint.height);
  const strokes = Math.round((130000 * paint.height) / 2048);
  for (let i = 0; i < strokes; i++) {
    const x = rand() * paint.width, y = rand() * paint.height; const z = zc - (y / paint.height - 0.5) * L; const wx = (x / paint.width - 0.5) * W;
    const trail = Math.abs(wx - pathX(z)) < 2.25 + Math.sin(z * 1.7) * 0.12;
    const colors = trail ? ["#7e7651", "#978458", "#a38d61", "#6f714b", "#8c8059"] : ["#365a32", "#425f34", "#25482d", "#54703a", "#667c3b"];
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!; ctx.globalAlpha = between(0.15, 0.55);
    ctx.beginPath(); ctx.ellipse(x, y, between(1, 9), between(1, 5), rand() * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const groundTex = new THREE.CanvasTexture(paint); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = 8;
  const ground = mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }), 0, -0.08, zc);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  for (let i = 0; i < Math.round(7.5 * L); i++) {
    const z = between(zMin + 3, zMax - 5), x = pathX(z) + between(-1.95, 1.95);
    const p = mesh(rock, rand() > 0.45 ? mats.stone : mats.darkStone, x, 0.015, z, between(0.18, 0.55), between(0.045, 0.09), between(0.22, 0.55)); p.rotation.y = rand() * 6;
  }

  const canopyPalette = Array.from({ length: 10 }, (_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.28 + i * 0.006, 0.32, 0.13 + i * 0.009), roughness: 1 }));
  const glows: THREE.PointLight[] = [];
  let inst: THREE.InstancedMesh | undefined;

  // ---- procedural fallback decor (used only if the GLB assets cannot be loaded)
  function buildProcedural() {
    // ---- foliage
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0.12, 0.45, 0, 0.22, 1.2, 0, 0, 0, 0, 0.22, 1.2, 0.5, 0.12, 0.45, -0.5, 0.12, 0.45, 0, 0.12, 0.65, 0, 0.22, 1.2, 0.5, 0.12, 0.45, 0, 0.22, 1.2, 0, 0.12, 0.65], 3));
    leafGeo.computeVertexNormals();
    const leaves: { p: THREE.Vector3; s: number; r: THREE.Euler; c: THREE.Color }[] = [];
    const leaf = (x: number, y: number, z: number, s: number, angle: number, color: THREE.Color) =>
      leaves.push({ p: new THREE.Vector3(x, y, z), s, r: new THREE.Euler(between(-0.5, 0.4), angle, between(-0.4, 0.4)), c: color });
    function tree(x: number, z: number, h: number) {
      const lean = between(-0.6, 0.6);
      branch([new THREE.Vector3(x, 0, z), new THREE.Vector3(x - 0.15, h * 0.35, z + 0.1), new THREE.Vector3(x + lean, h * 0.8, z)], h * 0.065);
      for (let i = 0; i < 5; i++) { const a = i * 1.256 + rand() * 0.4; branch([new THREE.Vector3(x + Math.cos(a) * 1.2, 0.04, z + Math.sin(a) * 1.2), new THREE.Vector3(x + Math.cos(a) * 0.4, 0.3, z + Math.sin(a) * 0.4), new THREE.Vector3(x, h * 0.3, z)], 0.13); }
      for (let level = 0; level < 3; level++) {
        const cy = h * (0.66 + level * 0.17), radius = h * (0.34 - level * 0.065);
        for (let j = 0; j < 4; j++) {
          const a = j * 1.57 + level * 0.8, cx = x + Math.cos(a) * radius * 0.55, cz = z + Math.sin(a) * radius * 0.55;
          branch([new THREE.Vector3(x, cy - 0.9, z), new THREE.Vector3(cx, cy - 0.3, cz), new THREE.Vector3(cx, cy, cz)], 0.12);
          const g = new THREE.IcosahedronGeometry(1, 2); const pos = g.getAttribute("position");
          for (let k = 0; k < pos.count; k++) { const v = new THREE.Vector3().fromBufferAttribute(pos, k); v.multiplyScalar(between(0.87, 1.13)); pos.setXYZ(k, v.x, v.y, v.z); }
          g.computeVertexNormals();
          mesh(g, canopyPalette[Math.floor(rand() * canopyPalette.length)]!, cx, cy, cz, radius, 0.65, radius * 0.8);
          for (let k = 0; k < 42; k++) {
            const a2 = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
            leaf(cx + Math.cos(a2) * r, cy + 0.6 * Math.sqrt(Math.max(0, 1 - (r * r) / (radius * radius))), cz + Math.sin(a2) * r, between(0.15, 0.32), a2, new THREE.Color().setHSL(between(0.27, 0.35), between(0.28, 0.5), between(0.2, 0.39)));
          }
        }
      }
    }
    for (let z = zFar - 8; z < 29; z += 3.8) for (const side of [-1, 1]) for (let row = 0; row < 3; row++)
      tree(pathX(z) + side * (5.6 + row * 3.8 + between(-0.6, 0.6)), z + between(-1, 1), between(3.2, 5.2) + row * 0.65);
    for (let i = 0; i < Math.round(6.7 * (29 - zFar)); i++) {
      const z = between(zFar - 4, 24), side = rand() > 0.5 ? 1 : -1, x = pathX(z) + side * between(2.5, 6.5), s = between(0.35, 0.85);
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2; const col = new THREE.Color().setHSL(between(0.25, 0.43), 0.4, between(0.2, 0.36));
        leaf(x, 0.13, z, s, a, col);
        for (let k = 1; k < 5; k++) { const d = k * s * 0.2; leaf(x + Math.sin(a) * d, 0.12 + Math.sin((k / 5) * Math.PI) * s * 0.5, z + Math.cos(a) * d, s * 0.28, a + 0.8, col); leaf(x + Math.sin(a) * d, 0.12 + Math.sin((k / 5) * Math.PI) * s * 0.5, z + Math.cos(a) * d, s * 0.28, a - 0.8, col); }
      }
      if (i % 5 === 0) { const o = mesh(rock, mats.darkStone, x, 0.28, z, between(0.4, 0.8), between(0.3, 0.6), between(0.4, 0.8)); o.rotation.set(rand(), rand(), rand()); mesh(rock, mats.moss, x, 0.57, z, 0.43, 0.12, 0.38); }
    }

    // ---- vine arches between every other pair of stages
    for (let i = 0; i < count - 1; i += 2) {
      const z = zs[i]! - Math.min(3, stageSpacing(count) / 2), x = pathX(z); const points: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) { const a = Math.PI - (k / 12) * Math.PI; points.push(new THREE.Vector3(x + Math.cos(a) * 3.8, Math.sin(a) * 4.4 + 0.15, z + Math.sin(a * 2) * 0.32)); }
      branch(points, 0.29, mats.bark);
      const vine: THREE.Vector3[] = []; for (let k = 0; k <= 70; k++) { const a = Math.PI - (k / 70) * Math.PI; vine.push(new THREE.Vector3(x + Math.cos(a) * 3.8 + Math.sin(k * 0.7) * 0.2, Math.sin(a) * 4.4 + 0.2 + Math.cos(k * 0.7) * 0.2, z + Math.sin(a * 2) * 0.32 + Math.cos(k * 0.7) * 0.2)); }
      branch(vine, 0.09, mats.moss);
      for (let k = 0; k < 150; k++) { const a = rand() * Math.PI; leaf(x + Math.cos(a) * 3.8 + between(-0.3, 0.3), Math.sin(a) * 4.4 + 0.3, z + between(-0.35, 0.35), between(0.25, 0.55), rand() * 6, new THREE.Color().setHSL(0.24, 0.43, between(0.27, 0.43))); }
    }

    // ---- temple stairway at the end of the trail
    const tz = -19 + dz, tx = pathX(tz);
    for (let step = 0; step < 10; step++) {
      mesh(box, mats.darkStone, tx, step * 0.18, -16 + dz - step * 0.45, 5.8, 0.25, 0.6);
      mesh(box, mats.stone, tx, step * 0.18 + 0.13, -16 + dz - step * 0.45, 5.9, 0.07, 0.62);
    }
    mesh(box, mats.darkStone, tx, 1.7, tz - 1, 7, 0.45, 4);
    for (const side of [-1, 1]) {
      const x = tx + side * 2.75;
      mesh(box, mats.darkStone, x, 0.8, -18 + dz, 0.65, 1.6, 5.4); mesh(box, mats.stone, x, 1.65, -18 + dz, 0.85, 0.15, 5.7);
      for (const z of [-19.8 + dz, -22 + dz]) {
        const height = z === -22 + dz && side === 1 ? 2.5 : 4.1;
        mesh(box, mats.stone, x, 2.05, z, 1, 0.35, 1);
        for (let k = 0; k < height / 0.42; k++) { const o = mesh(box, k % 3 === 0 ? mats.darkStone : mats.stone, x, 2.3 + k * 0.42, z, 0.65, 0.4, 0.7); o.rotation.y = between(-0.025, 0.025); }
        for (const y of [2.5, 4.2, 5.9]) if (y < height + 2) mesh(box, mats.stone, x, y, z, 0.85, 0.18, 0.9);
        const vine: THREE.Vector3[] = []; for (let i = 0; i < 35; i++) { const a = i * 0.3; vine.push(new THREE.Vector3(x + Math.sin(a) * 0.42, 2 + i * 0.095, z + Math.cos(a) * 0.45)); }
        branch(vine, 0.055, mats.moss);
      }
    }
    mesh(box, mats.darkStone, tx, 6.4, -19.8 + dz, 6.6, 0.55, 1.1); mesh(box, mats.stone, tx, 6.7, -19.8 + dz, 7, 0.14, 1.35);
    for (let i = 0; i < 45; i++) leaf(tx + between(-3.5, 3.5), 6.8, -19.8 + dz + between(-0.5, 0.5), between(0.3, 0.7), rand() * 6, new THREE.Color("#6b8d48"));

    // ---- crystals (lights capped for mobile)
    const cv: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = ((i + 1) / 6) * Math.PI * 2;
      cv.push(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27, Math.cos(b) * 0.27, 0, Math.sin(b) * 0.27, Math.cos(a) * 0.23, 0.75, Math.sin(a) * 0.23,
        Math.cos(b) * 0.27, 0, Math.sin(b) * 0.27, Math.cos(b) * 0.23, 0.75, Math.sin(b) * 0.23, Math.cos(a) * 0.23, 0.75, Math.sin(a) * 0.23,
        Math.cos(a) * 0.23, 0.75, Math.sin(a) * 0.23, Math.cos(b) * 0.23, 0.75, Math.sin(b) * 0.23, 0.08, 1.25, -0.04);
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cv, 3)); cg.computeVertexNormals();
    const crystalSpots: [number, number][] = zs.map((z, i) => [(i % 2 ? 1 : -1) * 3.7 + pathX(z + 1), z + 1]);
    crystalSpots.push([-3.2 + pathX(tz + 5), tz + 5], [3 + pathX(tz + 5), tz + 6]);
    crystalSpots.forEach(([x, z], idx) => {
      mesh(rock, mats.darkStone, x, 0.15, z, 1, 0.3, 0.8);
      for (let j = 0; j < 7; j++) { const s = between(0.35, 1.15); const c = mesh(cg, mats.crystal, x + between(-0.6, 0.6), 0.25, z + between(-0.5, 0.5), s, s, s); c.rotation.set(between(-0.3, 0.3), rand() * 6, between(-0.4, 0.4)); }
      if (idx < 6) { const light = new THREE.PointLight("#50f5d5", 4, 5, 2); light.position.set(x, 1, z); scene.add(light); glows.push(light); }
    });

    const im = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: "#436b42", side: THREE.DoubleSide, roughness: 1 }), leaves.length);
    const dummy = new THREE.Object3D();
    leaves.forEach((l, i) => { dummy.position.copy(l.p); dummy.scale.setScalar(l.s); dummy.rotation.copy(l.r); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, l.c); });
    im.receiveShadow = true; scene.add(im); inst = im;

  }

  // ---- bake static meshes by material to cut draw calls
  function bake() {

    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    scene.children.forEach((o) => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o !== ground && !Array.isArray(o.material)) { const list = batches.get(o.material) || []; list.push(o); batches.set(o.material, list); } });
    for (const [material, objects] of batches) {
      if (objects.length < 2) continue;
      const geos = objects.map((o) => { o.updateMatrix(); const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); return g.applyMatrix4(o.matrix); });
      const merged = mergeGeometries(geos); geos.forEach((g) => g.dispose()); if (!merged) continue;
      const baked = new THREE.Mesh(merged, material); baked.castShadow = true; baked.receiveShadow = true; scene.add(baked);
      objects.forEach((o) => { scene.remove(o); o.geometry.dispose(); });
    }

  }

  let decor: AssetDecor | undefined;
  async function loadDecor(): Promise<"assets" | "fallback"> {
    try {
      const spots = planDecor(zs, zFar, rand);
      const ids = [...new Set(spots.map((sp) => sp.id))] as AssetId[];
      const templates = await loadTemplates(ids);
      if (disposed) { buildAssetDecor([], templates, zFar).dispose(); return "assets"; }
      decor = buildAssetDecor(spots, templates, zFar);
      decor.meshes.forEach((m) => scene.add(m));
      decor.lights.slice(0, MAX_LIGHTS).forEach((p) => { const light = new THREE.PointLight("#50f5d5", 4, 5, 2); light.position.copy(p); scene.add(light); glows.push(light); });
      bake();
      return "assets";
    } catch (err) {
      if (disposed) return "fallback";
      console.warn("Forest assets unavailable, using procedural forest", err);
      buildProcedural(); bake();
      return "fallback";
    }
  }

  const moteCanvas = document.createElement("canvas"); moteCanvas.width = moteCanvas.height = 32;
  const mc = moteCanvas.getContext("2d")!; const mg = mc.createRadialGradient(16, 16, 0, 16, 16, 16);
  mg.addColorStop(0, "#fff9c6"); mg.addColorStop(0.2, "#c8f3a9"); mg.addColorStop(1, "#c8f3a900"); mc.fillStyle = mg; mc.fillRect(0, 0, 32, 32);
  const moteN = Math.round(100 * Math.max(1, (29 - zFar) / 45));
  const motePositions = new Float32Array(moteN * 3);
  for (let i = 0; i < moteN; i++) { motePositions[i * 3] = between(-7, 7); motePositions[i * 3 + 1] = between(0.5, 5); motePositions[i * 3 + 2] = between(zFar, 20); }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(moteCanvas), transparent: true, depthWrite: false, size: 0.11, opacity: 0.7, blending: THREE.AdditiveBlending }));
  scene.add(motes);

  let width = 1, height = 1;
  function resize(w: number, h: number) {
    width = Math.max(1, w); height = Math.max(1, h); renderer.setSize(width, height, false);
    const halfH = width < 600 ? 12 : 10; camera.left = (-halfH * width) / height; camera.right = (halfH * width) / height; camera.top = halfH; camera.bottom = -halfH; camera.updateProjectionMatrix();
  }
  function focus(index: number, immediate = false) {
    const i = Math.max(0, Math.min(count - 1, index)); // the last stage looks a little further up the trail so the temple at its end is framed
    targetFocus.set(pathX(zs[i]!), 0, zs[i]! - (i === count - 1 && count > 1 ? 5 : 3));
    if (immediate || opts.reducedMotion()) focusPos.copy(targetFocus);
  }

  let raf = 0, previous = 0, disposed = false;
  const v = new THREE.Vector3();
  function frame(time: number) {
    if (disposed) return;
    const dt = Math.min((time - previous) / 1000, 0.05); previous = time;
    const reduced = opts.reducedMotion();
    focusPos.lerp(targetFocus, reduced ? 1 : 1 - Math.exp(-dt * 4));
    camera.position.copy(focusPos).add(cameraOffset); camera.lookAt(focusPos); camera.updateMatrixWorld();
    sun.position.set(focusPos.x - 8, 20, focusPos.z + 6); sun.target.position.copy(focusPos); sun.target.updateMatrixWorld();
    if (!reduced) { motes.position.y = Math.sin(time * 0.00025) * 0.15; glows.forEach((l, i) => (l.intensity = 4 + Math.sin(time * 0.001 + i) * 0.35)); }
    else { motes.position.y = 0; glows.forEach((l) => (l.intensity = 4)); }
    opts.onFrame(zs.map((z) => { v.set(pathX(z), 0.25, z).project(camera); return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, hidden: v.x < -1 || v.x > 1 || v.y < -0.45 || v.y > 0.65 }; }));
    renderer.render(scene, camera); raf = requestAnimationFrame(frame);
  }
  resize(canvas.clientWidth || 800, canvas.clientHeight || 500); focus(0, true); raf = requestAnimationFrame(frame);
  const ready = loadDecor();

  return {
    focus, resize, stageZ: zs, ready,
    dispose() {
      disposed = true; cancelAnimationFrame(raf);
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      Object.values(mats).forEach((m) => m.dispose()); canopyPalette.forEach((m) => m.dispose()); groundTex.dispose();
      decor?.dispose(); (inst?.material as THREE.Material | undefined)?.dispose(); (motes.material as THREE.PointsMaterial).map?.dispose(); (motes.material as THREE.Material).dispose();
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
