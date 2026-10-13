import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  AppsIcon,
  BarChartIcon,
  BookIcon,
  CheckmarkCircleIcon,
  ChevronForward,
  ClipboardIcon,
  DocumentTextIcon,
  LibraryIcon,
  ListIcon,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Pagination, Select } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { usePagination } from "@/hooks/usePagination";
import { useSubjects } from "@/hooks/useCurriculum";
import {
  DOC_ACCEPT,
  type DocLessonNode,
  docFilePaths,
  docFileSignedUrl,
  useAllGradeLevels,
  useCreateDocLesson,
  useDeleteDocFile,
  useDeleteDocLesson,
  useDocFiles,
  useDocTree,
  useDocSummary,
  useSubjectGradeLevelIds,
  useSubjectClassroomCount,
  useUpdateDocLesson,
  useUploadDocFile,
} from "@/hooks/useDocuments";
import { useClassroomsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import { useMySubjects } from "@/hooks/usePractice";
import { useDepartments } from "@/hooks/useProfiles";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { DocFile, Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { DocProgressTab, MyDocTasksTab, ReviewDocsTab } from "@/routes/DocProgress";
import { EditableName } from "@/routes/Practice";

// เอกสาร — วิชา -> ระดับชั้น -> เนื้อหาหลัก -> ไฟล์.
// Teachers/managers curate; students/parents read the grade they're in. See migration 0071.

export function Documents() {
  const { profile: me, myStudent } = useAuth();
  const isParent = me?.roles.includes("parent") ?? false;
  if (me && (me.roles.includes("teacher") || canManage(me.roles))) return <TeacherDocuments />;
  if (myStudent || isParent) return <StudentDocuments />;
  return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
}

function TeacherDocuments() {
  const { profile: me } = useAuth();
  const isManager = canManage(me!.roles);
  const orgWide = isOrgWide(me!.roles);
  const { data: assignments = [] } = useMyTeachingAssignments(!isManager ? me!.id : null);
  const { data: teacherSubjects = [] } = useSubjectsByIds([...new Set(assignments.map((a) => a.subject_id))]);
  const { data: managerSubjects = [] } = useSubjects(
    {
      search: "",
      departmentId: orgWide ? "" : (me!.department_id ?? ""),
      learningAreaId: "",
      gradeLevelId: "",
      term: "",
      subjectType: "",
      includeInactive: false,
    },
    { enabled: isManager },
  );
  const browser = <DocBrowser subjects={isManager ? managerSubjects : teacherSubjects} canEdit showDepartments={isManager && orgWide} />;

  // งานเอกสาร tabs: reviewers (super_admin / director / dept_head) track progress, teachers answer their tasks.
  const tabs = [
    ...(me!.roles.some((r) => r === "super_admin" || r === "director" || r === "dept_head")
      ? [
          { id: "progress", label: "ภาพรวม", icon: BarChartIcon },
          { id: "review", label: "ตรวจเอกสาร", icon: CheckmarkCircleIcon },
        ]
      : []),
    { id: "docs", label: "เอกสารการสอน", icon: DocumentTextIcon },
    ...(me!.roles.includes("teacher") ? [{ id: "mine", label: "งานของฉัน", icon: ClipboardIcon }] : []),
  ];
  // First tab is the landing one: progress overview for reviewers, documents list for everyone else.
  const [tab, setTab] = useState(tabs[0]!.id);
  if (tabs.length === 1) return browser;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="หมวดเอกสาร" className="flex w-full flex-wrap border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-medium",
              tab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "progress" ? <DocProgressTab /> : tab === "review" ? <ReviewDocsTab /> : tab === "mine" ? <MyDocTasksTab /> : browser}
    </div>
  );
}

function StudentDocuments() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = options.find((s) => s.id === selectedId) ?? options[0] ?? null;

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีข้อมูล" description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                current.id === s.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.first_name} {s.last_name}
            </button>
          ))}
        </div>
      )}
      <StudentDocBrowser key={current.id} studentId={current.id} />
    </div>
  );
}

