/** Grid-based A* (4-directional), used to route the classroom character around desks. */
export type GridPoint = { x: number; y: number };

function key(p: GridPoint) {
  return `${p.x},${p.y}`;
}

function heuristic(a: GridPoint, b: GridPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

const NEIGHBOR_DELTAS: GridPoint[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/** Returns a path of grid cells from start to goal (inclusive), or null if unreachable. walkable(x,y) must be true for the cell to be enterable. */
export function findPath(
  start: GridPoint,
  goal: GridPoint,
  walkable: (x: number, y: number) => boolean,
): GridPoint[] | null {
  if (!walkable(goal.x, goal.y)) return null;

  const open = new Set<string>([key(start)]);
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>([[key(start), 0]]);
  const fScore = new Map<string, number>([[key(start), heuristic(start, goal)]]);

  while (open.size > 0) {
    let currentKey = "";
    let current: GridPoint = start;
    let best = Infinity;
    for (const k of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < best) {
        best = f;
        currentKey = k;
        const [x, y] = k.split(",").map(Number);
        current = { x: x!, y: y! };
      }
    }

    if (current.x === goal.x && current.y === goal.y) {
      const path = [current];
      let k = currentKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k)!;
        path.unshift(prev);
        k = key(prev);
      }
      return path;
    }

    open.delete(currentKey);
    for (const d of NEIGHBOR_DELTAS) {
      const next = { x: current.x + d.x, y: current.y + d.y };
      if (!walkable(next.x, next.y)) continue;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
      const nextKey = key(next);
      if (tentativeG < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, current);
        gScore.set(nextKey, tentativeG);
        fScore.set(nextKey, tentativeG + heuristic(next, goal));
        open.add(nextKey);
      }
    }
  }
  return null;
}
