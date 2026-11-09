import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Asset-based decor for the forest map: places the Moonfen GLB pack (public/models/moonfen) along the trail.
 * `planDecor` is pure (deterministic from the supplied rng); `buildAssetDecor` turns the plan into chunked
 * InstancedMeshes so the fixed camera only draws the stretch of forest that is in view.
 */
export type AssetId =
  | "elder-canopy" | "young-canopy" | "gnarled-tree" | "tiered-pine"
  | "fern-bush" | "moonflower" | "golden-crozier-small" | "blue-heart-small" | "moss-low-patch" | "thorn-root-hook"
  | "mossy-rocks" | "moss-boulder-group" | "moss-standing-rock" | "teal-grove-large" | "teal-cluster-small"
  | "living-arch" | "temple-plaza" | "temple-stairs" | "ruined-gateway" | "ruined-column"
  | "temple-cyan-pedestal" | "temple-broken-wall" | "temple-rubble";

export type Spot = { id: AssetId; x: number; y: number; z: number; ry: number; s: number; light?: boolean };

export const MODEL_PATH = "models/moonfen/";
export const TEMPLE_SCALE = 2.4;
const CHUNK = 14;
export const MAX_LIGHTS = 6;
/** Small ground cover does not cast shadows: it saves a large share of the shadow pass for little visual loss. */
export const NO_SHADOW: ReadonlySet<AssetId> = new Set<AssetId>(["fern-bush", "moonflower", "golden-crozier-small", "blue-heart-small", "moss-low-patch", "thorn-root-hook", "temple-rubble"]);

export const pathCentre = (z: number) => Math.sin(z * 0.16) * 1.6;
const pathSlope = (z: number) => 0.16 * 1.6 * Math.cos(z * 0.16);

/** Where the temple sits relative to the last stage. Exported so the world can keep its camera/limits consistent. */
export function templeLayout(zLast: number) {
  const S = TEMPLE_SCALE;
  const stairsZ = zLast - 7;
  const plazaZ = stairsZ - 3 * S;
  return { S, stairsZ, plazaZ, front: stairsZ + S + 1, back: plazaZ - 2 * S - 2, x: pathCentre(stairsZ) };
}

export function planDecor(zs: number[], zFar: number, rand: () => number): Spot[] {
  const between = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T,>(items: [T, number][]): T => {
    let t = rand() * items.reduce((n, [, w]) => n + w, 0);
    for (const [v, w] of items) { t -= w; if (t <= 0) return v; }
    return items[items.length - 1]![0];
  };
  const spots: Spot[] = [];
  const add = (id: AssetId, x: number, z: number, s: number, o: Partial<Spot> = {}) =>
    spots.push({ id, x, z, y: 0, ry: rand() * Math.PI * 2, s, ...o });

  const zLast = zs[zs.length - 1]!;
  const T = templeLayout(zLast);
  const inTemple = (x: number, z: number) => z > T.back && z < T.front && Math.abs(x - T.x) < 9.5;
  const zMax = 29;

  // trees: three rows each side of the trail, clear of the path and of the temple platform
  for (let z = zFar - 8; z < zMax; z += 5.4) for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    if (rand() < (row === 0 ? 0.12 : row === 1 ? 0.3 : 0.4)) continue;
    const zz = z + between(-1.4, 1.4), x = pathCentre(zz) + side * (6.4 + row * 4.4 + between(-0.7, 0.7));
    if (inTemple(x, zz)) continue;
    const id: AssetId = row === 0 ? (rand() < 0.5 ? "elder-canopy" : "young-canopy")
      : row === 1 ? pick<AssetId>([["young-canopy", 3], ["gnarled-tree", 5], ["tiered-pine", 2]]) : pick<AssetId>([["gnarled-tree", 3], ["elder-canopy", 2]]);
    add(id, x, zz, row === 0 ? between(1.5, 2.0) : row === 1 ? between(1.8, 2.4) : between(2.2, 2.8));
  }
  // undergrowth along the trail edge
  for (let z = zFar - 4; z < 26; z += 2.2) for (const side of [-1, 1]) {
    if (rand() < 0.3) continue;
    const x = pathCentre(z) + side * between(3.0, 6.8);
    if (inTemple(x, z)) continue;
    add(pick<AssetId>([["fern-bush", 1], ["moonflower", 4], ["golden-crozier-small", 1], ["blue-heart-small", 1], ["moss-low-patch", 4], ["thorn-root-hook", 2]]), x, z, between(0.9, 1.5));
  }
  // boulders
  for (let z = zFar - 2; z < 26; z += 6) for (const side of [-1, 1]) {
    const x = pathCentre(z) + side * between(4, 9);
    if (inTemple(x, z)) continue;
    add(pick<AssetId>([["mossy-rocks", 3], ["moss-boulder-group", 3], ["moss-standing-rock", 2]]), x, z, between(1.1, 2.0));
  }
  // crystals at every stage (first few carry a light)
  let lights = 0;
  zs.forEach((z, i) => {
    const zz = z + 1, x = (i % 2 ? 1 : -1) * 3.7 + pathCentre(zz);
    add(i % 2 ? "teal-cluster-small" : "teal-grove-large", x, zz, 1.4, { light: lights++ < 4 });
  });
  // vine arches over the trail between stages
  const spacing = zs.length > 1 ? zs[0]! - zs[1]! : 6;
  for (let i = 0; i < zs.length - 1; i += 2) {
    const z = zs[i]! - Math.min(3, spacing / 2);
    add("living-arch", pathCentre(z), z, 2.4, { ry: Math.atan(pathSlope(z)) });
  }
  // temple: stairs climb toward -z onto a plaza, with a gateway, columns and cyan pedestals
  const { S, stairsZ, plazaZ, x } = T;
  const top = S; // stairs and plaza share a 1-unit height, so the seam closes at scale S
  add("temple-stairs", x, stairsZ, S, { ry: 0 });
  add("temple-plaza", x, plazaZ, S, { ry: 0 });
  add("ruined-gateway", x - 0.55 * S, plazaZ - 2 * S + 1.6, S, { y: top, ry: 0 });
  for (const side of [-1, 1]) {
    add("ruined-column", x + side * 4, plazaZ + 2 * S - 1.4, 2.2, { y: top });
    add("ruined-column", x + side * 4.2, plazaZ - 1, 2.0, { y: top });
    add("temple-cyan-pedestal", x + side * 2.3, plazaZ + 2 * S - 0.9, 1.5, { y: top, ry: 0, light: lights++ < MAX_LIGHTS });
    add("temple-cyan-pedestal", x + side * (S + 1.2), stairsZ + S + 0.5, 1.5, { ry: 0, light: lights++ < MAX_LIGHTS });
    add("temple-broken-wall", x + side * (2 * S + 0.6), plazaZ + 1.5, S, { ry: Math.PI / 2 });
    add("temple-rubble", x + side * (S + 2.3), stairsZ - 0.5, 1.8);
  }
  return spots;
}

