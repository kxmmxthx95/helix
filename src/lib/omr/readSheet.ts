import jsQR from "jsqr";
import { answerSheetLayout, parseSheetCode, SHEET, type SheetRow } from "@/lib/answerSheet";
import { applyH, solveHomography, type Homography, type Pt } from "./homography";
import { adaptiveBinarize, components, toGray, type Component, type RawImage } from "./image";

export type BubbleStatus = "answered" | "blank" | "double" | "unsure";
/** What was read for one question: `choice` is the 0-based chosen bubble when answered (or the best guess when unsure). */
export type ReadAnswer = { number: number; status: BubbleStatus; choice: number | null; ratios: number[] };
export type SheetCodeInfo = { sessionId: string; studentId: string | null; fp: string };

export type ReadResult =
  | { ok: true; code: SheetCodeInfo | null; answers: ReadAnswer[]; homography: Homography; pxPerMm: number; warnings: string[] }
  | { ok: false; message: string };

/** Ink share of a bubble's inner disc that counts as "marked". Tuned on synthetic sheets; to be tuned again on real photos. */
export const MARK = { blank: 0.08, strong: 0.15, secondRatio: 0.35, doubleRatio: 0.6, innerR: 1.9 } as const;

/** Decides a question from the ink share of each of its bubbles. */
export function classify(ratios: number[]): { status: BubbleStatus; choice: number | null } {
  const order = ratios.map((r, i) => [r, i] as const).sort((a, b) => b[0] - a[0]);
  const [top, topIdx] = order[0]!;
  const second = order[1]?.[0] ?? 0;
  if (top < MARK.blank) return { status: "blank", choice: null };
  if (top >= MARK.strong && second < Math.max(MARK.blank - 0.01, top * MARK.secondRatio)) return { status: "answered", choice: topIdx };
  if (top >= MARK.strong && second >= Math.max(MARK.strong, top * MARK.doubleRatio)) return { status: "double", choice: null };
  return { status: "unsure", choice: topIdx };
}

