import { useEffect, useRef, useState } from "react";
import type { CharacterOptions } from "@/lib/database.types";
import { CELL, FRAMES_PER_DIRECTION, getWalkStrip, type WalkDirection } from "@/lib/characterSprite";
import { cn } from "@/lib/utils";

const DIRECTIONS: WalkDirection[] = ["down", "left", "up", "right"];
const FRAME_MS = 120;

/** Animated walk-cycle sprite. Click rotates facing direction, like nudging a game character. */
export function CharacterSprite({
  options,
  scale = 3,
  className,
}: {
  options: CharacterOptions;
  scale?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [direction, setDirection] = useState<WalkDirection>("down");
  const frameRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let strip: HTMLCanvasElement | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    getWalkStrip(options, direction).then((s) => {
      if (cancelled) return;
      strip = s;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.imageSmoothingEnabled = false;

      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(strip!, frameRef.current * CELL, 0, CELL, CELL, 0, 0, CELL, CELL);
      };
      draw();
      timer = setInterval(() => {
        frameRef.current = (frameRef.current + 1) % FRAMES_PER_DIRECTION;
        draw();
      }, FRAME_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [options, direction]);

  return (
    <button
      type="button"
      onClick={() => setDirection((d) => DIRECTIONS[(DIRECTIONS.indexOf(d) + 1) % DIRECTIONS.length]!)}
      title="หมุนตัวละคร"
      className={cn("tappable shrink-0", className)}
    >
      <canvas
        ref={canvasRef}
        width={CELL}
        height={CELL}
        style={{ width: CELL * scale, height: CELL * scale, imageRendering: "pixelated" }}
      />
    </button>
  );
}
