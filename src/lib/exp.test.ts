import { describe, expect, it } from "vitest";
import { deriveBadges, expFromCounts, levelFromExp, rankFromExp } from "@/lib/exp";

describe("levelFromExp", () => {
  it("steps at 100, 300, 600 and reports progress", () => {
    expect(levelFromExp(0)).toMatchObject({ level: 1, into: 0, next: 100 });
    expect(levelFromExp(99).level).toBe(1);
    expect(levelFromExp(100)).toMatchObject({ level: 2, into: 0, span: 200 });
    expect(levelFromExp(299)).toMatchObject({ level: 2, next: 1 });
    expect(levelFromExp(300).level).toBe(3);
    expect(levelFromExp(600).level).toBe(4);
  });
});

describe("expFromCounts", () => {
  it("sums the rules and never goes below zero for behavior", () => {
    expect(expFromCounts({ onTime: 2, late: 1, present: 10, lateArrival: 2, behaviorRemaining: 90 })).toBe(100 + 20 + 100 + 10 + 90);
    expect(expFromCounts({ onTime: 0, late: 0, present: 0, lateArrival: 0, behaviorRemaining: -5 })).toBe(0);
  });
});

describe("rank and badges", () => {
  it("picks the highest tier reached", () => {
    expect(rankFromExp(0).id).toBe("bronze");
    expect(rankFromExp(7500).id).toBe("gold");
  });
  it("unlocks badges by rule", () => {
    const base = { submissions: 10, level: 5, monthAttendance: { present: 5, late: 1, absent: 0, leave: 0 }, behaviorRemaining: 99, behaviorStart: 100 };
    const got = Object.fromEntries(deriveBadges(base).map((b) => [b.id, b.unlocked]));
    expect(got).toMatchObject({ "first-submission": true, "submissions-10": true, "submissions-50": false, "perfect-month": true, "full-behavior": false, "level-5": true, "level-10": false });
  });
});
