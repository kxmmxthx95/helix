import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { groundAt, rng, ZOOM } from "@/components/scene/iso";
import { Arch, Bush, Crystal, Mushroom, Pine, Rock, Tree, Willow } from "@/components/scene/models";

export type SceneRow = { off: number; y: number }; // off: % of the (max 448px) list width from centre; y: px from the scene's top

type Props = { seed: string; rows: SceneRow[]; accent: string; theme: string };
const LIST_W = 448; // keep in sync with the list's max-w-md
type Kind = "tree" | "pine" | "willow" | "bush" | "mushroom" | "rock" | "crystal";
type Decor = { kind: Kind; pos: [number, number]; rot: number; scale: number };
type Built = { tiles: [number, number][]; decor: Decor[]; arches: { pos: [number, number]; rot: number }[]; island: [number, number][] };

const KINDS: [Kind, number][] = [["tree", 25], ["pine", 15], ["willow", 15], ["bush", 15], ["mushroom", 12], ["rock", 10], ["crystal", 8]];
const pickKind = (r: number): Kind => {
  let acc = 0;
  for (const [k, w] of KINDS) if (r * 100 < (acc += w)) return k;
  return "tree";
};

/** Lay out path tiles, scenery and the island outline in world space from the DOM node positions (pixels). */
function build(W: number, H: number, rows: SceneRow[], seed: string): Built {
  const rand = rng(seed);
  const pts = rows.map((r) => ({ x: W / 2 + (Math.min(LIST_W, W) * r.off) / 100, y: r.y }));
  const samples: { x: number; y: number; tx: number; ty: number; mid: boolean }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, my = (a.y + b.y) / 2, N = 14;
    for (let k = 0; k < N; k++) {
      const t = k / N, u = 1 - t;
      const x = u ** 3 * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * b.x;
      const y = u ** 3 * a.y + 3 * u * u * t * my + 3 * u * t * t * my + t ** 3 * b.y;
      samples.push({ x, y, tx: 0, ty: 1, mid: k === N / 2 && i % 2 === 0 });
    }
  }
  const last = pts[pts.length - 1];
  if (last) samples.push({ ...last, tx: 0, ty: 1, mid: false });
  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i]!, n = samples[i + 1]!;
    const d = Math.hypot(n.x - s.x, n.y - s.y) || 1;
    s.tx = (n.x - s.x) / d;
    s.ty = (n.y - s.y) / d;
  }
  const g = (x: number, y: number) => groundAt(x, y, W, H);

  const tiles = samples.map((s) => g(s.x, s.y));
  const arches = samples.filter((s) => s.mid).map((s) => {
    const [x0, z0] = g(s.x, s.y), [x1, z1] = g(s.x + s.tx * 20, s.y + s.ty * 20);
    return { pos: [x0, z0] as [number, number], rot: Math.atan2(x1 - x0, z1 - z0) };
  });

  const placed: { x: number; y: number }[] = [];
  const target = Math.min(140, Math.max(12, Math.round((W * H) / 7000)));
  for (let tries = 0; tries < 700 && placed.length < target; tries++) {
    const x = 24 + rand() * (W - 48), y = 16 + rand() * (H - 32);
    if (samples.some((s) => Math.hypot(s.x - x, s.y - y) < 54)) continue;
    if (pts.some((p) => Math.abs(p.x - x) < 95 && y > p.y - 40 && y < p.y + 125)) continue; // under a node + its label
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 46)) continue;
    placed.push({ x, y });
  }
  const decor = placed.map((p) => ({ kind: pickKind(rand()), pos: g(p.x, p.y), rot: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.45 }));

  const m = 14;
  const island = [g(m, m), g(W - m, m), g(W - m, H - m), g(m, H - m)];
  return { tiles, decor, arches, island };
}

function Island({ corners }: { corners: [number, number][] }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(corners.map(([x, z]) => new THREE.Vector2(x, -z)));
    return new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false });
  }, [corners]);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
      <meshStandardMaterial attach="material-0" color="#2f5d3a" flatShading />
      <meshStandardMaterial attach="material-1" color="#3d4f52" flatShading />
    </mesh>
  );
}

function Tiles({ points, accent }: { points: [number, number][]; accent: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    points.forEach(([x, z], i) => {
      o.position.set(x, 0.04, z);
      o.rotation.set(0, (i * 0.9) % Math.PI, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [points]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]} key={points.length}>
      <cylinderGeometry args={[0.62, 0.62, 0.08, 6]} />
      <meshStandardMaterial color="#2fa9a0" emissive={accent} emissiveIntensity={0.3} flatShading />
    </instancedMesh>
  );
}

function Scene({ W, H, rows, seed, accent }: { W: number; H: number } & Omit<Props, "theme">) {
  const built = useMemo(() => build(W, H, rows, seed), [W, H, rows, seed]);
  return (
    <>
      <hemisphereLight args={["#bfeee0", "#1b3a3a", 1.1]} />
      <directionalLight position={[6, 10, 4]} intensity={1.4} />
      <Island corners={built.island} />
      <Tiles points={built.tiles} accent={accent} />
      {built.arches.map((a, i) => (
        <group key={i} position={[a.pos[0], 0, a.pos[1]]} rotation={[0, a.rot, 0]}><Arch /></group>
      ))}
      {built.decor.map((d, i) => (
        <group key={i} position={[d.pos[0], 0, d.pos[1]]} rotation={[0, d.rot, 0]} scale={d.scale}>
          {d.kind === "tree" && <Tree />}
          {d.kind === "pine" && <Pine />}
          {d.kind === "willow" && <Willow accent={accent} />}
          {d.kind === "bush" && <Bush />}
          {d.kind === "mushroom" && <Mushroom accent={accent} />}
          {d.kind === "rock" && <Rock />}
          {d.kind === "crystal" && <Crystal accent={accent} />}
        </group>
      ))}
    </>
  );
}

/** Waits for the canvas's pixel size, then builds the scene from it. */
function Sized({ children }: { children: (w: number, h: number) => React.ReactNode }) {
  const { size } = useThree();
  return size.width > 0 && size.height > 0 ? <>{children(size.width, size.height)}</> : null;
}

/** Isometric "glowing forest" behind a subject's stage list. Fills its (relative) parent; draws no UI — stage buttons stay DOM. */
export default function SubjectScene({ seed, rows, accent }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <Canvas orthographic dpr={[1, 1.5]} frameloop="demand" camera={{ position: [14, 14, 14], zoom: ZOOM, near: -200, far: 200 }} gl={{ alpha: true, antialias: true }}>
        <Sized>{(W, H) => <Scene W={W} H={H} rows={rows} seed={seed} accent={accent} />}</Sized>
      </Canvas>
    </div>
  );
}
