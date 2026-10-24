import { useEffect, useState, type CSSProperties, type HTMLAttributes } from "react";
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
 * Keep in sync with docs/game-art-spec.md.
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
  title: {
    slice: 24,
    width: 8,
    fallback: "rounded-t-2xl border-b-2 border-[#b0207a] bg-gradient-to-b from-[#fff3b0] to-[#ffc83d]",
  },
} as const;

export type FrameKind = keyof typeof FRAMES;

export function frameStyle(kind: FrameKind): CSSProperties {
  const { slice, width } = FRAMES[kind];
  return { borderStyle: "solid", borderWidth: width, borderImage: `url(/game/frame-${kind}.webp) ${slice} fill / ${width}px / 0 stretch` };
}

/** Painted frame when its art exists, CSS look-alike until then. */
/** Frames whose painted art is light (cream) — text on them flips to plum via `.game-art`. */
const LIGHT_ART: readonly FrameKind[] = ["hud", "panel", "sign"];

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