function StudentDocBrowser({ studentId }: { studentId: string }) {
  const { data: classroom } = useMyCurrentClassroom(studentId);
  const { data: subjectIds = [] } = useMySubjects(classroom?.classroomId ?? null, classroom?.academicYear ?? null);
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const { data: classrooms = [] } = useClassroomsByIds(classroom ? [classroom.classroomId] : []);
  return <DocBrowser subjects={subjects} fixedGradeLevelId={classrooms[0]?.grade_level_id ?? null} canEdit={false} />;
}

const SUBJECT_TINTS = [
  "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
  "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
];

/** Deterministic tint per subject (subjects carry no color/icon field) — same id always lands on the same color. */
function subjectTint(subjectId: string) {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_TINTS[hash % SUBJECT_TINTS.length]!;
}

type SortKey = "az" | "za" | "files";

/** Landing: banner, search + grade filter, subject cards (grid/list). Opening a card goes to SubjectDocs. `fixedGradeLevelId` (students) pins the grade. */
function DocBrowser({
  subjects,
  canEdit,
  fixedGradeLevelId,
  showDepartments = false,
}: {
  subjects: Subject[];
  canEdit: boolean;
  fixedGradeLevelId?: string | null;
  /** Org-wide managers only — adds the แผนก filter. */
  showDepartments?: boolean;
}) {
  const [openId, setOpenId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [gradeCode, setGradeCode] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data: gradeLevels = [] } = useAllGradeLevels();
  const { data: summary } = useDocSummary();
  const { data: departments = [] } = useDepartments();

  const gradeById = new Map(gradeLevels.map((g) => [g.id, g]));
  // อนุบาล (K) → ประถม (P) → มัธยม (M), then by number — sort_order alone interleaves departments.
  const levelRank = (code: string) => "KPM".indexOf(code[0]?.toUpperCase() ?? "");
  const gradeCodes = [
    ...new Set(gradeLevels.filter((g) => !departmentId || g.department_id === departmentId).map((g) => g.code)),
  ].sort((a, b) => levelRank(a) - levelRank(b) || Number.parseInt(a.slice(1)) - Number.parseInt(b.slice(1)));
  const q = search.trim().toLowerCase();
  const cards = subjects
    .filter((s) => !departmentId || s.department_id === departmentId)
    .map((s) => {
      const sum = summary?.get(s.id);
      const grades = [...(sum?.gradeLevelIds ?? [])]
        .map((id) => gradeById.get(id))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .sort((a, b) => a.sort_order - b.sort_order);
      // No docs yet -> fall back to the subject's suggested grade so the card still carries a level badge.
      const suggested = s.suggested_grade_level_id ? gradeById.get(s.suggested_grade_level_id) : undefined;
      return { subject: s, grades: grades.length || !suggested ? grades : [suggested], files: sum?.fileCount ?? 0 };
    })
    .filter(
      (c) =>
        (!q || c.subject.name_th.toLowerCase().includes(q) || c.subject.code.toLowerCase().includes(q)) &&
        (!gradeCode || c.grades.some((g) => g.code === gradeCode)),
    )
    .sort((a, b) =>
      sort === "files"
        ? b.files - a.files
        : sort === "za"
          ? b.subject.name_th.localeCompare(a.subject.name_th, "th")
          : a.subject.name_th.localeCompare(b.subject.name_th, "th"),
    );

  const { page, setPage, pageCount, pageRows } = usePagination(cards, [search, gradeCode, sort, departmentId], 20);

  const open = subjects.find((s) => s.id === openId) ?? null;
  if (open) {
    return (
      <SubjectDocs subject={open} canEdit={canEdit} fixedGradeLevelId={fixedGradeLevelId} onBack={() => setOpenId("")} />
    );
  }

  return (
    <div className="page-fill gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหารายวิชา หรือรหัสวิชา..."
            className="pl-9"
            aria-label="ค้นหา"
          />
        </div>
        {showDepartments && (
          <Select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setGradeCode("");
            }}
            aria-label="แผนก"
            placeholder="ทุกแผนก"
            className="w-40"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        {fixedGradeLevelId === undefined && (
          <Select
            value={gradeCode}
            onChange={(e) => setGradeCode(e.target.value)}
            aria-label="ระดับชั้น"
            placeholder="ทุกระดับชั้น"
            className="w-40"
          >
            {gradeCodes.map((c) => (
              <option key={c} value={c}>
                {gradeShortLabel(c)}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">รายวิชาทั้งหมด</h2>
          <p className="text-xs text-muted-foreground">เลือกวิชาเพื่อ{canEdit ? "จัดการ" : "ดู"}เอกสารการสอน</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "flex h-6 w-8 items-center justify-center rounded-md",
                  view === v ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="เรียงตาม"
            className="w-44"
          >
            <option value="az">เรียงตาม: ชื่อ A-Z</option>
            <option value="za">เรียงตาม: ชื่อ Z-A</option>
            <option value="files">เรียงตาม: เอกสารมากสุด</option>
          </Select>
        </div>
      </div>

      {cards.length === 0 ? (
        <EmptyState title="ไม่พบรายวิชา" description="ลองเปลี่ยนคำค้นหาหรือระดับชั้น" />
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[32rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                <th className="px-3 py-2 font-medium">วิชา</th>
                <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2 text-right font-medium">เอกสาร</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ subject: s, grades, files }) => (
                <tr
                  key={s.id}
                  onClick={() => setOpenId(s.id)}
                  className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                >
                  <td className="px-3 py-3">{s.code}</td>
                  <td className="max-w-xs truncate px-3 py-3">{s.name_th}</td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap gap-1">
                      {grades.slice(0, 3).map((g) => (
                        <span key={g.id} className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                          {gradeShortLabel(g.code)}
                        </span>
                      ))}
                      {grades.length > 3 && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                          +{grades.length - 3}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">{files}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <ChevronForward className="h-3 w-3" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pageRows.map(({ subject: s, grades, files }) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpenId(s.id)}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", subjectTint(s.id))}>
                  <BookIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{s.name_th}</div>
                  <div className="truncate text-[11px] uppercase text-muted-foreground">{s.code}</div>
                  {grades.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {grades.slice(0, 3).map((g) => (
                        <span key={g.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {gradeShortLabel(g.code)}
                        </span>
                      ))}
                      {grades.length > 3 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                          +{grades.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <DocumentTextIcon className="h-3.5 w-3.5" /> เอกสาร {files} รายการ
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
                  <ChevronForward className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto">
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
    </div>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Button className="active:scale-100" size="sm" variant="ghost" onClick={onBack}>
      <ChevronForward className="h-3 w-3 rotate-180" /> {label}
    </Button>
  );
}

type LessonSort = "order" | "az" | "files";

/** One subject at one grade: banner + stats, then lessons -> files. `fixedGradeLevelId` (students) pins the grade. */
function SubjectDocs({
  subject,
  canEdit,
  fixedGradeLevelId,
  onBack,
}: {
  subject: Subject;
  canEdit: boolean;
  fixedGradeLevelId?: string | null;
  onBack: () => void;
}) {
  const [pickedGradeId, setPickedGradeId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LessonSort>("order");
  const [view, setView] = useState<"list" | "grid">("list");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPreset, setUploadPreset] = useState<UploadPreset>({});
  const { data: gradeLevels = [] } = useAllGradeLevels();
  const { data: curriculumGradeIds = [] } = useSubjectGradeLevelIds(subject.id);
  const { data: summary } = useDocSummary();
  const create = useCreateDocLesson();
  const toast = useToast();

  // Grades the subject really belongs to: curriculum bindings + suggested grade + any grade that already has lessons.
  // Falls back to every grade of the department only when none of those exist, so a new subject stays usable.
  const relevantIds = new Set([
    ...curriculumGradeIds,
    ...(subject.suggested_grade_level_id ? [subject.suggested_grade_level_id] : []),
    ...(summary?.get(subject.id)?.gradeLevelIds ?? []),
  ]);
  const deptGrades = gradeLevels.filter((g) => g.department_id === subject.department_id);
  const gradeOptions = relevantIds.size ? deptGrades.filter((g) => relevantIds.has(g.id)) : deptGrades;
  const gradeId = fixedGradeLevelId ?? (pickedGradeId || gradeOptions[0]?.id || "");
  const grade = gradeLevels.find((g) => g.id === gradeId) ?? null;

  const { data: tree = [] } = useDocTree(subject.id, gradeId || null);
  const { data: classroomCount = 0 } = useSubjectClassroomCount(subject.id, gradeId || null);

  function openUpload(preset: UploadPreset) {
    setUploadPreset(preset);
    setUploading(true);
  }

  const q = search.trim().toLowerCase();
  const lessons = tree
    .filter((l) => !q || l.name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "files" ? b.fileCount - a.fileCount : sort === "az" ? a.name.localeCompare(b.name, "th") : 0,
    );
  const totalFiles = tree.reduce((n, l) => n + l.fileCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton label={`${subject.code} ${subject.name_th}`} onBack={onBack} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          ชั้นเรียน
          {fixedGradeLevelId === undefined ? (
            <Select value={gradeId} onChange={(e) => setPickedGradeId(e.target.value)} aria-label="ระดับชั้น" className="w-28">
              {gradeOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {gradeShortLabel(g.code)}
                </option>
              ))}
            </Select>
          ) : (
            <span className="rounded-full bg-foreground px-3 py-1.5 font-medium text-background">
              {grade ? gradeShortLabel(grade.code) : "-"}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat icon={DocumentTextIcon} value={totalFiles} label="เอกสารทั้งหมด" />
        <Stat icon={LibraryIcon} value={tree.length} label="เนื้อหาหลัก" />
        {canEdit && <Stat icon={Users} value={classroomCount} label="ห้องเรียนที่ใช้" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเนื้อหา..."
            className="pl-9"
            aria-label="ค้นหาเนื้อหา"
          />
        </div>
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {(["list", "grid"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex h-6 w-8 items-center justify-center rounded-md",
                view === v ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as LessonSort)} aria-label="เรียงตาม" className="w-44">
          <option value="order">เรียงตาม: ลำดับเนื้อหา</option>
          <option value="az">เรียงตาม: ชื่อ A-Z</option>
          <option value="files">เรียงตาม: เอกสารมากสุด</option>
        </Select>
        {canEdit && (
          <>
            <Button className="active:scale-100" size="icon" variant="outline" aria-label="อัพโหลดเอกสาร" onClick={() => openUpload({})}>
              <Upload className="h-3 w-3" />
            </Button>
            <Button className="active:scale-100" size="icon" aria-label="เพิ่มเนื้อหาหลัก" onClick={() => setAdding((a) => !a)}>
              <Plus className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {canEdit && gradeId && (
        <AddLessonDialog
          open={adding}
          onClose={() => setAdding(false)}
          onAdd={(name) =>
            create.mutate(
              { subject_id: subject.id, grade_level_id: gradeId, name, sort_order: tree.length },
              { onSuccess: () => setAdding(false), onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
            )
          }
          pending={create.isPending}
        />
      )}

      {canEdit && <UploadDocDialog open={uploading} onClose={() => setUploading(false)} tree={tree} preset={uploadPreset} />}

      {!gradeId ? (
        <EmptyState title="ไม่พบระดับชั้น" description="ยังไม่มีห้องเรียนปัจจุบัน" />
      ) : lessons.length === 0 ? (
        <EmptyState
          title={tree.length === 0 ? "ยังไม่มีเนื้อหาหลัก" : "ไม่พบเนื้อหา"}
          description={tree.length === 0 ? (canEdit ? "กด “เพิ่มเนื้อหาหลัก” เพื่อเริ่มจัดหมวดเอกสาร" : "ครูยังไม่ได้เพิ่มเอกสาร") : "ลองเปลี่ยนคำค้นหา"}
        />
      ) : (
        <div className={cn("gap-3", view === "grid" ? "grid items-start md:grid-cols-2" : "flex flex-col")}>
          {lessons.map((l) => (
            <LessonRow key={l.id} lesson={l} index={tree.indexOf(l)} canEdit={canEdit} onUpload={openUpload} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Centered modal shell — Escape / backdrop click close it. Children mount only while open, so their form state resets each time. */
function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("animate-fade-in max-h-full w-full space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-md", wide ? "max-w-4xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Files of one เนื้อหาหลัก; PDFs preview inline in the popup, other types open in a new tab. */
function LessonFilesDialog({ lesson, canEdit, open, onClose }: { lesson: DocLessonNode; canEdit: boolean; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`เอกสาร · ${lesson.name}`} wide>
      <LessonFiles lesson={lesson} canEdit={canEdit} onClose={onClose} />
    </Modal>
  );
}

function LessonFiles({ lesson, canEdit, onClose }: { lesson: DocLessonNode; canEdit: boolean; onClose: () => void }) {
  const { data: files = [], isLoading } = useDocFiles(lesson.id);
  const remove = useDeleteDocFile();
  const toast = useToast();
  const [previewing, setPreviewing] = useState<{ file: DocFile; url: string } | null>(null);

  async function open(f: DocFile) {
    const isPdf = f.mime_type === "application/pdf";
    // Blank tab must open synchronously (popup blockers), then point at the signed URL.
    const tab = isPdf ? null : window.open("", "_blank");
    const url = await docFileSignedUrl(f.file_path);
    if (!url) {
      tab?.close();
      toast("เปิดไฟล์ไม่สำเร็จ", "error");
      return;
    }
    if (isPdf) setPreviewing({ file: f, url });
    else if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  if (previewing) {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <Button className="active:scale-100" size="sm" variant="ghost" onClick={() => setPreviewing(null)}>
            <ChevronForward className="h-3 w-3 rotate-180" /> กลับไปรายการ
          </Button>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{previewing.file.title}</span>
        </div>
        <iframe src={previewing.url} title={previewing.file.title} className="h-[70vh] w-full rounded-lg border border-border" />
      </>
    );
  }

  return (
    <>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">กำลังโหลด…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">ยังไม่มีเอกสารในเนื้อหาหลักนี้</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center">
              <button
                type="button"
                onClick={() => void open(f)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted"
              >
                <DocumentTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{f.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {f.file_name} · {formatSize(f.size_bytes)}
                    {f.review_status === "approved" && " · อนุมัติแล้ว"}
                    {f.review_status === "returned" && ` · ส่งกลับแก้ไข${f.review_note ? `: ${f.review_note}` : ""}`}
                  </span>
                </span>
                <ChevronForward className="h-3 w-3 text-muted-foreground" />
              </button>
              {canEdit && (
                <Button
                  className="mr-2 active:scale-100"
                  size="icon"
                  variant="ghost"
                  aria-label="ลบไฟล์"
                  onClick={() => {
                    if (!confirm(`ลบไฟล์ "${f.title}"?`)) return;
                    remove.mutate(f, { onError: () => toast("ลบไม่สำเร็จ", "error") });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button className="active:scale-100" variant="outline" onClick={onClose}>
          ปิด
        </Button>
      </div>
    </>
  );
}

function AddLessonDialog({
  open,
  onClose,
  onAdd,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
  pending: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="เพิ่มเนื้อหาหลัก">
      <AddLessonForm onClose={onClose} onAdd={onAdd} pending={pending} />
    </Modal>
  );
}

function AddLessonForm({ onClose, onAdd, pending }: { onClose: () => void; onAdd: (name: string) => void; pending: boolean }) {
  const [name, setName] = useState("");
  function submit() {
    const trimmed = name.trim();
    if (trimmed && !pending) onAdd(trimmed);
  }
  return (
    <>
      <Field label="ชื่อเนื้อหาหลัก" required>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="เช่น หน่วยที่ 1 ธาตุและตารางธาตุ"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button className="active:scale-100" variant="outline" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button className="active:scale-100" onClick={submit} disabled={!name.trim() || pending}>
          เพิ่ม
        </Button>
      </div>
    </>
  );
}

/** Upload from the subject page: pick เนื้อหาหลัก, then the file. */
function UploadDocDialog({
  open,
  onClose,
  tree,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  tree: DocLessonNode[];
  preset: UploadPreset;
}) {
  return (
    <Modal open={open} onClose={onClose} title="อัพโหลดเอกสาร">
      <UploadDocForm onClose={onClose} tree={tree} preset={preset} />
    </Modal>
  );
}

/** Pre-selects the lesson when upload is started from a lesson card instead of the toolbar. */
type UploadPreset = { lessonId?: string };

function UploadDocForm({ onClose, tree, preset }: { onClose: () => void; tree: DocLessonNode[]; preset: UploadPreset }) {
  const { profile: me } = useAuth();
  const upload = useUploadDocFile();
  const toast = useToast();
  const [lessonId, setLessonId] = useState(preset.lessonId ?? (tree.length === 1 ? tree[0]!.id : ""));
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);

  function submit() {
    if (!file || !lessonId || !me) return;
    upload.mutate(
      { file, lessonId, title: title.trim() || file.name, description: description.trim() || null, uploadedBy: me.id, onProgress: setProgress },
      {
        onSuccess: () => {
          toast("อัพโหลดแล้ว");
          onClose();
        },
        onError: (e) => toast(e instanceof Error && e.message ? e.message : "อัพโหลดไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <>
      <Field label="เนื้อหาหลัก" required>
        <Select
          value={lessonId}
          onChange={(e) => setLessonId(e.target.value)}
          placeholder="เลือกเนื้อหาหลัก"
        >
          {tree.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
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
      <Field label="คำอธิบาย (ไม่บังคับ)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {upload.isPending && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button className="active:scale-100" variant="outline" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button className="active:scale-100" onClick={submit} disabled={!file || !lessonId || upload.isPending}>
          {upload.isPending ? `กำลังอัพโหลด ${progress}%` : "อัพโหลด"}
        </Button>
      </div>
    </>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof BookIcon; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/60 text-foreground dark:bg-white/10">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-base font-bold leading-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** One เนื้อหาหลัก row: number, name, file count. Teachers can rename/delete (cascade, with a file-count confirm) and upload. */
function LessonRow({
  lesson,
  index,
  canEdit,
  onUpload,
}: {
  lesson: DocLessonNode;
  index: number;
  canEdit: boolean;
  onUpload: (preset: UploadPreset) => void;
}) {
  const [viewingFiles, setViewingFiles] = useState(false);
  const updateLesson = useUpdateDocLesson();
  const removeLesson = useDeleteDocLesson();
  const toast = useToast();

  async function deleteLesson() {
    const paths = await docFilePaths(lesson.id);
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์ในบทเรียนนี้จะถูกลบด้วย` : "";
    if (!confirm(`ลบเนื้อหาหลัก "${lesson.name}"?${extra}`)) return;
    removeLesson.mutate({ id: lesson.id, paths }, { onError: () => toast("ลบไม่สำเร็จ", "error") });
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {index + 1}
        </span>
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", subjectTint(lesson.id))}>
          <LibraryIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-bold">{lesson.name}</div>
        {canEdit && (
          <Button
            className="active:scale-100"
            size="icon"
            variant="outline"
            aria-label="อัพโหลดเอกสารในเนื้อหาหลักนี้"
            onClick={() => onUpload({ lessonId: lesson.id })}
          >
            <Upload className="h-3 w-3" />
          </Button>
        )}
        <button
          type="button"
          aria-label="ดูเอกสารทั้งหมดในเนื้อหาหลักนี้"
          onClick={() => setViewingFiles(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl text-left text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
            <DocumentTextIcon className="h-4 w-4" />
          </span>
          <div className="text-xs leading-tight">
            <div className="font-bold text-foreground">{lesson.fileCount}</div>
            <div className="text-[10px]">เอกสาร</div>
          </div>
        </button>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <EditableName noMotion value={lesson.name} onSave={(name) => updateLesson.mutate({ id: lesson.id, name })} />
            <Button className="active:scale-100" size="icon" variant="ghost" aria-label="ลบเนื้อหาหลัก" onClick={() => void deleteLesson()}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <LessonFilesDialog lesson={lesson} canEdit={canEdit} open={viewingFiles} onClose={() => setViewingFiles(false)} />
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
