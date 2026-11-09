import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildAssetDecor, MAX_LIGHTS, NO_SHADOW, pathCentre, planDecor, templeLayout, TEMPLE_SCALE, type AssetId } from "./forestAssets";
import { stageZs } from "./ForestWorld";

const lcg = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const plan = (n: number, seed = 93271) => { const zs = stageZs(n); const zFar = zs[zs.length - 1]! - 28; return { zs, zFar, spots: planDecor(zs, zFar, lcg(seed)) }; };
const GROUND_COVER = new Set<AssetId>(["fern-bush", "moonflower", "golden-crozier-small", "blue-heart-small", "moss-low-patch", "thorn-root-hook"]);

describe("planDecor", () => {
  it("is deterministic for the same rng seed", () => {
    expect(plan(5).spots).toEqual(plan(5).spots);
    expect(plan(5, 1).spots).not.toEqual(plan(5, 2).spots);
  });
  it("only references GLBs that exist in the Moonfen pack and manifest", () => {
    const dir = path.resolve(__dirname, "../../../public/models/moonfen");
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { assets: { id: string }[] };
    const known = new Set(manifest.assets.map((a) => a.id));
    for (const id of new Set(plan(8).spots.map((s) => s.id))) {
      expect(known.has(id), id).toBe(true);
      expect(fs.existsSync(path.join(dir, `${id}.glb`)), id).toBe(true);
    }
  });
  it("keeps ground cover and trees off the trail and out of the temple platform", () => {
    const { zs, spots } = plan(6);
    const T = templeLayout(zs[zs.length - 1]!);
    for (const sp of spots) {
      const dx = Math.abs(sp.x - pathCentre(sp.z));
      if (GROUND_COVER.has(sp.id)) expect(dx, sp.id).toBeGreaterThanOrEqual(2.99);
      if (sp.id === "elder-canopy" || sp.id === "young-canopy" || sp.id === "gnarled-tree" || sp.id === "tiered-pine") {
        expect(dx, sp.id).toBeGreaterThanOrEqual(5.6);
        const inside = sp.z > T.back && sp.z < T.front && Math.abs(sp.x - T.x) < 9.5;
        expect(inside, `${sp.id} inside temple`).toBe(false);
      }
    }
  });
  it("closes the stairs/plaza seam, places one temple, and caps lights", () => {
    const { zs, spots } = plan(5);
    const T = templeLayout(zs[zs.length - 1]!);
    const stairs = spots.filter((s) => s.id === "temple-stairs"), plaza = spots.filter((s) => s.id === "temple-plaza");
    expect(stairs).toHaveLength(1); expect(plaza).toHaveLength(1);
    expect(stairs[0]!.s).toBe(TEMPLE_SCALE); expect(plaza[0]!.s).toBe(TEMPLE_SCALE);
    expect(stairs[0]!.z - plaza[0]!.z).toBeCloseTo(3 * TEMPLE_SCALE, 6);
    expect(stairs[0]!.z).toBeLessThan(zs[zs.length - 1]!);
    expect(plaza[0]!.z).toBeCloseTo(T.plazaZ, 6);
    expect(spots.filter((s) => s.light).length).toBeLessThanOrEqual(MAX_LIGHTS);
    expect(spots.filter((s) => s.id === "ruined-gateway")).toHaveLength(1);
  });
  it("puts one crystal group at every stage and arches between stage pairs", () => {
    const { zs, spots } = plan(7);
    expect(spots.filter((s) => s.id === "teal-grove-large" || s.id === "teal-cluster-small")).toHaveLength(zs.length);
    expect(spots.filter((s) => s.id === "living-arch")).toHaveLength(Math.ceil((zs.length - 1) / 2));
  });
  it("keeps the instance budget bounded as the world grows", () => {
    const small = plan(3).spots.length, big = plan(40).spots.length;
    expect(small).toBeGreaterThan(40);
    expect(big).toBeLessThan(small * 6);
  });
});

describe("buildAssetDecor", () => {
  const tpl = (id: AssetId, parts = 2) => {
    const root = new THREE.Group();
    for (let i = 0; i < parts; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()); m.position.set(i, 0, 0); root.add(m); }
    return { id, root };
  };
  it("builds one InstancedMesh per sub-mesh and z-chunk, composing placement with the sub-mesh transform", () => {
    const spots = [
      { id: "elder-canopy" as AssetId, x: 10, y: 0, z: -40, ry: 0, s: 2 },
      { id: "elder-canopy" as AssetId, x: 12, y: 0, z: -39, ry: 0, s: 1 },
      { id: "elder-canopy" as AssetId, x: 0, y: 0, z: 20, ry: 0, s: 1 },
    ];
    const decor = buildAssetDecor(spots, [tpl("elder-canopy")], -44);
    expect(decor.meshes).toHaveLength(4);            // 2 sub-meshes × 2 chunks
    expect(decor.meshes.map((m) => m.count).sort()).toEqual([1, 1, 2, 2]);
    const near = decor.meshes.find((m) => m.count === 2)!; const mat = new THREE.Matrix4(); near.getMatrixAt(0, mat);
    const p = new THREE.Vector3().setFromMatrixPosition(mat);
    expect(p.x).toBeCloseTo(10 + 2 * (near.geometry === decor.meshes[0]!.geometry ? 0 : 1), 5);
    expect(near.boundingSphere).not.toBeNull();
    decor.dispose();
  });
  it("skips shadow casting for ground cover only and reports capped light positions", () => {
    const spots = [
      { id: "moonflower" as AssetId, x: 0, y: 0, z: 0, ry: 0, s: 1 },
      { id: "elder-canopy" as AssetId, x: 0, y: 0, z: 0, ry: 0, s: 1 },
      { id: "teal-grove-large" as AssetId, x: 3, y: 1, z: 4, ry: 0, s: 2, light: true },
    ];
    expect(NO_SHADOW.has("moonflower")).toBe(true); expect(NO_SHADOW.has("elder-canopy")).toBe(false);
    const decor = buildAssetDecor(spots, [tpl("moonflower", 1), tpl("elder-canopy", 1), tpl("teal-grove-large", 1)], -10);
    const by = (id: AssetId) => decor.meshes.filter((m) => m.userData && m.castShadow === !NO_SHADOW.has(id));
    expect(by("moonflower").length).toBeGreaterThan(0);
    expect(decor.meshes.filter((m) => !m.castShadow)).toHaveLength(1);
    expect(decor.lights).toHaveLength(1);
    expect(decor.lights[0]!.toArray()).toEqual([3, 1 + 0.9 * 2, 4]);
    decor.dispose();
  });
});
