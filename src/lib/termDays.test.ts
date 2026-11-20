import { describe, expect, it } from "vitest";
import { countSchoolDays } from "@/lib/termDays";

describe("countSchoolDays", () => {
  it("counts Mon-Fri inclusive of both ends when no periods are configured", () => {
    // Mon 2026-10-26 .. Sun 2026-11-01 -> 5
    expect(countSchoolDays("2026-10-26", "2026-11-01", [], [])).toBe(5);
    expect(countSchoolDays("2026-10-26", "2026-10-26", [], [])).toBe(1);
  });

  it("follows the department's teaching weekdays (Saturday school)", () => {
    expect(countSchoolDays("2026-10-26", "2026-11-01", [1, 2, 3, 4, 5, 6], [])).toBe(6);
  });

  it("drops closures without double-counting overlaps or weekends", () => {
    const closures = [
      { start_date: "2026-10-27", end_date: "2026-10-28" },
      { start_date: "2026-10-28", end_date: "2026-10-31" }, // overlaps, spans the weekend
    ];
    expect(countSchoolDays("2026-10-26", "2026-11-01", [], closures)).toBe(1);
  });
});
