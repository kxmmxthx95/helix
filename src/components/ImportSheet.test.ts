import { describe, expect, it } from "vitest";
import { resolveStudentRow } from "@/components/ImportSheet";

const deptByCode = new Map([
  ["PRI", "dept-pri"],
  ["SEC", "dept-sec"],
]);
const gradeLevelByLabel = new Map([
  ["dept-pri::ป.1", "grade-pri-1"],
  ["dept-sec::ม.1", "grade-sec-1"],
]);

const base = { student_code: "1001", first_name: "สมชาย", last_name: "ใจดี" };

describe("resolveStudentRow", () => {
  it("uses the fallback department when the row has no department code", () => {
    const result = resolveStudentRow(base, 2, {
      deptByCode,
      gradeLevelByLabel,
      fallbackDepartmentId: "dept-pri",
      allowDepartmentOverride: true,
    });
    expect(result).toMatchObject({ row: 2, draft: { department_id: "dept-pri", grade_level_id: null } });
  });

  it("resolves grade level scoped to the row's own department", () => {
    const result = resolveStudentRow(
      { ...base, class_level: "ม.1", department_code: "SEC" },
      3,
      { deptByCode, gradeLevelByLabel, fallbackDepartmentId: "dept-pri", allowDepartmentOverride: true },
    );
    expect(result).toMatchObject({ row: 3, draft: { department_id: "dept-sec", grade_level_id: "grade-sec-1" } });
  });

  it("rejects an unrecognized department code", () => {
    const result = resolveStudentRow({ ...base, department_code: "XX" }, 4, {
      deptByCode,
      gradeLevelByLabel,
      fallbackDepartmentId: "dept-pri",
      allowDepartmentOverride: true,
    });
    expect(result).toEqual({ row: 4, issue: 'ไม่รู้จักรหัสแผนก "XX"' });
  });

  it("flags a row with no resolvable department at all", () => {
    const result = resolveStudentRow(base, 5, {
      deptByCode,
      gradeLevelByLabel,
      fallbackDepartmentId: "",
      allowDepartmentOverride: true,
    });
    expect(result).toEqual({ row: 5, issue: "ไม่พบแผนก" });
  });

  it("ignores a department code from a non-org-wide user's CSV, using their own department instead", () => {
    const result = resolveStudentRow({ ...base, department_code: "SEC" }, 6, {
      deptByCode,
      gradeLevelByLabel,
      fallbackDepartmentId: "dept-pri",
      allowDepartmentOverride: false,
    });
    expect(result).toMatchObject({ row: 6, draft: { department_id: "dept-pri" } });
  });
});
