import { describe, expect, it } from "vitest";
import { answerSheetLayout, encodeSheetCode, parseSheetCode, SHEET, sheetFingerprint, sheetProblems, sheetRows } from "./answerSheet";

const rows = (n: number, choices = 4) => Array.from({ length: n }, (_, i) => ({ number: i + 1, choices }));

describe("answerSheetLayout", () => {
  it("fits 60 questions x 6 choices inside the grid, clear of the corner marks, without overlapping bubbles", () => {
    const l = answerSheetLayout(rows(60, 6));
    expect(l.bubbles).toHaveLength(360);
    for (const b of l.bubbles) {
      expect(b.x - SHEET.bubbleR).toBeGreaterThanOrEqual(SHEET.gridLeft);
      expect(b.x + SHEET.bubbleR).toBeLessThanOrEqual(SHEET.gridRight);
      expect(b.y - SHEET.bubbleR).toBeGreaterThanOrEqual(SHEET.gridTop + SHEET.headerH);
      expect(b.y + SHEET.bubbleR).toBeLessThanOrEqual(SHEET.gridBottom);
    }
    const seen = new Set(l.bubbles.map((b) => `${b.x.toFixed(2)}:${b.y.toFixed(2)}`));
    expect(seen.size).toBe(360);
    // neighbours in a row are a pitch apart, so bubbles (diameter 5.4) never touch
    expect(SHEET.bubblePitch).toBeGreaterThan(SHEET.bubbleR * 2);
    expect(l.rowPitch).toBeGreaterThan(SHEET.bubbleR * 2);
  });
  it("uses 3 columns filled top to bottom and a roomier row pitch when there are few questions", () => {
    const l = answerSheetLayout(rows(20));
    expect(l.rowsPerColumn).toBe(7);
    const q1 = l.bubbles.find((b) => b.number === 1 && b.choice === 0)!;
    const q8 = l.bubbles.find((b) => b.number === 8 && b.choice === 0)!;
    expect(q8.x).toBeGreaterThan(q1.x + 40); // question 8 starts the second column
    expect(q8.y).toBeCloseTo(q1.y, 5);
    expect(l.rowPitch).toBeLessThanOrEqual(10);
  });
  it("draws only as many bubbles as a question has choices, and headers as wide as the widest of the column", () => {
    const l = answerSheetLayout([{ number: 1, choices: 2 }, { number: 3, choices: 5 }]);
    expect(l.bubbles.filter((b) => b.number === 1)).toHaveLength(2);
    expect(l.bubbles.filter((b) => b.number === 3)).toHaveLength(5);
    expect(l.headers.filter((h) => h.column === 0)).toHaveLength(5);
  });
  it("puts the four marks in the corners", () => {
    const m = answerSheetLayout(rows(10)).marks;
    expect(m).toHaveLength(4);
    expect(Math.min(...m.map((x) => x.x))).toBe(SHEET.markInset);
    expect(Math.max(...m.map((x) => x.x + x.size))).toBe(SHEET.w - SHEET.markInset);
    expect(Math.max(...m.map((x) => x.y + x.size))).toBe(SHEET.h - SHEET.markInset);
  });
});

describe("sheetRows / sheetProblems", () => {
  const q = (question_type: string, n: number) => ({ question_type, choices: Array.from({ length: n }) });
  it("skips short answers but keeps the printed question numbers", () => {
    expect(sheetRows([q("multiple_choice", 4), q("short_answer", 0), q("true_false", 2)])).toEqual([{ number: 1, choices: 4 }, { number: 3, choices: 2 }]);
  });
  it("refuses an exam with nothing to bubble, too many questions, or a bad choice count", () => {
    expect(sheetProblems([])).toHaveLength(1);
    expect(sheetProblems(rows(61))[0]).toContain("60");
    expect(sheetProblems([{ number: 4, choices: 7 }])[0]).toContain("ข้อ 4");
    expect(sheetProblems([{ number: 2, choices: 1 }])[0]).toContain("ข้อ 2");
    expect(sheetProblems(rows(60, 4))).toEqual([]);
  });
});

describe("sheet code", () => {
  it("round-trips student and spare sheets", () => {
    const fp = sheetFingerprint(rows(20));
    expect(parseSheetCode(encodeSheetCode("a-1", "b-2", fp))).toEqual({ sessionId: "a-1", studentId: "b-2", fp });
    expect(parseSheetCode(encodeSheetCode("a-1", null, fp))?.studentId).toBeNull();
  });
  it("rejects other text", () => {
    expect(parseSheetCode("https://example.com")).toBeNull();
    expect(parseSheetCode("HXA1.only")).toBeNull();
  });
  it("changes the fingerprint when the exam changes", () => {
    expect(sheetFingerprint(rows(20))).not.toBe(sheetFingerprint(rows(21)));
    expect(sheetFingerprint(rows(20))).not.toBe(sheetFingerprint(rows(20, 5)));
    expect(sheetFingerprint(rows(20))).toBe(sheetFingerprint(rows(20)));
  });
});
