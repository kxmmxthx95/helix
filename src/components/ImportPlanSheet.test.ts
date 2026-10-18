import { describe, expect, it } from "vitest";
import { resolvePlanRow } from "@/components/ImportPlanSheet";

const grades = new Map([
  ["m1", "g1"],
  ["มัธยมศึกษาปีที่ 1", "g1"],
]);

describe("resolvePlanRow", () => {
  it("resolves a full row by grade code", () => {
    expect(resolvePlanRow({ subject: "วิทย์", grade: "M1", lesson: "บท 1", topic: "เซลล์" }, 2, grades)).toEqual({
      row: 2,
      entry: { subject: "วิทย์", gradeLevelId: "g1", lesson: "บท 1", topic: "เซลล์" },
    });
  });

  it("treats an empty หัวข้อ as a lesson-only row", () => {
    const r = resolvePlanRow({ subject: "วิทย์", grade: "มัธยมศึกษาปีที่ 1", lesson: "บท 1", topic: "" }, 3, grades);
    expect(r).toMatchObject({ entry: { topic: null } });
  });

  it("rejects an unknown grade and a missing lesson", () => {
    expect(resolvePlanRow({ subject: "วิทย์", grade: "X9", lesson: "บท 1", topic: "" }, 4, grades)).toMatchObject({ issue: expect.stringContaining("X9") });
    expect(resolvePlanRow({ subject: "วิทย์", grade: "M1", lesson: "", topic: "" }, 5, grades)).toMatchObject({ issue: expect.any(String) });
  });
});
