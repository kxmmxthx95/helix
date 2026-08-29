/**
 * Renders an admin-authored GameMap (migration 0057) for the student-homepage
 * walk scene. Ground/wall are flat fills (Ninja Adventure Asset Pack ships no
 * flat-repeat tile, only autotile borders and whole-building sprites); posts
 * are drawn with the log_post.png prop.
 */
import type { GameMap, GameMapObstacle } from "@/lib/database.types";

export const TILE = 32;

/** True = walkable ground. Outer ring is always wall; obstacle cells block their footprint. */
export function buildWalkGrid(map: GameMap, obstacles: GameMapObstacle[]): boolean[][] {
  const { cols, rows } = map;
  const grid: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) grid[y]![x] = true;
  }
  for (const o of obstacles) {
    if (grid[o.y]) grid[o.y]![o.x] = false;
  }
  return grid;
}
