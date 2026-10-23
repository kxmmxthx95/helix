import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { Component, lazy, Suspense, useEffect, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
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

const artKnown = new Map<string, boolean>();

/** True once public/game/{name}.webp loads. A missing file (SPA serves index.html) fails to decode, so onerror covers it. */
export function useArt(name: string) {
  const [ok, setOk] = useState(artKnown.get(name) ?? false);
  useEffect(() => {
    if (artKnown.has(name)) {
      setOk(artKnown.get(name)!);
      return;
    }
    let live = true;
    const img = new Image();
    img.onload = () => {
      artKnown.set(name, true);
      if (live) setOk(true);
    };
    img.onerror = () => artKnown.set(name, false);
    img.src = `/game/${name}.webp`;
    return () => {
      live = false;
    };
  }, [name]);
  return ok;
}

/**
 * Art slots in public/game/frame-{kind}.webp. `slice` = 9-slice cut in image px, `width` = rendered border in CSS px.
 * Keep in sync with docs/game-art-spec.md. `bar` is a repeat-x strip, not a 9-slice.
 */
export const FRAMES = {
  hud: {
    slice: 40,
    width: 20,
    fallback:
      "rounded-3xl border-2 border-white/25 bg-gradient-to-b from-[#7a3aa8]/90 to-[#3a1457]/90 shadow-[0_0_14px_rgba(255,120,200,0.35)] backdrop-blur-sm",
  },
  panel: {
    slice: 32,
    width: 16,
    fallback:
      "rounded-3xl border-2 border-[#8a2eb8] bg-gradient-to-b from-[#fff0f7] to-[#ffe0f0] shadow-[0_0_0_3px_#ffd1ec,0_8px_20px_rgba(43,15,58,0.45)]",
  },
  sign: {
    slice: 24,
    width: 12,
    fallback:
      "rounded-2xl border-2 border-white/30 bg-gradient-to-b from-[#8a3fb8]/85 to-[#431662]/85 shadow-[0_0_10px_rgba(255,120,200,0.3)]",
  },
  button: {
    slice: 32,
    width: 16,
    fallback:
      "rounded-2xl border-2 border-[#fff3b0] bg-gradient-to-b from-[#ffd95a] to-[#ff9f3d] shadow-[0_5px_0_#b0207a,0_0_16px_rgba(255,200,61,0.5)]",
  },
  tab: {
    slice: 24,
    width: 10,
    fallback: "rounded-2xl border-2 border-white/60 bg-gradient-to-b from-[#ff8fc0] to-[#ee2b8c] shadow-[0_0_12px_rgba(255,143,192,0.6)]",
  },
  bar: { slice: 0, width: 0, fallback: "border-t-2 border-white/25 bg-gradient-to-b from-[#9c2a86] to-[#4a1466]" },
} as const;

export type FrameKind = keyof typeof FRAMES;

export function frameStyle(kind: FrameKind): CSSProperties {
  if (kind === "bar") return { backgroundImage: "url(/game/frame-bar.webp)", backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" };
  const { slice, width } = FRAMES[kind];
  return { borderStyle: "solid", borderWidth: width, borderImage: `url(/game/frame-${kind}.webp) ${slice} fill / ${width}px / 0 stretch` };
}

/** Painted frame when its art exists, CSS look-alike until then. */
/** Frames whose painted art is light (cream) — text on them flips to plum via `.game-art`. */
const LIGHT_ART: readonly FrameKind[] = ["hud", "panel", "sign"];

/** White-on-dark while the CSS fallback shows; plum-on-cream inside a painted light frame. */
export const GAME_TEXT =
  "text-white [text-shadow:0_2px_0_rgb(43_15_58)] [.game-art_&]:text-[#2b0f3a] [.game-art_&]:[text-shadow:0_1px_0_rgb(255_255_255/0.7)]";

export function GameFrame({
  kind,
  as: Tag = "div",
  className,
  style,
  ...rest
}: { kind: FrameKind; as?: "div" | "button" } & HTMLAttributes<HTMLElement> & { type?: "button" }) {
  const art = useArt(`frame-${kind}`);
  const Comp = Tag as "div";
  return (
    <Comp
      className={cn(!art && FRAMES[kind].fallback, art && LIGHT_ART.includes(kind) && "game-art", className)}
      style={art ? { ...frameStyle(kind), ...style } : style}
      {...rest}
    />
  );
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
