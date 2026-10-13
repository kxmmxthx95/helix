import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  CheckmarkCircleIcon,
  ChevronForward,
  DocumentTextIcon,
  EyeIcon,
  Plus,
  Search,
  TimeIcon,
  Upload,
  X,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, EmptyState, Field, Input, Pagination, Select, Spinner } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useLearningAreas } from "@/hooks/useCurriculum";
import {
  useCreateDocTask,
  useDeleteDocTaskFile,
  useDocTaskFiles,
  useDocTasks,
  useReviewDocTaskFile,
  useUploadDocTaskFile,
} from "@/hooks/useDocTasks";
import { DOC_ACCEPT, docFileSignedUrl } from "@/hooks/useDocuments";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments, useProfiles, type ProfileRow } from "@/hooks/useProfiles";
import { profileFullName, type DocTask, type DocTaskFile, type DocTaskReviewStatus, type DocTaskType } from "@/lib/database.types";
import {
  DOC_TASK_TYPES,
  docTaskTypeLabel,
  taskStatus,
  taskTargetsTeacher,
  teacherProgress,
  todayISO,
  type TaskStatus,
  type TeacherProgress,
} from "@/lib/docTasks";
import { isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<TaskStatus | "complete", { label: string; cls: string; bar: string }> = {
  submitted: { label: "อัปโหลดแล้ว", cls: "bg-success/15 text-success", bar: "bg-success" },
  complete: { label: "ครบถ้วน", cls: "bg-success/15 text-success", bar: "bg-success" },
  pending: { label: "รอดำเนินการ", cls: "bg-warning/15 text-warning", bar: "bg-warning" },
  overdue: { label: "เกินกำหนด", cls: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
};

const TYPE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#94a3b8"];

function StatusBadge({ status, label }: { status: TaskStatus | "complete"; label?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium", s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? s.label}
    </span>
  );
}

const REVIEW_STYLE: Record<DocTaskReviewStatus, { label: string; cls: string }> = {
  pending: { label: "รอตรวจ", cls: "bg-warning/15 text-warning" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-success/15 text-success" },
  returned: { label: "ส่งกลับแก้ไข", cls: "bg-destructive/15 text-destructive" },
};

function ReviewChip({ status }: { status: DocTaskReviewStatus }) {
  const r = REVIEW_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium", r.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {r.label}
    </span>
  );
}

const thDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

// Blank tab must open synchronously (popup blockers), then point at the signed URL.
async function openFile(path: string, toast: (m: string, t?: "error") => void) {
  const tab = window.open("", "_blank");
  const url = await docFileSignedUrl(path);
  if (!url) {
    tab?.close();
    toast("เปิดไฟล์ไม่สำเร็จ", "error");
    return;
  }
  if (tab) tab.location.href = url;
  else window.location.href = url;
}

// ---------------------------------------------------------------- admin view

/** ภาพรวมความคืบหน้า — super_admin / director (whole school) and dept_head (own department, enforced by RLS). */
export function DocProgressTab() {
  const { profile: me } = useAuth();
  const orgWide = isOrgWide(me!.roles);
  const { data: tasks = [] } = useDocTasks();
  const { data: files = [] } = useDocTaskFiles();
  const { data: allTeachers = [] } = useProfiles({ search: "", departmentId: "", role: "teacher", active: "true" });
  const { data: areas = [] } = useLearningAreas();
  const { data: departments = [] } = useDepartments();

  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | TeacherProgress["status"]>("");
  const [viewing, setViewing] = useState<ProfileRow | null>(null);

  const today = todayISO();
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const teachers = deptId ? allTeachers.filter((t) => t.department_id === deptId) : allTeachers;

  const rows = useMemo(
    () => teachers.map((t) => ({ teacher: t, p: teacherProgress(t, tasks, files, today) })),
    [teachers, tasks, files, today],
  );

  const totals = rows.reduce(
    (a, { p }) => ({ total: a.total + p.total, submitted: a.submitted + p.submitted, pending: a.pending + p.pending, overdue: a.overdue + p.overdue }),
    { total: 0, submitted: 0, pending: 0, overdue: 0 },
  );
  const pct = (n: number) => (totals.total ? Math.round((n / totals.total) * 1000) / 10 : 0);

  // By learning area (stacked bars)
  const byArea = useMemo(() => {
    const m = new Map<string, { name: string; submitted: number; pending: number; overdue: number }>();
    for (const { teacher, p } of rows) {
      if (!p.total) continue;
      const key = teacher.learning_area_id ?? "-";
      const e = m.get(key) ?? { name: areaName.get(key) ?? "ไม่ระบุกลุ่มสาระ", submitted: 0, pending: 0, overdue: 0 };
      e.submitted += p.submitted;
      e.pending += p.pending;
      e.overdue += p.overdue;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rows, areaName]);

  // By task type (donut): every teacher x task pair counts once
  const byType = useMemo(() => {
    const counts = new Map<DocTaskType, number>();
    for (const { teacher } of rows) {
      for (const t of tasks) if (taskTargetsTeacher(t, teacher)) counts.set(t.doc_type, (counts.get(t.doc_type) ?? 0) + 1);
    }
    return DOC_TASK_TYPES.map((t, i) => ({ ...t, count: counts.get(t.value) ?? 0, color: TYPE_COLORS[i]! })).filter((t) => t.count > 0);
  }, [rows, tasks]);
  const typeTotal = byType.reduce((n, t) => n + t.count, 0);
  let acc = 0;
  const donut = byType.length
    ? `conic-gradient(${byType.map((t) => `${t.color} ${(acc / typeTotal) * 360}deg ${((acc += t.count) / typeTotal) * 360}deg`).join(",")})`
    : "conic-gradient(#e5e7eb 0 360deg)";

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(
    ({ teacher, p }) =>
      (!q || profileFullName(teacher).toLowerCase().includes(q) || (teacher.email ?? "").toLowerCase().includes(q)) &&
      (!statusFilter || p.status === statusFilter),
  );
  const { page, setPage, pageCount, pageRows } = usePagination(filtered, [search, deptId, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard tone="accent" icon={<DocumentTextIcon className="h-5 w-5" />} label="เอกสารทั้งหมด" value={totals.total} />
        <SummaryCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="อัปโหลดแล้ว" value={totals.submitted} percent={pct(totals.submitted)} />
        <SummaryCard tone="warning" icon={<TimeIcon className="h-5 w-5" />} label="รอดำเนินการ" value={totals.pending} percent={pct(totals.pending)} />
        <SummaryCard tone="destructive" icon={<X className="h-5 w-5" />} label="เกินกำหนด" value={totals.overdue} percent={pct(totals.overdue)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold">ความคืบหน้าการอัปโหลดเอกสาร รายกลุ่มสาระ</h3>
          {byArea.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีข้อมูล</p>
          ) : (
            <ul className="space-y-1.5">
              {byArea.map((a) => {
                const total = a.submitted + a.pending + a.overdue;
                const w = (n: number) => `${(n / total) * 100}%`;
                return (
                  <li key={a.name} className="grid grid-cols-[8rem_1fr] items-center gap-3 text-xs">
                    <span className="truncate">{a.name}</span>
                    <div className="flex h-5 overflow-hidden rounded bg-muted text-[10px] font-medium text-white">
                      {a.submitted > 0 && <div className="flex items-center justify-center bg-success" style={{ width: w(a.submitted) }}>{Math.round((a.submitted / total) * 100)}%</div>}
                      {a.pending > 0 && <div className="flex items-center justify-center bg-warning" style={{ width: w(a.pending) }} />}
                      {a.overdue > 0 && <div className="flex items-center justify-center bg-destructive" style={{ width: w(a.overdue) }} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {(["submitted", "pending", "overdue"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", STATUS_STYLE[s].bar)} />
                {STATUS_STYLE[s].label}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold">งานเอกสาร รายประเภทเอกสาร</h3>
          {byType.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: donut }}>
                <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-card">
                  <span className="text-lg font-bold">{typeTotal.toLocaleString("th-TH")}</span>
                  <span className="text-[10px] text-muted-foreground">รายการ</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-2 text-xs">
                {byType.map((t) => (
                  <li key={t.value} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="flex-1 truncate">{t.label}</span>
                    <span className="font-medium">{t.count}</span>
                    <span className="w-12 text-right text-muted-foreground">{Math.round((t.count / typeTotal) * 1000) / 10}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อครู..." aria-label="ค้นหาครู" />
        </div>
        {orgWide && (
          <Select className="w-auto min-w-32" value={deptId} onChange={(e) => setDeptId(e.target.value)} aria-label="แผนก">
            <option value="">ทุกแผนก</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        )}
        <Select className="w-auto min-w-28" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          <option value="complete">ครบถ้วน</option>
          <option value="pending">รอดำเนินการ</option>
          <option value="overdue">เกินกำหนด</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="ไม่พบครู" description="ลองเปลี่ยนตัวกรอง" icon={DocumentTextIcon} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[48rem] text-xs">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">ครูผู้สอน</th>
                  <th className="px-3 py-2 font-medium">กลุ่มสาระ</th>
                  <th className="px-3 py-2 text-center font-medium">ทั้งหมด</th>
                  <th className="px-3 py-2 text-center font-medium">อัปโหลดแล้ว</th>
                  <th className="px-3 py-2 text-center font-medium">รอดำเนินการ</th>
                  <th className="px-3 py-2 text-center font-medium">เกินกำหนด</th>
                  <th className="px-3 py-2 font-medium">ความคืบหน้า</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ teacher, p }) => (
                  <tr key={teacher.id} onClick={() => setViewing(teacher)} className="cursor-pointer border-t border-border hover:bg-muted">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={profileFullName(teacher)} src={avatarUrl(teacher)} className="h-7 w-7 text-[9px]" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{profileFullName(teacher)}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{teacher.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">{areaName.get(teacher.learning_area_id ?? "") ?? "—"}</td>
                    <td className="px-3 py-3 text-center">{p.total}</td>
                    <td className="px-3 py-3 text-center">{p.submitted}</td>
                    <td className="px-3 py-3 text-center text-warning">{p.pending}</td>
                    <td className={cn("px-3 py-3 text-center", p.overdue && "text-destructive")}>{p.overdue}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full", STATUS_STYLE[p.status].bar)} style={{ width: `${p.percent}%` }} />
                        </div>
                        <span className="text-muted-foreground">{p.percent}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={p.status} label={p.status === "overdue" ? `เกินกำหนด ${p.overdue} รายการ` : undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <TeacherTasksSheet teacher={viewing} tasks={tasks} files={files} onClose={() => setViewing(null)} />
    </div>
  );
}

function SummaryCard({
  tone,
  icon,
  label,
  value,
  percent,
  chevron,
}: {
  tone: "accent" | "success" | "warning" | "destructive";
  icon: React.ReactNode;
  label: string;
  value: number;
  percent?: number;
  /** Shows a trailing arrow when the card is clickable. */
  chevron?: boolean;
}) {
  const bg = { accent: "bg-accent/10", success: "bg-success/10", warning: "bg-warning/10", destructive: "bg-destructive/10" }[tone];
  const fg = { accent: "text-accent", success: "text-success", warning: "text-warning", destructive: "text-destructive" }[tone];
  const bar = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive" }[tone];
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-3", bg)}>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70", fg)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p>
          <span className="font-heading text-xl font-semibold">{value.toLocaleString("th-TH")}</span>{" "}
          <span className="text-xs text-muted-foreground">รายการ</span>
        </p>
        {percent !== undefined && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{percent}%</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70">
              <div className={cn("h-full", bar)} style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </div>
      {chevron && <ChevronForward className={cn("h-4 w-4 shrink-0", fg)} />}
    </div>
  );
}

/** One teacher's tasks with status and submitted files (read-only for reviewers). */
function TeacherTasksSheet({
  teacher,
  tasks,
  files,
  onClose,
}: {
  teacher: ProfileRow | null;
  tasks: DocTask[];
  files: DocTaskFile[];
  onClose: () => void;
}) {
  const toast = useToast();
  const today = todayISO();
  const mine = teacher ? tasks.filter((t) => taskTargetsTeacher(t, teacher)) : [];
  return (
    <Sheet
      open={teacher !== null}
      onOpenChange={(o) => !o && onClose()}
      title={teacher ? profileFullName(teacher) : ""}
      description="งานเอกสารที่ได้รับมอบหมาย"
    >
      {mine.length === 0 ? (
        <p className="text-xs text-muted-foreground">ยังไม่มีงานเอกสารสำหรับครูท่านนี้</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((t) => {
            const fs = files.filter((f) => f.task_id === t.id && f.teacher_id === teacher!.id);
            return (
              <li key={t.id} className="space-y-1.5 rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {docTaskTypeLabel(t.doc_type)} · กำหนดส่ง {thDate(t.due_date)}
                    </div>
                  </div>
                  <StatusBadge status={taskStatus(t, fs.filter((f) => f.review_status !== "returned").length, today)} />
                </div>
                {fs.map((f) => (
                  <button key={f.id} type="button" onClick={() => void openFile(f.file_path, toast)} className="flex w-full items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-left text-xs hover:bg-border">
                    <DocumentTextIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <ChevronForward className="h-3 w-3" />
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

function CreateTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const orgWide = me!.roles.includes("super_admin") || me!.roles.includes("director");
  const { data: departments = [] } = useDepartments();
  const { data: areas = [] } = useLearningAreas();
  const create = useCreateDocTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState<DocTaskType>("lesson_plan");
  const [due, setDue] = useState("");
  const [deptId, setDeptId] = useState("");
  const [areaId, setAreaId] = useState("");

  function close() {
    setTitle("");
    setDescription("");
    setDue("");
    setDeptId("");
    setAreaId("");
    onClose();
  }

  const canSubmit = title.trim() && due && !create.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        doc_type: docType,
        due_date: due,
        // dept_head tasks are always pinned to their own department (RLS requires it)
        department_id: orgWide ? deptId || null : me!.department_id,
        learning_area_id: areaId || null,
        created_by: me!.id,
      },
      {
        onSuccess: () => {
          toast("สร้างงานเอกสารแล้ว");
          close();
        },
        onError: () => toast("สร้างงานไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title="สร้างงานเอกสาร"
      description="มอบหมายให้ครูส่งเอกสารภายในวันที่กำหนด"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>ยกเลิก</Button>
          <Button type="submit" form="create-doc-task" className="flex-1" disabled={!canSubmit}>
            {create.isPending ? <Spinner /> : "สร้างงาน"}
          </Button>
        </div>
      }
    >
      <form id="create-doc-task" onSubmit={submit} className="space-y-4">
        <Field label="ชื่องาน" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ประเภทเอกสาร" required>
            <Select value={docType} onChange={(e) => setDocType(e.target.value as DocTaskType)}>
              {DOC_TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="วันครบกำหนด" required>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="รายละเอียด (ไม่บังคับ)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="มอบหมายให้">
          <div className="space-y-2">
            {orgWide ? (
              <Select value={deptId} onChange={(e) => setDeptId(e.target.value)} aria-label="แผนก">
                <option value="">ทุกแผนก</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">ครูในแผนกของคุณ</p>
            )}
            <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} aria-label="กลุ่มสาระ">
              <option value="">ทุกกลุ่มสาระ</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        </Field>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------- teacher view

const typeColor = (t: DocTaskType) => TYPE_COLORS[DOC_TASK_TYPES.findIndex((x) => x.value === t)] ?? "#94a3b8";

/** Round-cornered doc icon tinted with the task type's colour. */
function TypeIcon({ type, className }: { type: DocTaskType; className?: string }) {
  const c = typeColor(type);
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", className)} style={{ background: `${c}1f`, color: c }}>
      <DocumentTextIcon className="h-5 w-5" />
    </span>
  );
}

type MyTab = "" | TaskStatus;

/** งานของฉัน — tasks that target the signed-in teacher: progress by type, what's due next, and a table with upload / remove of their own submissions. */
export function MyDocTasksTab() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: tasks = [] } = useDocTasks();
  const { data: files = [] } = useDocTaskFiles();
  const removeFile = useDeleteDocTaskFile();
  const [uploadFor, setUploadFor] = useState<DocTask | null>(null);
  const [tab, setTab] = useState<MyTab>("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const today = todayISO();

  const myFiles = files.filter((f) => f.teacher_id === me!.id);
  const rows = useMemo(
    () =>
      tasks
        .filter((t) => taskTargetsTeacher(t, me!))
        .map((t) => {
          const fs = myFiles.filter((f) => f.task_id === t.id);
          return { task: t, files: fs, status: taskStatus(t, fs.filter((f) => f.review_status !== "returned").length, today) };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, files, today],
  );

  const count = (s: TaskStatus) => rows.filter((r) => r.status === s).length;
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 1000) / 10 : 0);

  const byType = DOC_TASK_TYPES.map((t) => {
    const of = rows.filter((r) => r.task.doc_type === t.value);
    return { ...t, total: of.length, done: of.filter((r) => r.status === "submitted").length };
  }).filter((t) => t.total > 0);

  const upcoming = rows
    .filter((r) => r.status !== "submitted")
    .sort((a, b) => a.task.due_date.localeCompare(b.task.due_date))
    .slice(0, 5);

  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        (!tab || r.status === tab) &&
        (!typeFilter || r.task.doc_type === typeFilter) &&
        (!q || r.task.title.toLowerCase().includes(q) || (r.task.description ?? "").toLowerCase().includes(q)),
    )
    .sort((a, b) => a.task.due_date.localeCompare(b.task.due_date));
  const { page, setPage, pageCount, pageRows } = usePagination(filtered, [tab, search, typeFilter]);

  if (rows.length === 0) {
    return <EmptyState title="ยังไม่มีงานเอกสาร" description="เมื่อมีงานที่มอบหมายให้คุณ จะแสดงที่นี่" icon={DocumentTextIcon} />;
  }

  const tabs: { id: MyTab; label: string; n: number }[] = [
    { id: "", label: "ทั้งหมด", n: rows.length },
    { id: "pending", label: "รอดำเนินการ", n: count("pending") },
    { id: "overdue", label: "เกินกำหนด", n: count("overdue") },
    { id: "submitted", label: "อัปโหลดแล้ว", n: count("submitted") },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <SummaryCard tone="accent" icon={<DocumentTextIcon className="h-5 w-5" />} label="เอกสารทั้งหมด" value={rows.length} />
            <SummaryCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="อัปโหลดแล้ว" value={count("submitted")} percent={pct(count("submitted"))} />
            <SummaryCard tone="warning" icon={<TimeIcon className="h-5 w-5" />} label="รอดำเนินการ" value={count("pending")} percent={pct(count("pending"))} />
            <SummaryCard tone="destructive" icon={<X className="h-5 w-5" />} label="เกินกำหนด" value={count("overdue")} percent={pct(count("overdue"))} />
          </div>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold">ความคืบหน้ารายประเภทเอกสาร</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {byType.map((t) => {
                const p = Math.round((t.done / t.total) * 100);
                const c = typeColor(t.value);
                return (
                  <div key={t.value} className="space-y-2 rounded-xl p-3" style={{ background: `${c}14` }}>
                    <div className="flex items-center gap-2">
                      <TypeIcon type={t.value} className="h-9 w-9" />
                      <div className="min-w-0">
                        <div className="truncate text-xs text-muted-foreground">{t.label}</div>
                        <div className="text-base font-bold">
                          {t.done}/{t.total}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70">
                        <div className="h-full rounded-full" style={{ width: `${p}%`, background: c }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{p}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold">งานที่ต้องดำเนินการ</h3>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">ส่งครบทุกงานแล้ว</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map(({ task, status }) => {
                const d = new Date(`${task.due_date}T00:00:00`);
                return (
                  <li key={task.id} className="flex items-center gap-3">
                    <div className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-tight", STATUS_STYLE[status].cls)}>
                      <span className="text-sm font-bold">{d.getDate()}</span>
                      <span className="text-[10px]">{d.toLocaleDateString("th-TH", { month: "short" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{task.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{docTaskTypeLabel(task.doc_type)}</div>
                    </div>
                    <StatusBadge status={status} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="สถานะงาน" className="flex flex-wrap gap-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "border-b-2 pb-2 text-xs font-medium",
                  tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label} ({t.n})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-40">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเอกสาร..." aria-label="ค้นหาเอกสาร" />
            </div>
            <Select className="w-auto min-w-28" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="ประเภท">
              <option value="">ทุกประเภท</option>
              {DOC_TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">ไม่พบงานเอกสาร</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[44rem] text-xs">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">เอกสาร</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 font-medium">กำหนดส่ง</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                    <th className="px-3 py-2 font-medium">ไฟล์</th>
                    <th className="px-3 py-2 text-right font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ task: t, files: fs, status }) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <TypeIcon type={t.doc_type} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{t.title}</div>
                            {t.description && <div className="truncate text-[11px] text-muted-foreground">{t.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: `${typeColor(t.doc_type)}1f`, color: typeColor(t.doc_type) }}>
                          {docTaskTypeLabel(t.doc_type)}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2.5", status === "overdue" && "text-destructive")}>{thDate(t.due_date)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={status} /></td>
                      <td className="px-3 py-2.5">
                        {fs.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-1">
                            {fs.map((f) => (
                              <li key={f.id} className="flex items-center gap-2">
                                <button type="button" className="min-w-0 text-left" onClick={() => void openFile(f.file_path, toast)}>
                                  <span className="block max-w-[14rem] truncate font-medium">{f.title}</span>
                                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    อัปโหลด {thDate(f.created_at.slice(0, 10))} <ReviewChip status={f.review_status} />
                                  </span>
                                  {f.review_status === "returned" && f.review_note && (
                                    <span className="block max-w-[14rem] text-[11px] text-destructive">หมายเหตุ: {f.review_note}</span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  aria-label="ลบไฟล์"
                                  className="shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => confirm(`ลบไฟล์ "${f.title}"?`) && removeFile.mutate(f, { onError: () => toast("ลบไม่สำเร็จ", "error") })}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button size="icon" variant="outline" aria-label="อัปโหลดเอกสาร" onClick={() => setUploadFor(t)}>
                          <Upload className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>
        )}
      </section>

      <UploadTaskFileSheet task={uploadFor} onClose={() => setUploadFor(null)} />
    </div>
  );
}

// -------------------------------------------------------------- review view

const FILE_KINDS: { match: (m: string) => boolean; label: string; color: string }[] = [
  { match: (m) => m === "application/pdf", label: "PDF", color: "#ef4444" },
  { match: (m) => m.includes("wordprocessingml"), label: "DOC", color: "#3b82f6" },
  { match: (m) => m.includes("presentationml"), label: "PPT", color: "#f97316" },
  { match: (m) => m.includes("spreadsheetml"), label: "XLS", color: "#10b981" },
];

/** Small coloured file-format tile (PDF / DOC / PPT / XLS / IMG) from the mime type. */
function FileKindBadge({ mime }: { mime: string }) {
  const kind = FILE_KINDS.find((k) => k.match(mime)) ?? { label: "IMG", color: "#8b5cf6" };
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold"
      style={{ background: `${kind.color}1f`, color: kind.color }}
    >
      {kind.label}
    </span>
  );
}

const thDateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} ${new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;

type ReviewTab = "" | DocTaskReviewStatus;

/** ตรวจเอกสาร — inbox of every submitted file the reviewer may see (RLS: all / own department), approve or send back with a note. */
export function ReviewDocsTab() {
  const { data: tasks = [] } = useDocTasks();
  const { data: files = [] } = useDocTaskFiles();
  const { data: teachers = [] } = useProfiles({ search: "", departmentId: "", role: "teacher", active: "" });
  const [tab, setTab] = useState<ReviewTab>("pending");
  const [search, setSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const count = (s: DocTaskReviewStatus) => files.filter((f) => f.review_status === s).length;
  // Teacher x task pairs past due with nothing (usable) submitted — same rule as the overview tab.
  const today = todayISO();
  const overdueCount = teachers.reduce((n, t) => n + teacherProgress(t, tasks, files, today).overdue, 0);

  const q = search.trim().toLowerCase();
  const filtered = files
    .filter((f) => {
      if (tab && f.review_status !== tab) return false;
      if (taskFilter && f.task_id !== taskFilter) return false;
      if (!q) return true;
      const teacher = teacherById.get(f.teacher_id);
      return (
        f.title.toLowerCase().includes(q) ||
        f.file_name.toLowerCase().includes(q) ||
        (teacher ? profileFullName(teacher).toLowerCase().includes(q) : false)
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { page, setPage, pageCount, pageRows } = usePagination(filtered, [tab, search, taskFilter]);
  const reviewing = files.find((f) => f.id === reviewingId) ?? null;

  const tabs: { id: ReviewTab; label: string; n: number }[] = [
    { id: "pending", label: "รอตรวจ", n: count("pending") },
    { id: "approved", label: "อนุมัติแล้ว", n: count("approved") },
    { id: "returned", label: "ส่งกลับแก้ไข", n: count("returned") },
    { id: "", label: "ทั้งหมด", n: files.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="สถานะการตรวจ" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} ({t.n})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-40">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาครูหรือเอกสาร..." aria-label="ค้นหา" />
          </div>
          <Select className="w-auto min-w-32" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} aria-label="งาน">
            <option value="">ทุกงาน</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </Select>
          <Button size="icon" aria-label="สร้างงานเอกสาร" onClick={() => setCreating(true)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(
          [
            { tone: "accent", s: "pending", icon: <DocumentTextIcon className="h-5 w-5" />, n: count("pending") },
            { tone: "success", s: "approved", icon: <CheckmarkCircleIcon className="h-5 w-5" />, n: count("approved") },
            { tone: "warning", s: "returned", icon: <TimeIcon className="h-5 w-5" />, n: count("returned") },
          ] as const
        ).map((c) => (
          <button key={c.s} type="button" onClick={() => setTab(c.s)} className="text-left">
            <SummaryCard tone={c.tone} icon={c.icon} label={REVIEW_STYLE[c.s].label} value={c.n} chevron />
          </button>
        ))}
        <SummaryCard tone="destructive" icon={<X className="h-5 w-5" />} label="เกินกำหนด" value={overdueCount} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="ไม่มีเอกสารให้ตรวจ" description="เอกสารที่ครูส่งเข้ามาจะแสดงที่นี่" icon={DocumentTextIcon} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[56rem] text-xs">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">เอกสาร</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">ครูผู้สอน</th>
                  <th className="px-3 py-2 font-medium">วันที่ส่ง</th>
                  <th className="px-3 py-2 font-medium">กำหนดส่ง</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((f) => {
                  const task = taskById.get(f.task_id);
                  const teacher = teacherById.get(f.teacher_id);
                  return (
                    <tr key={f.id} onClick={() => setReviewingId(f.id)} className="cursor-pointer border-t border-border hover:bg-muted">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <FileKindBadge mime={f.mime_type} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{f.title}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{task?.title ?? f.file_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {task && (
                          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: `${typeColor(task.doc_type)}1f`, color: typeColor(task.doc_type) }}>
                            {docTaskTypeLabel(task.doc_type)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {teacher ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={profileFullName(teacher)} src={avatarUrl(teacher)} className="h-7 w-7 text-[9px]" />
                            {profileFullName(teacher)}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{thDateTime(f.created_at)}</td>
                      <td className={cn("px-3 py-2.5", task && f.created_at.slice(0, 10) > task.due_date && "text-destructive")}>
                        {task ? thDate(task.due_date) : "—"}
                      </td>
                      <td className="px-3 py-2.5"><ReviewChip status={f.review_status} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <Button size="icon" variant="outline" aria-label="ตรวจเอกสาร" onClick={(e) => { e.stopPropagation(); setReviewingId(f.id); }}>
                          <EyeIcon className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <CreateTaskSheet open={creating} onClose={() => setCreating(false)} />
      <ReviewSheet file={reviewing} task={reviewing ? taskById.get(reviewing.task_id) ?? null : null} teacher={reviewing ? teacherById.get(reviewing.teacher_id) ?? null : null} onClose={() => setReviewingId(null)} />
    </div>
  );
}

function ReviewSheet({
  file,
  task,
  teacher,
  onClose,
}: {
  file: DocTaskFile | null;
  task: DocTask | null;
  teacher: ProfileRow | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const review = useReviewDocTaskFile();
  const [note, setNote] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function close() {
    setNote("");
    setPreviewUrl(null);
    onClose();
  }

  async function open() {
    if (!file) return;
    const isPdf = file.mime_type === "application/pdf";
    // Non-PDF opens in a new tab: the blank tab must be created synchronously (popup blockers).
    const tab = isPdf ? null : window.open("", "_blank");
    const url = await docFileSignedUrl(file.file_path);
    if (!url) {
      tab?.close();
      toast("เปิดไฟล์ไม่สำเร็จ", "error");
      return;
    }
    if (isPdf) setPreviewUrl(url);
    else if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  function submit(status: "approved" | "returned") {
    if (!file) return;
    if (status === "returned" && !note.trim()) {
      toast("กรุณาระบุหมายเหตุที่ส่งกลับแก้ไข", "error");
      return;
    }
    review.mutate(
      { fileId: file.id, status, note: note.trim() || null },
      {
        onSuccess: () => {
          toast(status === "approved" ? "อนุมัติแล้ว" : "ส่งกลับแก้ไขแล้ว");
          close();
        },
        onError: () => toast("บันทึกผลการตรวจไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={file !== null}
      onOpenChange={(o) => !o && close()}
      title="ตรวจเอกสาร"
      description={file?.title}
      wide
      footer={
        file ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 text-destructive" disabled={review.isPending} onClick={() => submit("returned")}>
              ส่งกลับแก้ไข
            </Button>
            <Button type="button" className="flex-1" disabled={review.isPending} onClick={() => submit("approved")}>
              {review.isPending ? <Spinner /> : "อนุมัติ"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {file && (
        <div className="space-y-4">
          <div className="space-y-1 rounded-xl border border-border p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{task?.title ?? "—"}</span>
              <ReviewChip status={file.review_status} />
            </div>
            <div className="text-muted-foreground">
              {teacher ? profileFullName(teacher) : "—"} · ส่งเมื่อ {thDate(file.created_at.slice(0, 10))}
              {task ? ` · กำหนดส่ง ${thDate(task.due_date)}` : ""}
            </div>
            <div className="text-muted-foreground">{file.file_name}</div>
            {file.review_note && <div className="text-destructive">หมายเหตุเดิม: {file.review_note}</div>}
          </div>

          {previewUrl ? (
            <iframe src={previewUrl} title={file.title} className="h-[60vh] w-full rounded-lg border border-border" />
          ) : (
            <Button type="button" variant="outline" onClick={() => void open()}>
              <DocumentTextIcon className="h-3.5 w-3.5" /> เปิดดูไฟล์
            </Button>
          )}

          <Field label="หมายเหตุ (จำเป็นเมื่อส่งกลับแก้ไข)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

function UploadTaskFileSheet({ task, onClose }: { task: DocTask | null; onClose: () => void }) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const upload = useUploadDocTaskFile();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  function close() {
    setFile(null);
    setTitle("");
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !file) return;
    upload.mutate(
      { file, taskId: task.id, teacherId: me!.id, title: title.trim() || file.name },
      {
        onSuccess: () => {
          toast("อัปโหลดแล้ว");
          close();
        },
        onError: (err) => toast(err instanceof Error && err.message ? err.message : "อัปโหลดไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={task !== null}
      onOpenChange={(o) => !o && close()}
      title="อัปโหลดเอกสาร"
      description={task?.title}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>ยกเลิก</Button>
          <Button type="submit" form="upload-task-file" className="flex-1" disabled={!file || upload.isPending}>
            {upload.isPending ? <Spinner /> : "อัปโหลด"}
          </Button>
        </div>
      }
    >
      <form id="upload-task-file" onSubmit={submit} className="space-y-4">
        <Field label="ไฟล์ (PDF, Word, PowerPoint, Excel, รูปภาพ — ไม่เกิน 20 MB)" required>
          <input
            type="file"
            accept={DOC_ACCEPT}
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
        </Field>
        <Field label="ชื่อเอกสาร">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
