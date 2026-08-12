import { describe, expect, it } from "vitest";
import { resolveScorePct, scoreToGrade, sumItemScores } from "@/hooks/useScoreRecording";
import type { ScoreItem, StudentItemScore } from "@/lib/database.types";

describe("scoreToGrade", () => {
  it("maps boundary scores to the right band", () => {
    expect(scoreToGrade(100)).toBe(4);
    expect(scoreToGrade(80)).toBe(4);
    expect(scoreToGrade(79)).toBe(3.5);
    expect(scoreToGrade(50)).toBe(1);
    expect(scoreToGrade(49)).toBe(0);
    expect(scoreToGrade(0)).toBe(0);
  });
});

describe("sumItemScores", () => {
  const item = (kind: ScoreItem["kind"], max: number, id: string): ScoreItem => ({
    id,
    teaching_assignment_id: "ta",
    kind,
    label: id,
    max_score: max,
    created_at: "",
    updated_at: "",
  });
  const score = (itemId: string, studentId: string, value: number): StudentItemScore => ({
    id: `${itemId}-${studentId}`,
    score_item_id: itemId,
    student_id: studentId,
    score: value,
    created_at: "",
    updated_at: "",
  });

  it("sums only the given student and kind", () => {
    const items = [item("collect", 20, "i1"), item("collect", 30, "i2"), item("exam", 30, "i3")];
    const scores = [score("i1", "s1", 15), score("i2", "s1", 25), score("i3", "s1", 20), score("i1", "s2", 5)];
    expect(sumItemScores(items, scores, "s1", "collect")).toEqual({ score: 40, max: 50 });
    expect(sumItemScores(items, scores, "s1", "exam")).toEqual({ score: 20, max: 30 });
    expect(sumItemScores(items, scores, "s2", "collect")).toEqual({ score: 5, max: 50 });
  });
});

describe("resolveScorePct", () => {
  it("prefers the assignment override, falls back to department, else null", () => {
    expect(resolveScorePct({ score_collect_pct: 60, score_exam_pct: 40 }, { score_collect_pct: 70, score_exam_pct: 30 })).toEqual({
      collectPct: 60,
      examPct: 40,
    });
    expect(resolveScorePct({ score_collect_pct: null, score_exam_pct: null }, { score_collect_pct: 70, score_exam_pct: 30 })).toEqual({
      collectPct: 70,
      examPct: 30,
    });
    expect(resolveScorePct({ score_collect_pct: null, score_exam_pct: null }, null)).toBeNull();
  });
});
