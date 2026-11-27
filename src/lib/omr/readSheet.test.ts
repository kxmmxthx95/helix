import { describe, expect, it } from "vitest";
import { encodeSheetCode, sheetFingerprint, type SheetRow } from "@/lib/answerSheet";
import { answerSheetLayout } from "@/lib/answerSheet";
import { classify, readSheet, rectify } from "./readSheet";
import { renderSyntheticSheet, type SynthOptions } from "./synth";

const rows: SheetRow[] = Array.from({ length: 40 }, (_, i) => ({ number: i + 1, choices: i % 6 === 0 ? 2 : 4 }));
const SESSION = "11111111-2222-3333-4444-555555555555";
const STUDENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const code = encodeSheetCode(SESSION, STUDENT, sheetFingerprint(rows));
// the "student" answers every question except a few left blank: choice = number % choices
const truth = (n: number) => rows[n - 1]!.number % rows[n - 1]!.choices;
const blanks = new Set([5, 17, 33]);
const marks = (style: SynthOptions["marks"][number]["style"] = "fill") => Object.fromEntries(rows.filter((r) => !blanks.has(r.number)).map((r) => [r.number, { choices: [truth(r.number)], style }]));
const photo = (extra: Partial<SynthOptions> = {}) => renderSyntheticSheet({ rows, code, marks: marks(), blur: 1, noise: 6, ...extra });

function expectAllRead(res: ReturnType<typeof readSheet>) {
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  for (const a of res.answers) {
    if (blanks.has(a.number)) expect(a, `q${a.number}`).toMatchObject({ status: "blank", choice: null });
    else expect(a, `q${a.number}`).toMatchObject({ status: "answered", choice: truth(a.number) });
  }
}

describe("classify", () => {
  it("answers on one clear mark, blank on none, double on two, unsure on weak or mixed", () => {
    expect(classify([0.9, 0.02, 0.01, 0])).toMatchObject({ status: "answered", choice: 0 });
    expect(classify([0.25, 0.02, 0.01, 0])).toMatchObject({ status: "answered", choice: 0 }); // a tick leaves less ink than a fill
    expect(classify([0.01, 0.02, 0.0, 0.03]).status).toBe("blank");
    expect(classify([0.85, 0.8, 0, 0]).status).toBe("double");
    expect(classify([0.5, 0.2, 0, 0]).status).toBe("unsure"); // smudge next to a mark
    expect(classify([0.1, 0.01, 0, 0])).toMatchObject({ status: "unsure", choice: 0 }); // faint
  });
});

describe("readSheet on synthetic photos", () => {
  it("reads a clean upright sheet exactly, with the QR", () => {
    const res = readSheet(photo(), rows);
    expectAllRead(res);
    if (res.ok) expect(res.code).toEqual({ sessionId: SESSION, studentId: STUDENT, fp: sheetFingerprint(rows) });
  });
  it("reads a tilted, shaded photo (perspective + uneven light)", () => {
    expectAllRead(readSheet(photo({ corners: [[90, 40], [1130, 95], [1085, 1650], [30, 1610]], shade: 0.35, noise: 9 }), rows));
  });
  it("reads a sheet photographed upside down (the QR gives the orientation)", () => {
    expectAllRead(readSheet(photo({ corners: [[1160, 1650], [40, 1650], [40, 50], [1160, 50]] }), rows));
  });
  it("accepts ticks and crosses as well as filled bubbles", () => {
    expectAllRead(readSheet(renderSyntheticSheet({ rows, code, marks: marks("tick"), blur: 1, noise: 6 }), rows));
    expectAllRead(readSheet(renderSyntheticSheet({ rows, code, marks: marks("cross"), blur: 1, noise: 6 }), rows));
  });
  it("flags two marks as double and never invents an answer for a faint one", () => {
    const m = marks();
    m[2] = { choices: [0, 2], style: "fill" };
    m[9] = { choices: [1], style: "faint" };
    const res = readSheet(renderSyntheticSheet({ rows, code, marks: m, blur: 1, noise: 6 }), rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.answers.find((a) => a.number === 2)).toMatchObject({ status: "double", choice: null });
    const faint = res.answers.find((a) => a.number === 9)!;
    expect(faint.status === "unsure" || (faint.status === "answered" && faint.choice === 1)).toBe(true);
  });
  it("still reads the answers when the QR is missing, but returns no code", () => {
    const res = readSheet(renderSyntheticSheet({ rows, marks: marks(), blur: 1, noise: 6 }), rows);
    expectAllRead(res);
    if (res.ok) expect(res.code).toBeNull();
  });
  it("flattens the photo so a printed bubble sits at its page position (filled dark, empty light)", () => {
    const img = photo({ corners: [[90, 40], [1130, 95], [1085, 1650], [30, 1610]] });
    const res = readSheet(img, rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const flat = rectify(img, res.homography, 4);
    const layout = answerSheetLayout(rows);
    const at = (number: number, choice: number) => {
      const b = layout.bubbles.find((x) => x.number === number && x.choice === choice)!;
      return flat.data[(Math.round(b.y * 4) * flat.width + Math.round(b.x * 4)) * 4]!;
    };
    expect(at(2, truth(2))).toBeLessThan(90);
    expect(at(2, (truth(2) + 1) % 4)).toBeGreaterThan(180);
  });
  it("refuses a photo where a corner mark is out of frame", () => {
    const res = readSheet(photo({ hideMark: 3 }), rows);
    expect(res.ok).toBe(false);
  });
}, 120_000);
