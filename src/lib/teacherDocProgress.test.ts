import { describe, expect, it } from "vitest";
import type { CoverageLesson, CoverageRow } from "@/hooks/useDocuments";
import { teacherLessonProgress } from "@/lib/teacherDocProgress";

const lesson = (okFileCount: number): CoverageLesson => ({
  id: String(Math.random()), name: "บท", createdBy: null, sortOrder: 0, topicCount: 0, fileCount: okFileCount, okFileCount, lastAt: "2026-10-01T00:00:00Z", lastBy: null,
});
const row = (key: string, lessonTarget: number, lessons: CoverageLesson[]): CoverageRow => ({
  key, subjectId: "s", code: "x", nameTh: "x", departmentId: "d", learningAreaId: "l", subjectType: "basic", gradeLevelId: "g", gradeName: "ม.1", gradeSort: 1, lessonTarget, topicTarget: 0, lessons,
});
const rows = (...r: CoverageRow[]) => new Map(r.map((x) => [x.key, x]));

describe("teacherLessonProgress", () => {
  it("nodata when the teacher has no pairs, or the pairs have neither target nor lessons", () => {
    expect(teacherLessonProgress([], rows()).status).toBe("nodata");
    expect(teacherLessonProgress(["a"], rows(row("a", 0, []))).percent).toBeNull();
    expect(teacherLessonProgress(["unknown"], rows()).status).toBe("nodata");
  });
  it("uses existing lessons as the denominator when no target is set", () => {
    const p = teacherLessonProgress(["a"], rows(row("a", 0, [lesson(1), lesson(0), lesson(2), lesson(0)])));
    expect(p).toMatchObject({ total: 4, uploaded: 2, missing: 2, percent: 50, status: "partial", files: 3 });
  });
  it("target beats existing lessons: 3 uploaded of a target of 12 is 25%", () => {
    const p = teacherLessonProgress(["a"], rows(row("a", 12, [lesson(1), lesson(1), lesson(1)])));
    expect(p).toMatchObject({ total: 12, uploaded: 3, percent: 25, status: "partial" });
  });
  it("none at 0%, complete at 100%, and uploaded never exceeds the target", () => {
    expect(teacherLessonProgress(["a"], rows(row("a", 0, [lesson(0)]))).status).toBe("none");
    expect(teacherLessonProgress(["a"], rows(row("a", 2, [lesson(1), lesson(1), lesson(1)])))).toMatchObject({ uploaded: 2, percent: 100, status: "complete" });
  });
  it("a lesson whose only files were returned does not count", () => {
    const l = { ...lesson(0), fileCount: 2 };
    expect(teacherLessonProgress(["a"], rows(row("a", 0, [l]))).uploaded).toBe(0);
  });
  it("sums across pairs (weighted, not an average of percents)", () => {
    const r = rows(row("a", 0, [lesson(1)]), row("b", 9, [lesson(0), lesson(0), lesson(0)]));
    expect(teacherLessonProgress(["a", "b"], r)).toMatchObject({ total: 10, uploaded: 1, percent: 10 });
  });
});
