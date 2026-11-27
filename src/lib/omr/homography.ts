export type Pt = [number, number];
/** 3x3 projective transform, row-major, h[8] = 1. */
export type Homography = number[];

/** Homography mapping the 4 `src` points to the 4 `dst` points (direct linear transform). */
export function solveHomography(src: Pt[], dst: Pt[]): Homography {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const d = a[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error("degenerate points");
    for (let k = c; k < 9; k++) a[c]![k]! /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f !== 0) for (let k = c; k < 9; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  return [...a.map((row) => row[8]!), 1];
}

export function applyH(h: Homography, x: number, y: number): Pt {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w];
}

export function invertH(h: Homography): Homography {
  const [a, b, c, d, e, f, g, hh, i] = h as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * hh;
  const B = -(d * i - f * g);
  const C = d * hh - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * hh) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * hh - b * g) / det, (a * e - b * d) / det,
  ];
}
