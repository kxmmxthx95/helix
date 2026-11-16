import { describe, expect, it } from "vitest";
import { addDays, computeSlots, copyPreview, eventApplies, isoDow, periodReplaced, weekStart } from "./planSlots";

describe("planSlots", () => {
  it("computes ISO weekday and week start", () => {
    expect(isoDow("2026-11-09")).toBe(1); // Monday
    expect(isoDow("2026-11-15")).toBe(7); // Sunday
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("expands weekly entries over the range and skips non-attend events", () => {
    const entries = [{ day_of_week: 1, period_no: 3 }, { day_of_week: 3, period_no: 2 }];
    const slots = computeSlots({ start: "2026-11-09", end: "2026-11-18" }, entries, [
      { start_date: "2026-11-11", end_date: "2026-11-11", students_attend: false },
      { start_date: "2026-11-16", end_date: "2026-11-16", students_attend: true },
    ]);
    expect(slots.map((s) => `${s.date}#${s.periodNo}`)).toEqual([
      "2026-11-09#3",
      "2026-11-16#3",
      "2026-11-18#2",
    ]);
  });
  const morning = { start_date: "2026-11-09", end_date: "2026-11-09", students_attend: true, replaces_classes: true, start_time: "08:30:00", end_time: "12:00:00" };
  it("replaces only periods overlapping the event window", () => {
    expect(periodReplaced("2026-11-09", { start_time: "09:00", end_time: "09:50" }, [morning])).toBe(true);
    expect(periodReplaced("2026-11-09", { start_time: "11:30", end_time: "12:20" }, [morning])).toBe(true); // partial overlap
    expect(periodReplaced("2026-11-09", { start_time: "12:00", end_time: "12:50" }, [morning])).toBe(false); // touching only
    expect(periodReplaced("2026-11-09", { start_time: "13:00", end_time: "13:50" }, [morning])).toBe(false);
    expect(periodReplaced("2026-11-10", { start_time: "09:00", end_time: "09:50" }, [morning])).toBe(false);
  });
  it("replaces every period without a window or when closed all day; ignores non-replacing events", () => {
    const p = { start_time: "13:00", end_time: "13:50" };
    expect(periodReplaced("2026-11-09", p, [{ ...morning, start_time: null, end_time: null }])).toBe(true);
    expect(periodReplaced("2026-11-09", p, [{ ...morning, students_attend: false }])).toBe(true);
    expect(periodReplaced("2026-11-09", p, [{ ...morning, replaces_classes: false }])).toBe(false);
  });
  it("computeSlots drops only the replaced periods of a half-day activity", () => {
    const entries = [
      { day_of_week: 1, period_no: 2, start_time: "09:00", end_time: "09:50" },
      { day_of_week: 1, period_no: 6, start_time: "13:00", end_time: "13:50" },
    ];
    const slots = computeSlots({ start: "2026-11-09", end: "2026-11-09" }, entries, [morning]);
    expect(slots.map((s) => s.periodNo)).toEqual([6]);
  });
  it("scopes events by department and grade", () => {
    expect(eventApplies({ departmentIds: [] }, "d1", "g1")).toBe(true);
    expect(eventApplies({ departmentIds: ["d2"] }, "d1", "g1")).toBe(false);
    expect(eventApplies({ departmentIds: ["d1"], gradeLevelIds: ["g2"] }, "d1", "g1")).toBe(false);
    expect(eventApplies({ departmentIds: ["d1"], gradeLevelIds: ["g1"] }, "d1", "g1")).toBe(true);
  });
  it("previews the group plan copy with the SQL skip rules", () => {
    const src = [
      { slot_date: "2026-11-09", period_no: 2, topic_ids: ["a", "b"] }, // Mon: target free, b invalid
      { slot_date: "2026-11-10", period_no: 2, topic_ids: ["a"] }, // Tue: target has no such period
      { slot_date: "2026-11-16", period_no: 2, topic_ids: ["a"] }, // Mon: target already planned
      { slot_date: "2026-11-23", period_no: 2, topic_ids: ["a"] }, // Mon: target taught
    ];
    const tgt = [
      { slot_date: "2026-11-16", period_no: 2, topic_ids: ["x"] },
      { slot_date: "2026-11-23", period_no: 2, topic_ids: [], completed_at: "2026-11-23T00:00:00Z" },
    ];
    expect(copyPreview(src, tgt, [{ day_of_week: 1, period_no: 2 }], new Set(["a"]))).toEqual({ copied: 1, skipped: 4 });
  });
});
