import { describe, expect, it } from "vitest";
import { addDays, computeSlots, isoDow, weekStart } from "./planSlots";

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
});