type Template = { id: AssetId; root: THREE.Object3D };
export type AssetDecor = { meshes: THREE.InstancedMesh[]; lights: THREE.Vector3[]; dispose(): void };

/** Instantiate a plan into chunked InstancedMeshes (one per sub-mesh and 14 m z-chunk). */
export function buildAssetDecor(spots: Spot[], templates: Template[], zFar: number): AssetDecor {
  const byId = new Map(templates.map((t) => [t.id, t.root]));
  const parts = new Map<AssetId, { mesh: THREE.Mesh; local: THREE.Matrix4 }[]>();
  for (const [id, root] of byId) {
    root.updateMatrixWorld(true);
    const list: { mesh: THREE.Mesh; local: THREE.Matrix4 }[] = [];
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) list.push({ mesh: m, local: m.matrixWorld.clone() }); });
    parts.set(id, list);
  }
  const buckets = new Map<string, { id: AssetId; mesh: THREE.Mesh; mats: THREE.Matrix4[] }>();
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const lights: THREE.Vector3[] = [];
  for (const sp of spots) {
    const list = parts.get(sp.id); if (!list) continue;
    M.compose(new THREE.Vector3(sp.x, sp.y, sp.z), q.setFromAxisAngle(up, sp.ry), new THREE.Vector3(sp.s, sp.s, sp.s));
    if (sp.light) lights.push(new THREE.Vector3(sp.x, sp.y + 0.9 * sp.s, sp.z));
    const chunk = Math.max(0, Math.floor((sp.z - zFar) / CHUNK));
    list.forEach((part, k) => {
      const key = `${sp.id}|${k}|${chunk}`;
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { id: sp.id, mesh: part.mesh, mats: [] }));
      b.mats.push(new THREE.Matrix4().multiplyMatrices(M, part.local));
    });
  }
  const meshes: THREE.InstancedMesh[] = [];
  for (const { id, mesh, mats } of buckets.values()) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.castShadow = !NO_SHADOW.has(id); im.receiveShadow = true; im.computeBoundingSphere();
    meshes.push(im);
  }
  return {
    meshes, lights,
    dispose() {
      const seen = new Set<unknown>();
      for (const root of byId.values()) root.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (seen.has(mat)) continue; seen.add(mat);
          const std = mat as THREE.MeshStandardMaterial;
          std.map?.dispose(); std.normalMap?.dispose(); std.roughnessMap?.dispose(); std.emissiveMap?.dispose(); mat.dispose();
        }
      });
      meshes.forEach((m) => m.dispose());
    },
  };
}

export async function loadTemplates(ids: AssetId[], baseUrl = import.meta.env.BASE_URL): Promise<Template[]> {
  const loader = new GLTFLoader();
  return Promise.all(ids.map(async (id) => {
    const gltf = await loader.loadAsync(`${baseUrl}${MODEL_PATH}${id}.glb`);
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.geometry.attributes.uv) throw new Error(`Asset ${id} has no UVs`); });
    return { id, root: gltf.scene };
  }));
}
