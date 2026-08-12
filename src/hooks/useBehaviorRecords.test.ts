import { describe, expect, it } from "vitest";
import { STARTING_SCORE, summarizeBehaviorScore } from "@/hooks/useBehaviorRecords";
import type { BehaviorRecord } from "@/lib/database.types";

const record = (points: number): BehaviorRecord => ({
  id: "r",
  student_id: "s",
  classroom_id: "c",
  date: "2026-08-12",
  points,
  reason: "test",
  recorded_by: "t",
  created_at: "",
  updated_at: "",
});

describe("summarizeBehaviorScore", () => {
  it("is STARTING_SCORE when there are no records", () => {
    expect(summarizeBehaviorScore([])).toBe(STARTING_SCORE);
  });

  it("adds merit and subtracts demerit entries from the starting score", () => {
    const records = [record(5), record(-10), record(-3)];
    expect(summarizeBehaviorScore(records)).toBe(STARTING_SCORE - 8);
  });
});