const pageMarkCenters = (): Pt[] => {
  const o = SHEET.markInset + SHEET.markSize / 2;
  return [[o, o], [SHEET.w - o, o], [o, SHEET.h - o], [SHEET.w - o, SHEET.h - o]];
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Solid, squarish blobs that do not touch the image border: candidates for the four corner marks. */
function squareCandidates(comps: Component[], w: number, h: number): Component[] {
  return comps.filter((c) => {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const aspect = bw / bh;
    return aspect > 0.7 && aspect < 1.43 && c.area / (bw * bh) > 0.8 && c.minX > 1 && c.minY > 1 && c.maxX < w - 2 && c.maxY < h - 2;
  });
}

/** Reads one photographed answer sheet: finds the sheet by its four corner marks, then measures every bubble. */
export function readSheet(img: RawImage, rows: SheetRow[]): ReadResult {
  const { width: w, height: h } = img;
  const warnings: string[] = [];
  const qr = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
  const code = qr ? parseSheetCode(qr.data) : null;
  if (!code) warnings.push(qr ? "QR ไม่ใช่ของกระดาษคำตอบ Helix" : "อ่าน QR ไม่ได้ กรุณาเลือกนักเรียนเอง");

  const gray = toGray(img);
  const bin = adaptiveBinarize(gray, w, h);
  const cands = squareCandidates(components(bin, w, h, 40), w, h);

  const pageMarks = pageMarkCenters();
  let found: Pt[] | null = null;
  if (qr) {
    const l = qr.location;
    const corners: Pt[] = [[l.topLeftCorner.x, l.topLeftCorner.y], [l.topRightCorner.x, l.topRightCorner.y], [l.bottomRightCorner.x, l.bottomRightCorner.y], [l.bottomLeftCorner.x, l.bottomLeftCorner.y]];
    const q = [SHEET.qrX, SHEET.qrY, SHEET.qrX + SHEET.qrSize, SHEET.qrY + SHEET.qrSize];
    const h0 = solveHomography([[q[0]!, q[1]!], [q[2]!, q[1]!], [q[2]!, q[3]!], [q[0]!, q[3]!]], corners);
    const qrSide = (dist(corners[0]!, corners[1]!) + dist(corners[0]!, corners[3]!)) / 2;
    const expected = (qrSide * SHEET.markSize) / SHEET.qrSize;
    const sized = cands.filter((c) => {
      const side = Math.sqrt(c.area);
      return side > expected * 0.55 && side < expected * 1.8;
    });
    const reach = Math.max(w, h) * 0.14;
    const picked = pageMarks.map((p) => {
      const at = applyH(h0, p[0], p[1]);
      return sized.map((c) => ({ c, d: dist([c.cx, c.cy], at) })).filter((x) => x.d < reach).sort((a, b) => a.d - b.d)[0]?.c ?? null;
    });
    if (picked.every((c) => c)) found = picked.map((c) => [c!.cx, c!.cy] as Pt);
  } else {
    // No QR: take the four biggest solid squares and assume the sheet is photographed upright.
    const big = [...cands].sort((a, b) => b.area - a.area).slice(0, 4);
    if (big.length === 4) {
      const byY = [...big].sort((a, b) => a.cy - b.cy);
      const top = byY.slice(0, 2).sort((a, b) => a.cx - b.cx);
      const bottom = byY.slice(2).sort((a, b) => a.cx - b.cx);
      found = [top[0]!, top[1]!, bottom[0]!, bottom[1]!].map((c) => [c.cx, c.cy] as Pt);
    }
  }
  if (!found) return { ok: false, message: "ไม่พบเครื่องหมายสี่มุมของกระดาษ ถ่ายให้เห็นทั้งใบ มุมทั้งสี่ต้องอยู่ในภาพ" };

  const homography = solveHomography(pageMarks, found);
  const pxPerMm = dist(found[0]!, found[1]!) / (pageMarks[1]![0] - pageMarks[0]![0]);
  if (pxPerMm < 4.5) warnings.push("ภาพเล็กหรือไกลเกินไป ถ่ายให้กระดาษเต็มเฟรมมากขึ้น");

  const layout = answerSheetLayout(rows);
  const byQuestion = new Map<number, { choice: number; ratio: number }[]>();
  const r = MARK.innerR * pxPerMm;
  for (const b of layout.bubbles) {
    const [cx, cy] = applyH(homography, b.x, b.y);
    let ink = 0;
    let total = 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        total++;
        ink += bin[y * w + x]!;
      }
    }
    const list = byQuestion.get(b.number) ?? [];
    list.push({ choice: b.choice, ratio: total > 0 ? ink / total : 0 });
    byQuestion.set(b.number, list);
  }
  const answers: ReadAnswer[] = rows.map((row) => {
    const ratios = (byQuestion.get(row.number) ?? []).sort((a, b) => a.choice - b.choice).map((x) => x.ratio);
    return { number: row.number, ...classify(ratios), ratios };
  });
  if (answers.filter((a) => a.status === "unsure").length > Math.max(3, rows.length * 0.3)) warnings.push("ภาพอาจไม่ชัด ข้อที่ไม่แน่ใจมีมาก ลองถ่ายใหม่");
  return { ok: true, code, answers, homography, pxPerMm, warnings };
}

/** Warps the photo to a flat A4 page (`scale` px per mm) so the review can overlay bubbles at their printed positions. */
export function rectify(img: RawImage, homography: Homography, scale: number): RawImage {
  const w = Math.round(SHEET.w * scale);
  const h = Math.round(SHEET.h * scale);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [u, v] = applyH(homography, x / scale, y / scale);
      const o = (y * w + x) * 4;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 >= img.width - 1 || y0 >= img.height - 1) {
        out[o] = out[o + 1] = out[o + 2] = 200;
        out[o + 3] = 255;
        continue;
      }
      const fx = u - x0;
      const fy = v - y0;
      const i = (y0 * img.width + x0) * 4;
      const j = i + img.width * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = img.data[i + c]! * (1 - fx) * (1 - fy) + img.data[i + 4 + c]! * fx * (1 - fy) + img.data[j + c]! * (1 - fx) * fy + img.data[j + 4 + c]! * fx * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}
