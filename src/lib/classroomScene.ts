/**
 * Fixed classroom layout for the student-homepage walk scene. Floor/wall
 * tiles from public/scene/ (LPC, see CREDITS.md); desks are drawn as plain
 * rects — no desk sprite exists in the source tileset.
 */
export const TILE = 32;
export const COLS = 14;
export const ROWS = 10;
export const SCENE_WIDTH = COLS * TILE;
export const SCENE_HEIGHT = ROWS * TILE;

export type DeskRect = { x: number; y: number; w: number; h: number };

/** Two rows of three 2x1 desks, leaving aisles for the pathfinder to route through. */
export const DESKS: DeskRect[] = [
  { x: 2, y: 3, w: 2, h: 1 },
  { x: 6, y: 3, w: 2, h: 1 },
  { x: 10, y: 3, w: 2, h: 1 },
  { x: 2, y: 6, w: 2, h: 1 },
  { x: 6, y: 6, w: 2, h: 1 },
  { x: 10, y: 6, w: 2, h: 1 },
];

/** True = walkable floor. Outer ring is wall; desks block their footprint. */
export function buildWalkGrid(): boolean[][] {
  const grid: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) grid[y]![x] = true;
  }
  for (const d of DESKS) {
    for (let y = d.y; y < d.y + d.h; y++) {
      for (let x = d.x; x < d.x + d.w; x++) {
        if (grid[y]) grid[y]![x] = false;
      }
    }
  }
  return grid;
}
