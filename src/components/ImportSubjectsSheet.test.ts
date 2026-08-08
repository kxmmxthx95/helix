import { describe, expect, it } from "vitest";
import { resolveSubjectRow } from "@/components/ImportSubjectsSheet";

const lookups = {
  areaByLabel: new Map([
    ["science", "area-1"],
    ["วิทยาศาสตร์และเทคโนโลยี", "area-1"],
    ["physics", "area-2"],
    ["ฟิสิกส์", "area-2"],
  ]),
  gradeByLabel: new Map([
    ["m1", "grade-1"],
    ["มัธยมศึกษาปีที่ 1", "grade-1"],
  ]),
};

const base = { code: "sci101", name_th: "วิทยาศาสตร์พื้นฐาน 1", credits: "1.5", hours_per_week: "3" };

describe("resolveSubjectRow", () => {
  it("resolves a plain row by learning area code", () => {
    const result = resolveSubjectRow({ ...base, learning_area_code: "science", subject_type: "พื้นฐาน" }, 2, "dept-1", lookups);
    expect(result).toEqual({
      row: 2,
      draft: {
        code: "sci101",
        name_th: "วิทยาศาสตร์พื้นฐาน 1",
        name_en: null,
        department_id: "dept-1",
        learning_area_id: "area-1",
        subject_type: "basic",
        credits: 1.5,
        hours_per_week: 3,
        is_active: true,
        suggested_grade_level_id: null,
        suggested_term: null,
      },
    });
  });

  it("resolves a learning area by name and matches a sub-area", () => {
    const result = resolveSubjectRow(
      { ...base, learning_area_code: "ฟิสิกส์", subject_type: "เพิ่มเติม" },
      3,
      "dept-1",
      lookups,
    );
    expect(result).toMatchObject({ draft: { learning_area_id: "area-2", subject_type: "additional" } });
  });

  it("carries optional suggested grade level and term", () => {
    const result = resolveSubjectRow(
      {
        ...base,
        learning_area_code: "science",
        subject_type: "กิจกรรม",
        suggested_grade_level_code: "M1",
        suggested_term: "2",
      },
      4,
      "dept-1",
      lookups,
    );
    expect(result).toMatchObject({
      draft: { subject_type: "activity", suggested_grade_level_id: "grade-1", suggested_term: 2 },
    });
  });

  it("rejects an unrecognized learning area", () => {
    const result = resolveSubjectRow({ ...base, learning_area_code: "history", subject_type: "พื้นฐาน" }, 5, "dept-1", lookups);
    expect(result).toEqual({ row: 5, issue: 'ไม่รู้จักกลุ่มสาระ "history"' });
  });

  it("rejects an unrecognized subject type", () => {
    const result = resolveSubjectRow({ ...base, learning_area_code: "science", subject_type: "พิเศษ" }, 6, "dept-1", lookups);
    expect(result).toEqual({ row: 6, issue: 'ไม่รู้จักประเภทวิชา "พิเศษ"' });
  });

  it("rejects non-numeric credits", () => {
    const result = resolveSubjectRow(
      { ...base, credits: "abc", learning_area_code: "science", subject_type: "พื้นฐาน" },
      7,
      "dept-1",
      lookups,
    );
    expect(result).toEqual({ row: 7, issue: 'หน่วยกิตไม่ถูกต้อง "abc"' });
  });

  it("rejects a non-integer hours_per_week", () => {
    const result = resolveSubjectRow(
      { ...base, hours_per_week: "2.5", learning_area_code: "science", subject_type: "พื้นฐาน" },
      8,
      "dept-1",
      lookups,
    );
    expect(result).toEqual({ row: 8, issue: 'ชั่วโมง/สัปดาห์ไม่ถูกต้อง "2.5"' });
  });

  it("rejects an unrecognized suggested grade level", () => {
    const result = resolveSubjectRow(
      { ...base, learning_area_code: "science", subject_type: "พื้นฐาน", suggested_grade_level_code: "M9" },
      9,
      "dept-1",
      lookups,
    );
    expect(result).toEqual({ row: 9, issue: 'ไม่รู้จักระดับชั้น "M9"' });
  });

  it("rejects a suggested term outside 1/2", () => {
    const result = resolveSubjectRow(
      { ...base, learning_area_code: "science", subject_type: "พื้นฐาน", suggested_term: "3" },
      10,
      "dept-1",
      lookups,
    );
    expect(result).toEqual({ row: 10, issue: 'เทอมที่แนะนำต้องเป็น 1 หรือ 2, ได้ "3"' });
  });
});
