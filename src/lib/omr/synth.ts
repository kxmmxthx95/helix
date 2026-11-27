import { encode } from "uqr";
import { answerSheetLayout, SHEET, type SheetRow } from "@/lib/answerSheet";
import { invertH, solveHomography, applyH, type Pt } from "./homography";
import type { RawImage } from "./image";

/** Test fixture: draws a printed sheet into a synthetic "photo" (perspective, blur, noise, shading) so the reader can be checked without a camera. */
export type SynthStyle = "fill" | "tick" | "cross" | "faint";
export type SynthOptions = {
  rows: SheetRow[];
  /** Text of the QR (omit to leave the QR out). */
  code?: string;
  /** Marked bubbles per question number. */
  marks: Record<number, { choices: number[]; style?: SynthStyle }>;
  width?: number;
  height?: number;
  /** Image positions of the page corners (0,0), (210,0), (210,297), (0,297). */
  corners?: [Pt, Pt, Pt, Pt];
  blur?: number;
  noise?: number;
  /** 0..1 darkening from left to right. */
  shade?: number;
  seed?: number;
  /** Index (TL, TR, BL, BR) of a corner mark to leave off. */
  hideMark?: number;
};

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

export function renderSyntheticSheet(o: SynthOptions): RawImage {
  const width = o.width ?? 1200;
  const height = o.height ?? 1700;
  const corners = o.corners ?? [[40, 50], [width - 40, 50], [width - 40, height - 50], [40, height - 50]];
  const toImg = solveHomography([[0, 0], [SHEET.w, 0], [SHEET.w, SHEET.h], [0, SHEET.h]], corners);
  const toPage = invertH(toImg);

  const layout = answerSheetLayout(o.rows);
  const cell = 6;
  const grid = new Map<string, { x: number; y: number; style: SynthStyle | null }[]>();
  for (const b of layout.bubbles) {
    const m = o.marks[b.number];
    const style = m?.choices.includes(b.choice) ? (m.style ?? "fill") : null;
    for (let cx = Math.floor((b.x - 3.2) / cell); cx <= Math.floor((b.x + 3.2) / cell); cx++) {
      for (let cy = Math.floor((b.y - 3.2) / cell); cy <= Math.floor((b.y + 3.2) / cell); cy++) {
        const key = `${cx},${cy}`;
        grid.set(key, [...(grid.get(key) ?? []), { x: b.x, y: b.y, style }]);
      }
    }
  }
  const qr = o.code ? encode(o.code, { ecc: "M", border: 0 }) : null;
  const modMm = qr ? SHEET.qrSize / qr.size : 0;
  const marks = layout.marks.filter((_, i) => i !== o.hideMark);

  const inkAt = (x: number, y: number): number => {
    for (const m of marks) if (x >= m.x && x <= m.x + m.size && y >= m.y && y <= m.y + m.size) return 1;
    if (qr && x >= SHEET.qrX && x < SHEET.qrX + SHEET.qrSize && y >= SHEET.qrY && y < SHEET.qrY + SHEET.qrSize) {
      return qr.data[Math.floor((y - SHEET.qrY) / modMm)]![Math.floor((x - SHEET.qrX) / modMm)] ? 1 : 0;
    }
    const list = grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`);
    if (!list) return 0;
    let ink = 0;
    for (const b of list) {
      const dx = x - b.x;
      const dy = y - b.y;
      const r = Math.hypot(dx, dy);
      if (Math.abs(r - SHEET.bubbleR) < 0.2) ink = 1;
      if (b.style === "fill" && r < SHEET.bubbleR - 0.2) ink = 1;
      else if (b.style === "faint" && r < SHEET.bubbleR - 0.2) ink = Math.max(ink, 0.4);
      else if (b.style === "tick" && Math.min(segDist(dx, dy, -1.6, 0.2, -0.5, 1.6), segDist(dx, dy, -0.5, 1.6, 1.8, -1.8)) < 0.3) ink = 1;
      else if (b.style === "cross" && Math.min(segDist(dx, dy, -1.7, -1.7, 1.7, 1.7), segDist(dx, dy, -1.7, 1.7, 1.7, -1.7)) < 0.3) ink = 1;
    }
    return ink;
  };

  const gray = new Float32Array(width * height);
  const shade = o.shade ?? 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const [x, y] = applyH(toPage, px, py);
      const inside = x >= 0 && x <= SHEET.w && y >= 0 && y <= SHEET.h;
      const light = 1 - shade * (px / width);
      gray[py * width + px] = inside ? 238 * light * (1 - 0.93 * inkAt(x, y)) : 105;
    }
  }
  let img = gray;
  for (let pass = 0; pass < (o.blur ?? 0); pass++) {
    const next = new Float32Array(img.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += img[(y + dy) * width + x + dx]!;
        next[y * width + x] = s / 9;
      }
    }
    img = next;
  }
  let seed = o.seed ?? 7;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) - 0.5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = img[i]! + rand() * 2 * (o.noise ?? 0);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}
