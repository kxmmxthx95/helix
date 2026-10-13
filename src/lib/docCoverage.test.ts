import { describe, expect, it } from "vitest";
import type { CoverageLesson } from "@/hooks/useDocuments";
import { coverageCsv, coverageStats } from "@/lib/docCoverage";

const lesson = (fileCount: number, lastAt = "2026-10-01T00:00:00Z"): CoverageLesson => ({
  id: String(Math.random()), name: "บทที่ 1", createdBy: null, sortOrder: 0, topicCount: 2, fileCount, okFileCount: fileCount, lastAt, lastBy: "u1",
});

describe("coverageStats", () => {
  it("empty when no lessons", () => {
    expect(coverageStats({ lessons: [], lessonTarget: 5 })).toMatchObject({ status: "empty", progress: 0 });
  });
  it("partial while a lesson has no file", () => {
    expect(coverageStats({ lessons: [lesson(1), lesson(0)], lessonTarget: 0 })).toMatchObject({ status: "partial", progress: 50 });
  });
  it("partial until the target count is reached, even if all lessons have files", () => {
    expect(coverageStats({ lessons: [lesson(1), lesson(1)], lessonTarget: 4 })).toMatchObject({ status: "partial", progress: 50 });
  });
  it("complete when target met and every lesson has a file; progress caps at 100", () => {
    const s = coverageStats({ lessons: [lesson(1), lesson(2), lesson(1)], lessonTarget: 2 });
    expect(s).toMatchObject({ status: "complete", progress: 100, files: 4, topics: 6 });
  });
  it("last = most recent lesson", () => {
    expect(coverageStats({ lessons: [lesson(1, "2026-10-02T00:00:00Z"), lesson(1, "2026-10-09T00:00:00Z")], lessonTarget: 0 }).last?.lastAt).toBe("2026-10-09T00:00:00Z");
  });
});

describe("coverageCsv", () => {
  it("escapes quotes and starts with a BOM", () => {
    const csv = coverageCsv(
      [{ key: "a", subjectId: "s", code: "ค21101", nameTh: 'คณิต "พื้นฐาน"', departmentId: "d", learningAreaId: "l", subjectType: "basic", gradeLevelId: "g", gradeName: "ม.1", gradeSort: 1, lessonTarget: 12, topicTarget: 36, lessons: [] }],
      () => "—",
      { empty: "ยังไม่บันทึก", partial: "ไม่ครบ", complete: "ครบถ้วน" },
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"คณิต ""พื้นฐาน"""');
    expect(csv).toContain('"ยังไม่บันทึก"');
  });
});
