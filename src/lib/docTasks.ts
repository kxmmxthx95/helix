import type { DocTask, DocTaskFile, DocTaskType } from "@/lib/database.types";

export const DOC_TASK_TYPES: { value: DocTaskType; label: string }[] = [
  { value: "lesson_plan", label: "แผนการสอน" },
  { value: "worksheet", label: "ใบงาน" },
  { value: "exam", label: "ข้อสอบ" },
  { value: "media", label: "สื่อการสอน" },
  { value: "other", label: "อื่นๆ" },
];

export const docTaskTypeLabel = (t: DocTaskType) => DOC_TASK_TYPES.find((x) => x.value === t)?.label ?? t;

export type TaskStatus = "submitted" | "pending" | "overdue";

type Teacher = { id: string; department_id: string | null; learning_area_id: string | null };

/** A task applies to a teacher when each non-null filter matches. Mirrors doc_task_targets() in migration 0072. */
export function taskTargetsTeacher(task: Pick<DocTask, "department_id" | "learning_area_id">, t: Teacher) {
  return (
    (!task.department_id || task.department_id === t.department_id) &&
    (!task.learning_area_id || task.learning_area_id === t.learning_area_id)
  );
}

/** Local YYYY-MM-DD — due dates are plain dates, so compare as strings (no timezone drift). */
export function todayISO(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Any file = submitted (even late); no file and due date before today = overdue (due day itself still counts as pending). */
export function taskStatus(task: Pick<DocTask, "due_date">, fileCount: number, today: string): TaskStatus {
  if (fileCount > 0) return "submitted";
  return task.due_date < today ? "overdue" : "pending";
}

export type TeacherProgress = {
  total: number;
  submitted: number;
  pending: number;
  overdue: number;
  percent: number;
  status: TaskStatus | "complete";
};

/** Rolls one teacher's tasks up: complete = all submitted, overdue = any overdue, else pending. */
export function teacherProgress(
  teacher: Teacher,
  tasks: DocTask[],
  files: Pick<DocTaskFile, "task_id" | "teacher_id" | "review_status">[],
  today: string,
): TeacherProgress {
  // A returned file doesn't count — the task is open again until a new upload.
  const have = new Set(
    files.filter((f) => f.teacher_id === teacher.id && f.review_status !== "returned").map((f) => f.task_id),
  );
  let submitted = 0;
  let pending = 0;
  let overdue = 0;
  for (const task of tasks) {
    if (!taskTargetsTeacher(task, teacher)) continue;
    const s = taskStatus(task, have.has(task.id) ? 1 : 0, today);
    if (s === "submitted") submitted++;
    else if (s === "pending") pending++;
    else overdue++;
  }
  const total = submitted + pending + overdue;
  return {
    total,
    submitted,
    pending,
    overdue,
    percent: total ? Math.round((submitted / total) * 100) : 100,
    status: overdue ? "overdue" : pending ? "pending" : "complete",
  };
}
