import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { GraduationCap } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Art lives in public/game/ (user-supplied); until a file exists the plain icon shows instead. */
export function GameIcon({
  name,
  fallback: Fallback,
  className,
}: {
  name: string;
  fallback: (p: { className?: string }) => React.JSX.Element;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Fallback className={className} />;
  return <img src={`/game/${name}.webp`} alt="" draggable={false} className={className} onError={() => setFailed(true)} />;
}

const CHARACTER_GLB = "/game/character.glb";
const Scene = lazy(() => import("@/components/game/Character3D"));

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** A throw inside the R3F tree (bad/corrupt GLB) must not take the home screen down — show the poster instead. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Poster({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-full bg-white/60 text-primary", className)}>
        <GraduationCap className="h-10" />
      </div>
    );
  }
  return (
    <img src="/game/character.webp" alt="" draggable={false} className={className} onError={() => setFailed(true)} />
  );
}

/**
 * The one shared mascot. Renders public/game/character.glb with react-three-fiber when it exists and WebGL works;
 * otherwise (no file yet, no WebGL, load error, reduced motion) the still poster with a CSS idle bob.
 */
export function Character({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [has3d, setHas3d] = useState(false);
  const [jump, setJump] = useState(0);
  const controls = useAnimationControls();

  // A missing static file comes back as the SPA's index.html with a 200 — so check the content type, not just ok.
  useEffect(() => {
    if (!webglAvailable()) return;
    let cancelled = false;
    fetch(CHARACTER_GLB, { method: "HEAD" })
      .then((r) => {
        if (!cancelled && r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) setHas3d(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const poster = (
    <motion.div animate={controls}>
      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0], scaleY: [1, 1.02, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ originY: 1 }}
      >
        <Poster className="h-[min(19rem,42dvh)] w-auto drop-shadow-lg" />
      </motion.div>
    </motion.div>
  );

  return (
    <button
      type="button"
      aria-label="ตัวละคร"
      className={cn("relative flex flex-col items-center outline-none", className)}
      onClick={() => {
        setJump((n) => n + 1);
        if (!reduce) void controls.start({ y: [0, -36, 0], scaleY: [1, 0.9, 1.06, 1], transition: { duration: 0.5 } });
      }}
    >
      {has3d ? (
        <SceneBoundary fallback={poster}>
          <Suspense fallback={poster}>
            <div className="h-[min(19rem,42dvh)] w-56">
              <Scene jump={jump} reduce={!!reduce} />
            </div>
          </Suspense>
        </SceneBoundary>
      ) : (
        poster
      )}
      <div className="-mt-3 h-3 w-24 rounded-full bg-black/25 blur-sm" aria-hidden />
    </button>
  );
}
