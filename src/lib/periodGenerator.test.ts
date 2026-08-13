import { describe, expect, it } from "vitest";
import { generatePeriods } from "@/lib/periodGenerator";

describe("generatePeriods", () => {
  it("numbers teaching periods sequentially with no gaps when no breaks are enabled", () => {
    const rows = generatePeriods({
      startTime: "08:30",
      periodsPerDay: 3,
      minutesPerPeriod: 50,
      days: [1],
    });
    expect(rows.map((r) => r.period_no)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.period_type === "teaching")).toBe(true);
    expect(rows[0]!.start_time).toBe("08:30");
    expect(rows[2]!.end_time).toBe("11:00"); // 08:30 + 3*50min
  });

  it("interleaves recess/lunch into the same period_no sequence at the requested slot", () => {
    const rows = generatePeriods({
      startTime: "08:30",
      periodsPerDay: 4,
      minutesPerPeriod: 50,
      recess: { enabled: true, afterPeriod: 2, minutes: 15, label: "พักเบรก" },
      lunch: { enabled: true, afterPeriod: 3, minutes: 60, label: "พักกลางวัน" },
      days: [1],
    });
    expect(rows.map((r) => [r.period_no, r.period_type, r.label])).toEqual([
      [1, "teaching", ""],
      [2, "teaching", ""],
      [3, "break", "พักเบรก"],
      [4, "teaching", ""],
      [5, "break", "พักกลางวัน"],
      [6, "teaching", ""],
    ]);
    // period_no unique + sequential across the whole day
    expect(rows.map((r) => r.period_no)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("clones the same day pattern across every selected day", () => {
    const rows = generatePeriods({
      startTime: "08:00",
      periodsPerDay: 2,
      minutesPerPeriod: 45,
      days: [1, 3, 5],
    });
    expect(rows.map((r) => r.day_of_week)).toEqual([1, 1, 3, 3, 5, 5]);
  });

  it("handles a break positioned right after the last teaching period", () => {
    const rows = generatePeriods({
      startTime: "08:00",
      periodsPerDay: 2,
      minutesPerPeriod: 50,
      lunch: { enabled: true, afterPeriod: 2, minutes: 60, label: "พักกลางวัน" },
      days: [1],
    });
    expect(rows.map((r) => r.period_type)).toEqual(["teaching", "teaching", "break"]);
  });
});
