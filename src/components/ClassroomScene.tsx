import { useEffect, useRef, useState } from "react";
import type { CharacterOptions } from "@/lib/database.types";
import { CELL, FRAMES_PER_DIRECTION, getWalkStrip, type WalkDirection } from "@/lib/characterSprite";
import { buildWalkGrid, COLS, DESKS, ROWS, SCENE_HEIGHT, SCENE_WIDTH, TILE } from "@/lib/classroomScene";
import { findPath, type GridPoint } from "@/lib/pathfind";
import { cn } from "@/lib/utils";

const VIEWPORT_H = 240; // px, portrait-friendly window into the larger scene
const MOVE_MS_PER_TILE = 220;
const FRAME_MS = 120;

function directionBetween(a: GridPoint, b: GridPoint): WalkDirection {
  if (b.y < a.y) return "up";
  if (b.y > a.y) return "down";
  return b.x < a.x ? "left" : "right";
}

/** Tap-to-move classroom: pathfinds around desks (A*), walks the sprite tile by tile, camera follows. */
export function ClassroomScene({ options, className }: { options: CharacterOptions; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportW, setViewportW] = useState(320);

  const gridRef = useRef(buildWalkGrid());
  const posRef = useRef<GridPoint>({ x: 1, y: 1 }); // current tile, character stands here
  const pathRef = useRef<GridPoint[]>([]); // remaining tiles to walk, path[0] is next step
  const directionRef = useRef<WalkDirection>("down");
  const frameRef = useRef(0);
  const tileImagesRef = useRef<{ floor: HTMLImageElement; wall: HTMLImageElement } | null>(null);
  const stepStartRef = useRef(0);
  const fromRef = useRef<GridPoint>({ x: 1, y: 1 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadImage("/scene/floor.png"), loadImage("/scene/wall.png")]).then(([floor, wall]) => {
      if (!cancelled) tileImagesRef.current = { floor, wall };
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const maybeCtx = canvas?.getContext("2d");
    if (!canvas || !maybeCtx) return;
    const ctx = maybeCtx;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let stripCache: Partial<Record<WalkDirection, HTMLCanvasElement>> = {};
    let cancelled = false;

    Promise.all(
      (["up", "down", "left", "right"] as WalkDirection[]).map(async (d) => {
        stripCache[d] = await getWalkStrip(options, d);
      }),
    ).then(() => {
      if (!cancelled) draw(performance.now());
    });

    function advanceStep(now: number) {
      const path = pathRef.current;
      if (path.length === 0) return;
      const elapsed = now - stepStartRef.current;
      if (elapsed >= MOVE_MS_PER_TILE) {
        posRef.current = path.shift()!;
        fromRef.current = posRef.current;
        stepStartRef.current = now;
        if (path.length > 0) {
          directionRef.current = directionBetween(posRef.current, path[0]!);
        }
      }
    }

    function draw(now: number) {
      if (cancelled) return;
      advanceStep(now);

      const tiles = tileImagesRef.current;
      const path = pathRef.current;
      const moving = path.length > 0;
      const from = fromRef.current;
      const to = moving ? path[0]! : from;
      const t = moving ? Math.min(1, (now - stepStartRef.current) / MOVE_MS_PER_TILE) : 0;
      const px = (from.x + (to.x - from.x) * t) * TILE + TILE / 2;
      const py = (from.y + (to.y - from.y) * t) * TILE + TILE / 2;

      frameRef.current = moving ? Math.floor(now / FRAME_MS) % FRAMES_PER_DIRECTION : 0;

      const camX = Math.max(0, Math.min(SCENE_WIDTH - viewportW, px - viewportW / 2));
      const camY = Math.max(0, Math.min(SCENE_HEIGHT - VIEWPORT_H, py - VIEWPORT_H / 2));

      ctx.clearRect(0, 0, viewportW, VIEWPORT_H);
      if (tiles) {
        const grid = gridRef.current;
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const sx = x * TILE - camX;
            const sy = y * TILE - camY;
            if (sx < -TILE || sy < -TILE || sx > viewportW || sy > VIEWPORT_H) continue;
            ctx.drawImage(grid[y]![x] ? tiles.floor : tiles.wall, sx, sy, TILE, TILE);
          }
        }
        for (const d of DESKS) {
          ctx.fillStyle = "#8a5a35";
          ctx.fillRect(d.x * TILE - camX, d.y * TILE - camY, d.w * TILE, d.h * TILE);
          ctx.strokeStyle = "#5c3a22";
          ctx.strokeRect(d.x * TILE - camX + 0.5, d.y * TILE - camY + 0.5, d.w * TILE - 1, d.h * TILE - 1);
        }
      }

      const strip = stripCache[directionRef.current];
      if (strip) {
        ctx.drawImage(
          strip,
          frameRef.current * CELL,
          0,
          CELL,
          CELL,
          px - camX - CELL / 2,
          py - camY - CELL / 2 - (CELL - TILE) / 2,
          CELL,
          CELL,
        );
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [options, viewportW]);

  function onTap(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Reconstruct current camera offset the same way draw() does, using the last known position.
    const from = fromRef.current;
    const camX = Math.max(0, Math.min(SCENE_WIDTH - viewportW, from.x * TILE + TILE / 2 - viewportW / 2));
    const camY = Math.max(0, Math.min(SCENE_HEIGHT - VIEWPORT_H, from.y * TILE + TILE / 2 - VIEWPORT_H / 2));

    const targetX = Math.floor((clickX + camX) / TILE);
    const targetY = Math.floor((clickY + camY) / TILE);

    const grid = gridRef.current;
    const walkable = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !!grid[y]?.[x];
    const path = findPath(posRef.current, { x: targetX, y: targetY }, walkable);
    if (!path || path.length < 2) return;
    pathRef.current = path.slice(1);
    fromRef.current = posRef.current;
    stepStartRef.current = performance.now();
    directionRef.current = directionBetween(path[0]!, path[1]!);
  }

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <canvas
        ref={canvasRef}
        width={viewportW}
        height={VIEWPORT_H}
        onClick={onTap}
        className="tappable w-full rounded-lg ring-1 ring-border"
        style={{ height: VIEWPORT_H, imageRendering: "pixelated" }}
      />
    </div>
  );
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let entry = imageCache.get(src);
  if (!entry) {
    entry = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imageCache.set(src, entry);
  }
  return entry;
}
