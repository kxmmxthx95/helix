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
  panel: {
    slice: 32,
    width: 16,
    fallback:
      "rounded-3xl border-2 border-[#8a2eb8] bg-gradient-to-b from-[#fff0f7] to-[#ffe0f0] shadow-[0_0_0_3px_#ffd1ec,0_8px_20px_rgba(43,15,58,0.45)]",
  },
} as const;

export type FrameKind = keyof typeof FRAMES;

export function frameStyle(kind: FrameKind): CSSProperties {
  const { slice, width } = FRAMES[kind];
  return { borderStyle: "solid", borderWidth: width, borderImage: `url(/game/frame-${kind}.webp) ${slice} fill / ${width}px / 0 stretch` };
}

/** Painted frame when its art exists, CSS look-alike until then. */
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
      className={cn(!art && FRAMES[kind].fallback, className)}
      style={art ? { ...frameStyle(kind), ...style } : style}
      {...rest}
    />
  );
}
