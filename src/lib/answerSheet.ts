/**
 * Bubble answer sheet (A4 portrait). One pure layout function drives BOTH the printed sheet and, later, the phone
 * scanner, so a bubble is always sampled where it was printed. All numbers are millimetres from the top-left corner.
 */

export const LETTERS = ["ก", "ข", "ค", "ง", "จ", "ฉ"];
export const SHEET = {
  w: 210,
  h: 297,
  /** Solid black squares in the four corners: the scanner finds the page with them. */
  markSize: 7,
  markInset: 8,
  gridLeft: 18,
  gridRight: 192,
  /** Letter header row of each column; the first question row starts `headerH` below. */
  gridTop: 94,
  headerH: 7,
  gridBottom: 262,
  /** QR code box (the sheet identifier), top right. */
  qrX: 160,
  qrY: 14,
  qrSize: 32,
  columns: 3,
  maxRowsPerColumn: 20,
  minRowsPerColumn: 5,
  numberW: 8,
  bubblePitch: 8,
  bubbleR: 2.7,
  maxQuestions: 60,
  minChoices: 2,
  maxChoices: LETTERS.length,
} as const;

/** One gradable question on the sheet. `number` is its number in the printed exam (short-answer questions leave gaps). */
export type SheetRow = { number: number; choices: number };

export type SheetBubble = { number: number; choice: number; x: number; y: number };
export type SheetLayout = {
  rowsPerColumn: number;
  rowPitch: number;
  marks: { x: number; y: number; size: number }[];
  /** Where each question number is written (centre). */
  numbers: { number: number; x: number; y: number }[];
  /** Letter headers per column, as many as the widest question of that column. */
  headers: { column: number; choice: number; x: number; y: number }[];
  bubbles: SheetBubble[];
};

const colWidth = (SHEET.gridRight - SHEET.gridLeft) / SHEET.columns;

export function answerSheetLayout(rows: SheetRow[]): SheetLayout {
  const rowsPerColumn = Math.min(SHEET.maxRowsPerColumn, Math.max(SHEET.minRowsPerColumn, Math.ceil(rows.length / SHEET.columns)));
  const top = SHEET.gridTop + SHEET.headerH;
  const rowPitch = Math.min(10, (SHEET.gridBottom - top) / rowsPerColumn);
  const far = SHEET.w - SHEET.markInset - SHEET.markSize;
  const farY = SHEET.h - SHEET.markInset - SHEET.markSize;
  const marks = [
    { x: SHEET.markInset, y: SHEET.markInset },
    { x: far, y: SHEET.markInset },
    { x: SHEET.markInset, y: farY },
    { x: far, y: farY },
  ].map((m) => ({ ...m, size: SHEET.markSize }));

  const numbers: SheetLayout["numbers"] = [];
  const bubbles: SheetBubble[] = [];
  const widest = new Map<number, number>();
  rows.forEach((r, k) => {
    const column = Math.floor(k / rowsPerColumn);
    const x0 = SHEET.gridLeft + column * colWidth;
    const y = top + ((k % rowsPerColumn) + 0.5) * rowPitch;
    numbers.push({ number: r.number, x: x0 + SHEET.numberW / 2, y });
    for (let c = 0; c < r.choices; c++) bubbles.push({ number: r.number, choice: c, x: x0 + SHEET.numberW + (c + 0.5) * SHEET.bubblePitch, y });
    widest.set(column, Math.max(widest.get(column) ?? 0, r.choices));
  });
  const headers: SheetLayout["headers"] = [];
  for (const [column, n] of widest) {
    const x0 = SHEET.gridLeft + column * colWidth;
    for (let c = 0; c < n; c++) headers.push({ column, choice: c, x: x0 + SHEET.numberW + (c + 0.5) * SHEET.bubblePitch, y: SHEET.gridTop + SHEET.headerH / 2 });
  }
  return { rowsPerColumn, rowPitch, marks, numbers, headers, bubbles };
}

/** Rows of the sheet from the exam's questions in room order: only multiple choice / true-false, numbered as in the printed exam. */
export function sheetRows(questions: { question_type: string; choices: unknown[] }[]): SheetRow[] {
  return questions.flatMap((q, i) => (q.question_type === "short_answer" ? [] : [{ number: i + 1, choices: q.choices.length }]));
}

/** Why a sheet cannot be made for this exam, in Thai for the teacher; empty when it can. */
export function sheetProblems(rows: SheetRow[]): string[] {
  if (rows.length === 0) return ["ห้องสอบนี้ไม่มีข้อปรนัยหรือถูก/ผิดที่กาฝนได้"];
  const out: string[] = [];
  if (rows.length > SHEET.maxQuestions) out.push(`กระดาษคำตอบรองรับสูงสุด ${SHEET.maxQuestions} ข้อ (ห้องนี้มี ${rows.length} ข้อที่กาฝนได้)`);
  for (const r of rows) {
    if (r.choices < SHEET.minChoices || r.choices > SHEET.maxChoices) out.push(`ข้อ ${r.number} มี ${r.choices} ตัวเลือก (กระดาษรองรับ ${SHEET.minChoices}–${SHEET.maxChoices})`);
  }
  return out;
}

/** Short fingerprint of the sheet's shape, printed in the QR: the scanner can tell when the exam changed after printing. */
export function sheetFingerprint(rows: SheetRow[]): string {
  let h = 2166136261;
  for (const ch of rows.map((r) => `${r.number}:${r.choices}`).join(";")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36).padStart(6, "0");
}

const PREFIX = "HXA1";
/** QR text: sheet version, exam room, student ("-" for a spare sheet), fingerprint. */
export const encodeSheetCode = (sessionId: string, studentId: string | null, fp: string) => `${PREFIX}.${sessionId}.${studentId ?? "-"}.${fp}`;
export function parseSheetCode(text: string): { sessionId: string; studentId: string | null; fp: string } | null {
  const [prefix, sessionId, studentId, fp, ...rest] = text.trim().split(".");
  if (prefix !== PREFIX || !sessionId || !studentId || !fp || rest.length > 0) return null;
  return { sessionId, studentId: studentId === "-" ? null : studentId, fp };
}
