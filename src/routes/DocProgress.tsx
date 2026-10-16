import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  CalendarIcon,
  CheckmarkCircleIcon,
  AppsIcon,
  DownloadIcon,
  LinkIcon,
  ProfileIcon,
  BookIcon,
  ChevronBack,
  ChevronForward,
  DocumentTextIcon,
  EyeIcon,
  ListIcon,
  MoreIcon,
  PencilIcon,
  Search,
  SortIcon,
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
  useDeleteDocTaskFile,
  useDocTaskFiles,
  useDocTasks,
  useReviewDocTaskFile,
  useUploadDocTaskFile,
} from "@/hooks/useDocTasks";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { DOC_ACCEPT, docFileSignedUrl, useAllGradeLevels, useDeleteDocFile, useDocCoverage, useRecentDocFiles, useReviewDocFile, useTeacherPairs } from "@/hooks/useDocuments";
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
} from "@/lib/docTasks";
import { textareaClass } from "@/routes/Roster";
import { isOrgWide } from "@/lib/roles";
import { teacherLessonProgress, type LessonStatus, type TeacherLessonProgress } from "@/lib/teacherDocProgress";
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

const LESSON_STATUS: Record<LessonStatus, { label: string; cls: string; bar: string }> = {
  complete: { label: "ครบถ้วน", cls: "bg-success/15 text-success", bar: "bg-success" },
  partial: { label: "ไม่ครบ", cls: "bg-warning/15 text-warning", bar: "bg-warning" },
  none: { label: "ยังไม่อัปโหลด", cls: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
  nodata: { label: "ไม่มีข้อมูล", cls: "bg-muted text-muted-foreground", bar: "bg-muted-foreground" },
};

function LessonStatusChip({ status }: { status: LessonStatus }) {
  const s = LESSON_STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium", s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function LessonProgressBar({ status, percent, wide }: { status: LessonStatus; percent: number | null; wide?: boolean }) {
  if (percent === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", wide ? "flex-1" : "w-24")}>
        <div className={cn("h-full", LESSON_STATUS[status].bar)} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-muted-foreground">{percent}%</span>
    </div>
  );
}

/** ภาพรวมความคืบหน้า — per teacher, the เนื้อหาหลัก of the subjects they teach that have an uploaded file (see lib/teacherDocProgress). super_admin / director see all, dept_head their own department (RLS). */
export function DocProgressTab() {
  const { profile: me } = useAuth();
  const orgWide = isOrgWide(me!.roles);
  const { data: coverage = [] } = useDocCoverage();
  const { data: pairsByTeacher = new Map<string, Set<string>>() } = useTeacherPairs();
  const { data: allTeachers = [] } = useProfiles({ search: "", departmentId: "", role: "teacher", active: "true" });
  const { data: areas = [] } = useLearningAreas();
  const { data: departments = [] } = useDepartments();

  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | LessonStatus>("");
  const [viewing, setViewing] = useState<{ teacher: ProfileRow; p: TeacherLessonProgress } | null>(null);

  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const teachers = deptId ? allTeachers.filter((t) => t.department_id === deptId) : allTeachers;

  const rows = useMemo(() => {
    const byKey = new Map(coverage.map((r) => [r.key, r]));
    return teachers.map((t) => ({ teacher: t, p: teacherLessonProgress(pairsByTeacher.get(t.id) ?? [], byKey) }));
  }, [teachers, coverage, pairsByTeacher]);

  const counts: Record<LessonStatus, number> = { complete: 0, partial: 0, none: 0, nodata: 0 };
  for (const { p } of rows) counts[p.status]++;
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 1000) / 10 : 0);

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(
    ({ teacher, p }) =>
      (!q || profileFullName(teacher).toLowerCase().includes(q) || (teacher.email ?? "").toLowerCase().includes(q)) &&
      (!statusFilter || p.status === statusFilter),
  );
  const { page, setPage, pageCount, pageRows } = usePagination(filtered, [search, deptId, statusFilter]);

  const cards: { status: "" | LessonStatus; tone: "accent" | "success" | "warning" | "destructive"; icon: React.ReactNode; label: string; value: number; percent?: number }[] = [
    { status: "", tone: "accent", icon: <DocumentTextIcon className="h-5 w-5" />, label: "ครูทั้งหมด", value: rows.length },
    { status: "complete", tone: "success", icon: <CheckmarkCircleIcon className="h-5 w-5" />, label: "ครบถ้วน", value: counts.complete, percent: pct(counts.complete) },
    { status: "partial", tone: "warning", icon: <TimeIcon className="h-5 w-5" />, label: "ไม่ครบ", value: counts.partial, percent: pct(counts.partial) },
    { status: "none", tone: "destructive", icon: <X className="h-5 w-5" />, label: "ยังไม่อัปโหลด", value: counts.none, percent: pct(counts.none) },
  ];

  return (
    <div className="space-y-4 pb-8">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((c) => (
          <button key={c.label} type="button" aria-pressed={statusFilter === c.status} onClick={() => setStatusFilter(c.status)} className="group text-left">
            <SummaryCard tone={c.tone} icon={c.icon} label={c.label} value={c.value} percent={c.percent} unit="คน" active={statusFilter === c.status} />
          </button>
        ))}
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
          {(Object.keys(LESSON_STATUS) as LessonStatus[]).map((s) => (
            <option key={s} value={s}>{LESSON_STATUS[s].label}</option>
          ))}
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
                  <th className="px-3 py-2 font-medium">วันเวลาบันทึกล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ teacher, p }) => (
                  <tr key={teacher.id} onClick={() => setViewing({ teacher, p })} className="cursor-pointer border-t border-border hover:bg-muted">
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
                    <td className="px-3 py-3 text-center">{p.uploaded}</td>
                    <td className="whitespace-nowrap px-3 py-3">{p.lastAt ? thDateTime(p.lastAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <TeacherLessonsSheet target={viewing} onClose={() => setViewing(null)} />
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
  active,
  unit = "รายการ",
}: {
  tone: "accent" | "success" | "warning" | "destructive";
  icon: React.ReactNode;
  label: string;
  value: number;
  percent?: number;
  /** Shows a trailing arrow when the card is clickable. */
  chevron?: boolean;
  /** Marks the card as the currently applied filter. */
  active?: boolean;
  unit?: string;
}) {
  const bg = { accent: "bg-accent/10", success: "bg-success/10", warning: "bg-warning/10", destructive: "bg-destructive/10" }[tone];
  const fg = { accent: "text-accent", success: "text-success", warning: "text-warning", destructive: "text-destructive" }[tone];
  const bar = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive" }[tone];
  const ring = { accent: "ring-accent", success: "ring-success", warning: "ring-warning", destructive: "ring-destructive" }[tone];
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-3 ring-2 ring-transparent transition-shadow group-hover:ring-border", bg, active && ring)}>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70", fg)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p>
          <span className="font-heading text-xl font-semibold">{value.toLocaleString("th-TH")}</span>{" "}
          <span className="text-xs text-muted-foreground">{unit}</span>
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

type PairFilter = "all" | "open" | "done";

const pairStatus = (pair: { total: number; uploaded: number }): LessonStatus =>
  !pair.total ? "nodata" : pair.uploaded >= pair.total ? "complete" : pair.uploaded === 0 ? "none" : "partial";

/** One teacher's subject x grade pairs with เนื้อหาหลัก uploaded / total, files and progress (read-only for reviewers). */
function TeacherLessonsSheet({ target, onClose }: { target: { teacher: ProfileRow; p: TeacherLessonProgress } | null; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PairFilter>("all");
  const [sort, setSort] = useState<"code" | "progress">("code");
  const { data: gradeLevels = [] } = useAllGradeLevels();
  const colors = useSubjectColors(gradeLevels);

  const pairs = target?.p.pairs ?? [];
  const done = (p: (typeof pairs)[number]) => pairStatus(p) === "complete";
  const doneCount = pairs.filter(done).length;
  const q = search.trim().toLowerCase();
  const shown = pairs
    .filter((p) => (filter === "all" ? true : filter === "done" ? done(p) : !done(p)))
    .filter((p) => !q || `${p.row?.code ?? ""} ${p.row?.nameTh ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "progress"
        ? (a.percent ?? -1) - (b.percent ?? -1)
        : (a.row?.code ?? "").localeCompare(b.row?.code ?? "", "th", { numeric: true }) ||
          (a.row?.gradeName ?? "").localeCompare(b.row?.gradeName ?? "", "th", { numeric: true }),
    );
  const tabs: [PairFilter, string, number][] = [
    ["all", "ทั้งหมด", pairs.length],
    ["open", "ยังไม่ครบ", pairs.length - doneCount],
    ["done", "ครบแล้ว", doneCount],
  ];

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setSearch("");
          setFilter("all");
          onClose();
        }
      }}
      title={target ? profileFullName(target.teacher) : ""}
      description="วิชาและระดับชั้นที่สอน"
      headerEnd={target && <LessonStatusChip status={target.p.status} />}
    >
      {!target || pairs.length === 0 ? (
        <p className="text-xs text-muted-foreground">ยังไม่มีการมอบหมายสอนสำหรับครูท่านนี้</p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัสวิชา หรือชื่อวิชา..." aria-label="ค้นหาวิชา" />
          </div>

          <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
              {tabs.map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                    filter === key ? "border-accent bg-accent/10 font-medium text-accent" : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label} ({n})
                </button>
              ))}
          </div>
          <div>
            <Select className="w-full" value={sort} onChange={(e) => setSort(e.target.value as "code" | "progress")} aria-label="เรียงลำดับ">
              <option value="code">เรียงตามรหัสวิชา</option>
              <option value="progress">เรียงตามความคืบหน้า</option>
            </Select>
          </div>

          <ul className="space-y-2">
            {shown.map((pair) => (
              <li key={pair.key} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", colors.shade(pair.row?.learningAreaId, pair.row?.gradeLevelId))}>
                  <BookIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1 space-y-1 leading-tight">
                  <p className="text-xs text-muted-foreground">{pair.row?.code ?? "—"}</p>
                  <p className="truncate text-sm font-medium">{pair.row?.nameTh ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{pair.row?.gradeName ?? "—"}</p>
                  <LessonProgressBar wide status={pairStatus(pair)} percent={pair.percent} />
                </div>
                <div className="shrink-0 border-l border-border pl-3 text-right text-xs">
                  <p className="font-medium">เนื้อหาหลัก {pair.uploaded} / {pair.total || "—"}</p>
                  <p className="mt-1 inline-flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                    <DocumentTextIcon className="h-3 w-3" />
                    {pair.files} ไฟล์
                  </p>
                </div>
              </li>
            ))}
            {shown.length === 0 && <li className="py-8 text-center text-xs text-muted-foreground">ไม่พบวิชาที่ตรงเงื่อนไข</li>}
          </ul>
        </div>
      )}
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
    return (
      <div className="space-y-4">
        <MyLessonDocs />
      </div>
    );
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

      <MyLessonDocs />

      <UploadTaskFileSheet task={uploadFor} onClose={() => setUploadFor(null)} />
    </div>
  );
}

/** เอกสารการสอนที่ฉันอัปโหลด — the signed-in teacher's own lesson uploads (doc_files) with review status and the reviewer's note. */
type LessonSort = "newest" | "oldest" | "subject";

function MyLessonDocs() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: uploads = [] } = useRecentDocFiles();
  const removeFile = useDeleteDocFile();
  const [sort, setSort] = useState<LessonSort>("newest");
  const [menu, setMenu] = useState<{ id: string; right: number; top?: number; bottom?: number } | null>(null);
  const mine = useMemo(() => {
    const list = uploads.filter((f) => f.uploaded_by === me!.id);
    return list.sort((a, b) =>
      sort === "subject"
        ? (a.doc_lessons?.subjects?.code ?? "").localeCompare(b.doc_lessons?.subjects?.code ?? "", "th", { numeric: true }) ||
          b.created_at.localeCompare(a.created_at)
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  }, [uploads, me, sort]);
  const { page, setPage, pageCount, pageRows } = usePagination(mine, [sort]);
  const menuFile = pageRows.find((f) => f.id === menu?.id);
  const cell = "border-l border-border/60 px-4 py-4";

  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 bg-accent/5 px-4 py-3">
          <DocumentTextIcon className="h-5 w-5" />
          <h3 className="flex-1 text-sm font-bold">เอกสารการสอนที่อัปโหลด ({mine.length})</h3>
          <div className="relative">
            <SortIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Select className="w-auto min-w-[9rem] pl-9" value={sort} onChange={(e) => setSort(e.target.value as LessonSort)} aria-label="เรียงลำดับ">
              <option value="newest">ล่าสุดก่อน</option>
              <option value="oldest">เก่าสุดก่อน</option>
              <option value="subject">รหัสวิชา</option>
            </Select>
          </div>
        </div>
        {mine.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">ยังไม่มีเอกสารการสอนที่อัปโหลด</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="border-y border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">เอกสาร</th>
                  {["รหัสวิชา", "ชื่อวิชา", "เนื้อหาหลัก", "เนื้อหาย่อย", "ผู้อนุมัติ", "อัปโหลดเมื่อ", "สถานะ", "จัดการ"].map((h) => (
                    <th key={h} className="border-l border-border/60 px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <button type="button" className="flex items-center gap-3 text-left" onClick={() => void openFile(f.file_path, toast)}>
                        <FileKindBadge mime={f.mime_type} />
                        <span className="min-w-0">
                          <span className="block max-w-[18rem] truncate text-sm font-medium">{f.title}</span>
                          <span className="block text-xs text-muted-foreground">{formatSize(f.size_bytes)}</span>
                        </span>
                      </button>
                    </td>
                    <td className={cell}>
                      {f.doc_lessons?.subjects?.code ? (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                          {f.doc_lessons.subjects.code}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cell}>{f.doc_lessons?.subjects?.name_th ?? "—"}</td>
                    <td className={cell}>{f.doc_lessons?.name ?? "—"}</td>
                    <td className={cell}>{f.doc_topics?.name ?? "—"}</td>
                    <td className={cn(cell, "whitespace-nowrap")}>{f.reviewer ? `${f.reviewer.first_name} ${f.reviewer.last_name}` : "—"}</td>
                    <td className={cn(cell, "whitespace-nowrap text-xs leading-relaxed")}>
                      {new Date(f.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                      <br />
                      {new Date(f.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                    </td>
                    <td className={cell}>
                      <ReviewChip status={f.review_status} />
                      {f.review_status === "returned" && f.review_note && (
                        <div className="mt-1 max-w-[14rem] text-[11px] text-destructive">หมายเหตุ: {f.review_note}</div>
                      )}
                    </td>
                    <td className={cell}>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="จัดการ"
                        aria-haspopup="menu"
                        onClick={(e) => {
                          if (menu?.id === f.id) return setMenu(null);
                          const b = e.currentTarget.getBoundingClientRect();
                          const right = window.innerWidth - b.right;
                          setMenu(b.bottom + 100 > window.innerHeight ? { id: f.id, right, bottom: window.innerHeight - b.top + 4 } : { id: f.id, right, top: b.bottom + 4 });
                        }}
                      >
                        <MoreIcon className="h-4 w-4 rotate-90" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {menu && menuFile && (
        <>
          <button type="button" aria-label="ปิดเมนู" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(null)} />
          <div
            role="menu"
            style={{ top: menu.top, bottom: menu.bottom, right: menu.right }}
            className="fixed z-40 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 text-left text-xs shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                setMenu(null);
                void openFile(menuFile.file_path, toast);
              }}
            >
              เปิดไฟล์
            </button>
            {menuFile.review_status !== "approved" && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-destructive hover:bg-muted"
                onClick={() => {
                  setMenu(null);
                  if (confirm(`ลบไฟล์ "${menuFile.title}"?`)) removeFile.mutate(menuFile, { onError: () => toast("ลบไม่สำเร็จ", "error") });
                }}
              >
                ลบไฟล์
              </button>
            )}
          </div>
        </>
      )}

      <PageFooter shown={pageRows.length} total={mine.length} page={page} pageCount={pageCount} onChange={setPage} />
    </section>
  );
}

/** "แสดง 1 จาก 20 รายการ" on the left, numbered page buttons on the right. */
function PageFooter({ shown, total, page, pageCount, onChange }: { shown: number; total: number; page: number; pageCount: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  // First, last and the pages around the current one; gaps become an ellipsis.
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const btn = "flex h-9 min-w-9 items-center justify-center rounded-lg border border-border px-2 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        แสดง {shown} จาก {total} รายการ
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="หน้าก่อนหน้า" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronBack className="h-4 w-4" />
        </button>
        {pages.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            {i > 0 && n - pages[i - 1]! > 1 && <span className="px-1">…</span>}
            <button
              type="button"
              aria-current={n === page ? "page" : undefined}
              className={cn(btn, n === page && "border-accent bg-accent/10 font-semibold text-accent")}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          </span>
        ))}
        <button type="button" aria-label="หน้าถัดไป" className={btn} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
          <ChevronForward className="h-4 w-4" />
        </button>
      </div>
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

const fileKindLabel = (mime: string) => (FILE_KINDS.find((k) => k.match(mime))?.label ?? "IMG");

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

/** One row of the review inbox: a task submission (doc_task_files) or a lesson upload (doc_files). */
type ReviewItem = {
  key: string;
  target: ReviewTarget;
  mime: string;
  size: number;
  subtitle: string;
  teacherId: string;
  /** Subject column: code over name for lesson uploads, task title over type for task submissions. */
  line1: string;
  line2: string;
  createdAt: string;
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** ตรวจเอกสาร — inbox of every submitted file the reviewer may see (RLS: all / own department), approve or send back with a note. */
export function ReviewDocsTab() {
  const { data: tasks = [] } = useDocTasks();
  const { data: files = [] } = useDocTaskFiles();
  const { data: uploads = [] } = useRecentDocFiles();
  const { data: people = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "" });
  const { data: teachers = [] } = useProfiles({ search: "", departmentId: "", role: "teacher", active: "" });
  const [tab, setTab] = useState<ReviewTab>("pending");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [view, setView] = useState<"list" | "grid">("list");
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  const [intent, setIntent] = useState<ReviewIntent>(null);
  const toast = useToast();
  const quickTask = useReviewDocTaskFile();
  const quickDoc = useReviewDocFile();

  function openReview(target: ReviewTarget, next: ReviewIntent = null) {
    setIntent(next);
    setReviewing(target);
  }

  function quickApprove(target: ReviewTarget) {
    (target.kind === "doc" ? quickDoc : quickTask).mutate(
      { fileId: target.file.id, status: "approved", note: null },
      { onSuccess: () => toast("อนุมัติแล้ว"), onError: () => toast("บันทึกผลการตรวจไม่สำเร็จ", "error") },
    );
  }

  const personById = new Map(people.map((t) => [t.id, t]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  // Teacher x task pairs past due with nothing (usable) submitted — same rule as the overview tab.
  const today = todayISO();
  const overdueCount = teachers.reduce((n, t) => n + teacherProgress(t, tasks, files, today).overdue, 0);
  const nameOf = (id: string) => {
    const p = personById.get(id);
    return p ? profileFullName(p) : "—";
  };

  const items: ReviewItem[] = [
    ...files.map((f): ReviewItem => {
      const task = taskById.get(f.task_id);
      return {
        key: `t${f.id}`,
        target: {
          kind: "task",
          file: f,
          heading: task?.title ?? "—",
          sender: nameOf(f.teacher_id),
          meta: `${nameOf(f.teacher_id)} · ส่งเมื่อ ${thDate(f.created_at.slice(0, 10))}${task ? ` · กำหนดส่ง ${thDate(task.due_date)}` : ""}`,
        },
        mime: f.mime_type,
        size: f.size_bytes,
        subtitle: task ? `งาน: ${task.title}` : "",
        teacherId: f.teacher_id,
        line1: task?.title ?? "—",
        line2: task ? docTaskTypeLabel(task.doc_type) : "",
        createdAt: f.created_at,
      };
    }),
    ...uploads.map((f): ReviewItem => {
      const subject = f.doc_lessons?.subjects;
      const where = [subject?.name_th, f.doc_lessons?.name].filter(Boolean).join(" · ");
      return {
        key: `d${f.id}`,
        target: {
          kind: "doc",
          file: f,
          heading: where || "เอกสาร",
          sender: nameOf(f.uploaded_by),
          meta: `${nameOf(f.uploaded_by)} · อัปโหลดเมื่อ ${thDate(f.created_at.slice(0, 10))}`,
        },
        mime: f.mime_type,
        size: f.size_bytes,
        subtitle: [f.doc_lessons?.name, f.description].filter(Boolean).join(" · "),
        teacherId: f.uploaded_by,
        line1: subject?.code ?? "—",
        line2: subject?.name_th ?? "",
        createdAt: f.created_at,
      };
    }),
  ];

  const count = (s: DocTaskReviewStatus) => items.filter((i) => i.target.file.review_status === s).length;
  const q = search.trim().toLowerCase();
  const shown = items
    .filter((i) => !tab || i.target.file.review_status === tab)
    .filter(
      (i) =>
        !q ||
        [i.target.file.title, i.target.file.file_name, i.subtitle, i.line1, i.line2, nameOf(i.teacherId)].some((v) =>
          v.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => (sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  const { page, setPage, pageCount, pageRows } = usePagination(shown, [tab, search, sort], 20);

  const teacherCell = (id: string) => {
    const p = personById.get(id);
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={p ? profileFullName(p) : "—"} src={p ? avatarUrl(p) : undefined} className="h-8 w-8 text-[10px]" />
        <span className="truncate text-xs font-medium">{p ? profileFullName(p) : "—"}</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อไฟล์ วิชา หรือชื่อครู..." aria-label="ค้นหา" />
        </div>
        <div className="flex items-center gap-2">
          <Select className="w-auto min-w-28" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="เรียงตาม">
            <option value="newest">ใหม่ล่าสุด</option>
            <option value="oldest">เก่าสุด</option>
          </Select>
          <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("flex h-full w-8 items-center justify-center rounded-md", view === v ? "bg-muted text-foreground" : "text-muted-foreground")}
              >
                {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(
          [
            { tone: "accent", s: "pending", icon: <DocumentTextIcon className="h-5 w-5" /> },
            { tone: "success", s: "approved", icon: <CheckmarkCircleIcon className="h-5 w-5" /> },
            { tone: "warning", s: "returned", icon: <TimeIcon className="h-5 w-5" /> },
          ] as const
        ).map((c) => (
          <button key={c.s} type="button" aria-pressed={tab === c.s} onClick={() => setTab(tab === c.s ? "" : c.s)} className="group text-left">
            <SummaryCard tone={c.tone} icon={c.icon} label={REVIEW_STYLE[c.s].label} value={count(c.s)} chevron active={tab === c.s} />
          </button>
        ))}
        <SummaryCard tone="destructive" icon={<X className="h-5 w-5" />} label="เกินกำหนด" value={overdueCount} />
      </div>

      <h3 className="text-sm font-semibold">เอกสารที่ครูอัปโหลด</h3>

      {shown.length === 0 ? (
        <EmptyState title="ไม่มีเอกสารให้ตรวจ" description="เอกสารที่ครูส่งหรืออัปโหลดจะแสดงที่นี่" icon={DocumentTextIcon} />
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[56rem] text-xs">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">ชื่อเอกสาร</th>
                <th className="px-3 py-2.5 font-medium">ครูผู้ส่ง</th>
                <th className="px-3 py-2.5 font-medium">รายวิชา</th>
                <th className="px-3 py-2.5 font-medium">วันที่อัปโหลด</th>
                <th className="px-3 py-2.5 font-medium">สถานะ</th>
                <th className="px-3 py-2.5 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((i) => (
                <tr key={i.key} className="hover:bg-muted/40">
                  <td className="max-w-[22rem] px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <FileKindBadge mime={i.mime} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{i.target.file.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fileKindLabel(i.mime)} · {formatSize(i.size)}
                        </div>
                        {i.subtitle && <div className="truncate text-[11px] text-muted-foreground">{i.subtitle}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{teacherCell(i.teacherId)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{i.line1}</div>
                    <div className="text-[11px] text-muted-foreground">{i.line2}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div>{thDate(i.createdAt.slice(0, 10))}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(i.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ReviewChip status={i.target.file.review_status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="icon" variant="outline" aria-label="ตรวจเอกสาร" title="ดู/ตรวจเอกสาร" onClick={() => openReview(i.target)}>
                        <EyeIcon className="h-3.5 w-3.5" />
                      </Button>
                      {i.target.file.review_status === "pending" && (
                        <>
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="อนุมัติ"
                            title="อนุมัติ"
                            className="text-success"
                            disabled={quickTask.isPending || quickDoc.isPending}
                            onClick={() => quickApprove(i.target)}
                          >
                            <CheckmarkCircleIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="outline" aria-label="แก้ไข" title="ส่งกลับให้แก้ไข" onClick={() => openReview(i.target, "edit")}>
                            <PencilIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="outline" aria-label="ปฏิเสธ" title="ปฏิเสธ" className="text-destructive" onClick={() => openReview(i.target, "reject")}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((i) => (
            <button key={i.key} type="button" onClick={() => openReview(i.target)} className="space-y-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <FileKindBadge mime={i.mime} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.target.file.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fileKindLabel(i.mime)} · {formatSize(i.size)}
                  </div>
                </div>
                <ReviewChip status={i.target.file.review_status} />
              </div>
              {teacherCell(i.teacherId)}
              <div className="text-[11px] text-muted-foreground">
                {[i.line1, i.line2].filter(Boolean).join(" · ")} · {thDateTime(i.createdAt)}
              </div>
            </button>
          ))}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <ReviewSheet target={reviewing} intent={intent} onClose={() => setReviewing(null)} />
    </div>
  );
}

/** null = open the full review (approve or send back); edit/reject jump straight to the note. */
type ReviewIntent = "edit" | "reject" | null;

type ReviewTarget = {
  kind: "task" | "doc";
  file: Pick<DocTaskFile, "id" | "title" | "file_path" | "file_name" | "mime_type" | "size_bytes" | "created_at" | "review_status" | "review_note">;
  heading: string;
  meta: string;
  sender: string;
};

/** Review dialog shared by task submissions (doc_task_files) and lesson uploads (doc_files). */
function ReviewSheet({ target, intent, onClose }: { target: ReviewTarget | null; intent: ReviewIntent; onClose: () => void }) {
  const toast = useToast();
  const reviewTask = useReviewDocTaskFile();
  const reviewDoc = useReviewDocFile();
  const review = target?.kind === "doc" ? reviewDoc : reviewTask;
  const file = target?.file ?? null;
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

  async function download() {
    if (!file) return;
    const url = await docFileSignedUrl(file.file_path);
    if (!url) return toast("ดาวน์โหลดไม่สำเร็จ", "error");
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    a.click();
  }

  // Signed URL — expires in 60 s (docFileSignedUrl), so the copied link is short-lived.
  async function copyLink() {
    if (!file) return;
    const url = await docFileSignedUrl(file.file_path);
    if (!url) return toast("คัดลอกลิงก์ไม่สำเร็จ", "error");
    await navigator.clipboard.writeText(url);
    toast("คัดลอกลิงก์แล้ว");
  }

  function submit(status: "approved" | "returned") {
    if (!file) return;
    if (status === "returned" && !note.trim()) {
      toast(intent === "reject" ? "กรุณาระบุเหตุผลที่ปฏิเสธ" : "กรุณาระบุหมายเหตุที่ส่งกลับแก้ไข", "error");
      return;
    }
    // There is no separate "rejected" state — a rejection is a send-back whose note says so.
    const text = note.trim();
    review.mutate(
      { fileId: file.id, status, note: text ? (intent === "reject" ? `ปฏิเสธ: ${text}` : text) : null },
      {
        onSuccess: () => {
          toast(status === "approved" ? "อนุมัติแล้ว" : intent === "reject" ? "ปฏิเสธแล้ว" : "ส่งกลับแก้ไขแล้ว");
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
      title={intent === "reject" ? "ปฏิเสธเอกสาร" : intent === "edit" ? "ส่งกลับให้แก้ไข" : "ตรวจเอกสาร"}
      description={file?.title}
      icon={<DocumentTextIcon className="h-5 w-5" />}
      closable
      wide
      footer={
        file ? (
          intent ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={close}>
                ยกเลิก
              </Button>
              <Button
                type="button"
                variant={intent === "reject" ? "outline" : "default"}
                className={cn("flex-1", intent === "reject" && "text-destructive")}
                disabled={review.isPending}
                onClick={() => submit("returned")}
              >
                {review.isPending ? <Spinner /> : intent === "reject" ? "ปฏิเสธ" : "ส่งกลับแก้ไข"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 text-destructive" disabled={review.isPending} onClick={() => submit("returned")}>
                ส่งกลับแก้ไข
              </Button>
              <Button type="button" className="flex-1" disabled={review.isPending} onClick={() => submit("approved")}>
                {review.isPending ? <Spinner /> : "อนุมัติ"}
              </Button>
            </div>
          )
        ) : undefined
      }
    >
      {file && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border p-3">
            <div className="flex gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <DocumentTextIcon className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{target!.heading}</span>
                  <ReviewChip status={file.review_status} />
                </div>
                <div className="text-xs text-muted-foreground">{target!.sender}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarIcon className="h-3.5 w-3.5" /> อัปโหลดเมื่อ {thDateTime(file.created_at)} น.
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{file.file_name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">{formatSize(file.size_bytes)}</span>
                </div>
              </div>
            </div>
            {file.review_note && <div className="text-xs text-destructive">หมายเหตุเดิม: {file.review_note}</div>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void open()}>
                <EyeIcon className="h-3.5 w-3.5" /> เปิดดูไฟล์
              </Button>
              <Button type="button" variant="outline" onClick={() => void download()}>
                <DownloadIcon className="h-3.5 w-3.5" /> ดาวน์โหลด
              </Button>
              <Button type="button" variant="outline" onClick={() => void copyLink()}>
                <LinkIcon className="h-3.5 w-3.5" /> คัดลอกลิงก์
              </Button>
            </div>
          </div>

          {previewUrl && <iframe src={previewUrl} title={file.title} className="h-[60vh] w-full rounded-lg border border-border" />}

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <DocumentTextIcon className="h-4 w-4" /> ข้อมูลเพิ่มเติม
            </h3>
            <div className="grid grid-cols-3 divide-x divide-border rounded-xl bg-muted/50 py-3 text-xs">
              {[
                { icon: ProfileIcon, label: "ผู้ส่งเอกสาร", value: target!.sender },
                { icon: CalendarIcon, label: "วันที่อัปโหลด", value: `${thDateTime(file.created_at)} น.` },
                { icon: DocumentTextIcon, label: "ขนาดไฟล์", value: `${formatSize(file.size_bytes)} ${file.mime_type === "application/pdf" ? "PDF" : ""}` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex min-w-0 items-start gap-2 px-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="text-sm font-medium">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              {intent === "reject" ? "เหตุผลที่ปฏิเสธ" : intent === "edit" ? "สิ่งที่ต้องแก้ไข" : "หมายเหตุ"}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {intent ? "(จำเป็น)" : "(จำเป็นเมื่อส่งกลับแก้ไข)"}
              </span>
            </h3>
            <textarea
              className={cn(textareaClass, "min-h-32")}
              placeholder="ระบุเหตุผลหรือรายละเอียดที่ต้องแก้ไข..."
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus={intent !== null}
            />
            <div className="text-right text-xs text-muted-foreground">{note.length}/500</div>
          </section>
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
