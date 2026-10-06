import { Bounds, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";

export const CHARACTER_GLB = "/game/character.glb";

const JUMP_MS = 500;

function Model({ jump, reduce }: { jump: number; reduce: boolean }) {
  const { scene, animations } = useGLTF(CHARACTER_GLB);
  const group = useRef<Group>(null);
  const jumpStart = useRef<number | null>(null);
  const { actions, names } = useAnimations(animations, group);
  const hasClip = names.length > 0;

  // Prefer a clip named idle, else the first one — GLBs from Mixamo/Meshy name theirs differently.
  useEffect(() => {
    const action = actions[names.find((n) => /idle/i.test(n)) ?? names[0] ?? ""];
    if (!action || reduce) return;
    action.reset().fadeIn(0.3).play();
    return () => void action.fadeOut(0.2);
  }, [actions, names, reduce]);

  useEffect(() => {
    if (jump && !reduce) jumpStart.current = performance.now();
  }, [jump, reduce]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    // ponytail: no idle clip in the GLB → fake a breathing bob; drop this once the model ships with one.
    const bob = hasClip || reduce ? 0 : Math.sin(clock.elapsedTime * 2.2) * 0.03;
    let hop = 0;
    if (jumpStart.current !== null) {
      const t = (performance.now() - jumpStart.current) / JUMP_MS;
      if (t >= 1) jumpStart.current = null;
      else hop = Math.sin(t * Math.PI) * 0.35;
    }
    g.position.y = bob + hop;
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/** Lazy-loaded by Character (parts.tsx) — only fetched once a GLB is confirmed to exist. */
export default function Character3D({ jump, reduce }: { jump: number; reduce: boolean }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [0, 0.6, 5] }} gl={{ alpha: true }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      <Bounds fit clip observe margin={1.15}>
        <Model jump={jump} reduce={reduce} />
      </Bounds>
      {/* horizontal spin only — a student dragging shouldn't flip the mascot upside down */}
      <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2.2} maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  );
}
