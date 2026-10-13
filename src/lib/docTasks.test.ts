import { describe, expect, it } from "vitest";
import { taskStatus, taskTargetsTeacher, teacherProgress } from "@/lib/docTasks";
import type { DocTask } from "@/lib/database.types";

const task = (id: string, due: string, extra: Partial<DocTask> = {}) =>
  ({ id, due_date: due, department_id: null, learning_area_id: null, ...extra }) as DocTask;
const teacher = { id: "t1", department_id: "d1", learning_area_id: "a1" };

describe("docTasks", () => {
  it("status: file wins, due day is still pending, past due is overdue", () => {
    expect(taskStatus(task("x", "2026-01-01"), 1, "2026-02-01")).toBe("submitted");
    expect(taskStatus(task("x", "2026-02-01"), 0, "2026-02-01")).toBe("pending");
    expect(taskStatus(task("x", "2026-01-31"), 0, "2026-02-01")).toBe("overdue");
  });

  it("targeting: null filters match all, set filters must match", () => {
    expect(taskTargetsTeacher(task("x", "2026-01-01"), teacher)).toBe(true);
    expect(taskTargetsTeacher(task("x", "2026-01-01", { department_id: "d2" }), teacher)).toBe(false);
    expect(taskTargetsTeacher(task("x", "2026-01-01", { learning_area_id: "a1" }), teacher)).toBe(true);
  });

  it("progress rolls up per teacher", () => {
    const tasks = [task("a", "2026-01-01"), task("b", "2026-03-01"), task("c", "2026-03-01", { department_id: "d2" })];
    const p = teacherProgress(teacher, tasks, [{ task_id: "b", teacher_id: "t1" }], "2026-02-01");
    expect(p).toMatchObject({ total: 2, submitted: 1, pending: 0, overdue: 1, percent: 50, status: "overdue" });
  });
});
