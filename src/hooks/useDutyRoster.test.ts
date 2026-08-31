import { describe, expect, it } from "vitest";
import { summarizeDutyCounts } from "@/hooks/useDutyRoster";

describe("summarizeDutyCounts", () => {
  it("returns an empty map when there are no assignments", () => {
    expect(summarizeDutyCounts([])).toEqual(new Map());
  });

  it("tallies duty days per staff member", () => {
    const assignments = [{ staff_id: "a" }, { staff_id: "a" }, { staff_id: "b" }];
    expect(summarizeDutyCounts(assignments)).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ]),
    );
  });
});
