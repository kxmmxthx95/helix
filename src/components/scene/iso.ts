/** Fixed isometric camera: at (d,d,d) looking at the origin, orthographic, ZOOM px per world unit. */
export const ZOOM = 46;
const S3 = Math.sqrt(3);
const R = [Math.SQRT1_2, 0, -Math.SQRT1_2] as const; // screen right
const U = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)] as const; // screen up
const F = [-1 / S3, -1 / S3, -1 / S3] as const; // forward

/** Ground point (y=0) under canvas pixel (px,py) of a W×H canvas, as [x,z]. Closed form — no camera object needed. */
export function groundAt(px: number, py: number, W: number, H: number): [number, number] {
  const sx = (px - W / 2) / ZOOM;
  const sy = -(py - H / 2) / ZOOM;
  const P = [R[0] * sx + U[0] * sy, R[1] * sx + U[1] * sy, R[2] * sx + U[2] * sy];
  const t = P[1]! * S3; // F[1] t + P[1] = 0
  return [P[0]! + F[0] * t, P[2]! + F[2] * t];
}

/** Small deterministic PRNG so a subject always gets the same scenery. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
