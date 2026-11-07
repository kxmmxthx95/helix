import { useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

/** Scenery slots. Drop `public/models/<slot>.glb` to replace the procedural low-poly stand-in (see public/models/README.md). */
export type Slot = "tree" | "pine" | "willow" | "bush" | "mushroom" | "rock" | "crystal" | "arch";

const probes = new Map<Slot, Promise<string | null>>();
/** HEAD the .glb once per slot. The SPA fallback answers 200 text/html for a missing file, so check the content type. */
function probe(slot: Slot) {
  let p = probes.get(slot);
  if (!p) {
    const url = `${import.meta.env.BASE_URL}models/${slot}.glb`;
    p = fetch(url, { method: "HEAD" })
      .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? url : null))
      .catch(() => null);
    probes.set(slot, p);
  }
  return p;
}

function Glb({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} />;
}

/** Renders the slot's .glb when present, otherwise `children` (the procedural model). */
export function Model({ slot, children }: { slot: Slot; children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void probe(slot).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [slot]);
  if (!url) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <Glb url={url} />
    </Suspense>
  );
}

const flat = { flatShading: true } as const;
const wood = "#5a4631";

export const Tree = () => (
  <Model slot="tree">
    <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.12, 0.18, 0.8, 6]} /><meshStandardMaterial color={wood} {...flat} /></mesh>
    {[0, 1, 2].map((i) => (
      <mesh key={i} position={[0, 0.95 + i * 0.5, 0]}><icosahedronGeometry args={[0.72 - i * 0.16, 0]} /><meshStandardMaterial color={["#7d8a2e", "#8e9a35", "#a1a843"][i]} {...flat} /></mesh>
    ))}
  </Model>
);

export const Pine = () => (
  <Model slot="pine">
    <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.1, 0.14, 0.5, 6]} /><meshStandardMaterial color={wood} {...flat} /></mesh>
    {[0, 1, 2].map((i) => (
      <mesh key={i} position={[0, 0.7 + i * 0.5, 0]}><coneGeometry args={[0.7 - i * 0.18, 0.8, 7]} /><meshStandardMaterial color={["#b4552a", "#c4652f", "#d0773a"][i]} {...flat} /></mesh>
    ))}
  </Model>
);

export const Willow = ({ accent }: { accent: string }) => (
  <Model slot="willow">
    <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.13, 0.2, 0.9, 6]} /><meshStandardMaterial color={wood} {...flat} /></mesh>
    <mesh position={[0, 1.25, 0]} scale={[1.1, 0.9, 1.1]}><icosahedronGeometry args={[0.85, 1]} /><meshStandardMaterial color="#1f9d73" emissive={accent} emissiveIntensity={0.35} {...flat} /></mesh>
  </Model>
);

export const Bush = () => (
  <Model slot="bush">
    <mesh position={[0, 0.3, 0]} scale={[1.2, 0.8, 1]}><icosahedronGeometry args={[0.45, 0]} /><meshStandardMaterial color="#1f7a5c" {...flat} /></mesh>
  </Model>
);

export const Mushroom = ({ accent }: { accent: string }) => (
  <Model slot="mushroom">
    <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.12, 0.16, 0.6, 6]} /><meshStandardMaterial color="#f1e6d6" {...flat} /></mesh>
    <mesh position={[0, 0.6, 0]} scale={[1, 0.65, 1]}><sphereGeometry args={[0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#d6317f" emissive={accent} emissiveIntensity={0.25} {...flat} /></mesh>
  </Model>
);

export const Rock = () => (
  <Model slot="rock">
    <mesh position={[0, 0.3, 0]} scale={[1.3, 0.8, 1]}><dodecahedronGeometry args={[0.45, 0]} /><meshStandardMaterial color="#7e9a7a" {...flat} /></mesh>
  </Model>
);

export const Crystal = ({ accent }: { accent: string }) => (
  <Model slot="crystal">
    <mesh position={[0, 0.5, 0]} scale={[0.6, 1.2, 0.6]}><octahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} {...flat} /></mesh>
  </Model>
);

/** Mossy stone arch spanning the path; the opening faces ±Z. */
export const Arch = () => (
  <Model slot="arch">
    <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]}><torusGeometry args={[1.1, 0.2, 5, 10, Math.PI]} /><meshStandardMaterial color="#6f8f3c" {...flat} /></mesh>
  </Model>
);
