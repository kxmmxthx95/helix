import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { AppsIcon, BookIcon, ChevronForward, DocumentTextIcon, ListIcon, Plus, Search, X } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Pagination, Select } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { usePagination } from "@/hooks/usePagination";
import { useSubjects } from "@/hooks/useCurriculum";
import {
  DOC_ACCEPT,
  docFilePaths,
  docFileSignedUrl,
  useAllGradeLevels,
  useCreateDocLesson,
  useCreateDocTopic,
  useDeleteDocFile,
  useDeleteDocLesson,
  useDeleteDocTopic,
  useDocFiles,
  useDocLessons,
  useDocSummary,
  useSubjectGradeLevelIds,
  useDocTopics,
  useUpdateDocLesson,
  useUpdateDocTopic,
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
import { EditableName, NewNameInput } from "@/routes/Practice";

// เอกสาร — วิชา -> ระดับชั้น -> เนื้อหาหลัก -> เนื้อหาย่อย -> ไฟล์.
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
  return <DocBrowser subjects={isManager ? managerSubjects : teacherSubjects} canEdit showDepartments={isManager && orgWide} />;
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
                "tappable rounded-full px-3 py-1.5 text-xs font-medium",
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
  const [adding, setAdding] = useState(false);
  const { data: gradeLevels = [] } = useAllGradeLevels();
  const { data: summary } = useDocSummary();
  const { data: departments = [] } = useDepartments();

  const gradeById = new Map(gradeLevels.map((g) => [g.id, g]));
  const gradeCodes = [
    ...new Map(gradeLevels.filter((g) => !departmentId || g.department_id === departmentId).map((g) => [g.code, g.sort_order])).entries(),
  ]
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code);
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
        {canEdit && (
          <Button size="icon" aria-label="เพิ่มเอกสารการสอน" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {adding && (
        <Select
          value=""
          onChange={(e) => e.target.value && setOpenId(e.target.value)}
          aria-label="เลือกวิชาที่จะเพิ่มเอกสาร"
          placeholder="เลือกวิชาที่จะเพิ่มเอกสาร"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} {s.name_th}
            </option>
          ))}
        </Select>
      )}

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
                  "tappable flex h-6 w-8 items-center justify-center rounded-md",
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
              className="tappable group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md"
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

/** One subject: grade tabs (fixed for students), then lessons -> topics -> files. */
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
  const [lesson, setLesson] = useState<{ id: string; name: string } | null>(null);
  const [topic, setTopic] = useState<{ id: string; name: string } | null>(null);
  const { data: gradeLevels = [] } = useAllGradeLevels();

  const { data: curriculumGradeIds = [] } = useSubjectGradeLevelIds(subject.id);
  const { data: summary } = useDocSummary();
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

  if (lesson && topic) return <TopicFiles topic={topic} canEdit={canEdit} onBack={() => setTopic(null)} />;
  if (lesson) {
    return <TopicList lesson={lesson} canEdit={canEdit} onBack={() => setLesson(null)} onOpenTopic={setTopic} />;
  }

  return (
    <div className="space-y-3">
      <BackButton label={`${subject.code} ${subject.name_th}`} onBack={onBack} />
      {fixedGradeLevelId === undefined && (
        <div className="flex flex-wrap gap-1.5">
          {gradeOptions.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setPickedGradeId(g.id)}
              className={cn(
                "tappable rounded-full px-3 py-1.5 text-xs font-medium",
                gradeId === g.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {gradeShortLabel(g.code)}
            </button>
          ))}
        </div>
      )}
      {gradeId ? (
        <LessonList subject={subject} gradeLevelId={gradeId} canEdit={canEdit} onOpenLesson={setLesson} />
      ) : (
        <EmptyState title="ไม่พบระดับชั้น" description="ยังไม่มีห้องเรียนปัจจุบัน" />
      )}
    </div>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onBack}>
      <ChevronForward className="h-3 w-3 rotate-180" /> {label}
    </Button>
  );
}

function LessonList({
  subject,
  gradeLevelId,
  canEdit,
  onOpenLesson,
}: {
  subject: Subject;
  gradeLevelId: string;
  canEdit: boolean;
  onOpenLesson: (l: { id: string; name: string }) => void;
}) {
  const { data: lessons = [] } = useDocLessons(subject.id, gradeLevelId);
  const create = useCreateDocLesson();
  const update = useUpdateDocLesson();
  const remove = useDeleteDocLesson();
  const toast = useToast();

  async function onDelete(l: { id: string; name: string }) {
    const paths = await docFilePaths({ lessonId: l.id });
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์ในบทเรียนนี้จะถูกลบด้วย` : "";
    if (!confirm(`ลบบทเรียน "${l.name}"? เนื้อหาย่อยทั้งหมดจะถูกลบด้วย${extra}`)) return;
    remove.mutate({ id: l.id, paths }, { onError: () => toast("ลบไม่สำเร็จ", "error") });
  }

  return (
    <NameList
      title="เนื้อหาหลัก"
      emptyTitle="ยังไม่มีเนื้อหาหลัก"
      items={lessons}
      canEdit={canEdit}
      addPlaceholder="เพิ่มเนื้อหาหลัก"
      onOpen={onOpenLesson}
      onRename={(id, name) => update.mutate({ id, name })}
      onDelete={(l) => void onDelete(l)}
      onAdd={(name) =>
        create.mutate(
          { subject_id: subject.id, grade_level_id: gradeLevelId, name, sort_order: lessons.length },
          { onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
        )
      }
    />
  );
}

function TopicList({
  lesson,
  canEdit,
  onBack,
  onOpenTopic,
}: {
  lesson: { id: string; name: string };
  canEdit: boolean;
  onBack: () => void;
  onOpenTopic: (t: { id: string; name: string }) => void;
}) {
  const { data: topics = [] } = useDocTopics(lesson.id);
  const create = useCreateDocTopic();
  const update = useUpdateDocTopic();
  const remove = useDeleteDocTopic();
  const toast = useToast();

  async function onDelete(t: { id: string; name: string }) {
    const paths = await docFilePaths({ topicId: t.id });
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์จะถูกลบด้วย` : "";
    if (!confirm(`ลบเนื้อหาย่อย "${t.name}"?${extra}`)) return;
    remove.mutate({ id: t.id, paths }, { onError: () => toast("ลบไม่สำเร็จ", "error") });
  }

  return (
    <div className="space-y-3">
      <BackButton label={lesson.name} onBack={onBack} />
      <NameList
        title="เนื้อหาย่อย"
        emptyTitle="ยังไม่มีเนื้อหาย่อย"
        items={topics}
        canEdit={canEdit}
        addPlaceholder="เพิ่มเนื้อหาย่อย"
        onOpen={onOpenTopic}
        onRename={(id, name) => update.mutate({ id, name })}
        onDelete={(t) => void onDelete(t)}
        onAdd={(name) =>
          create.mutate(
            { lesson_id: lesson.id, name, sort_order: topics.length },
            { onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
          )
        }
      />
    </div>
  );
}

/** Shared row list for lessons and topics: click to open; teachers also get rename/delete and an add row. */
function NameList({
  title,
  emptyTitle,
  items,
  canEdit,
  addPlaceholder,
  onOpen,
  onRename,
  onDelete,
  onAdd,
}: {
  title: string;
  emptyTitle: string;
  items: { id: string; name: string }[];
  canEdit: boolean;
  addPlaceholder: string;
  onOpen: (item: { id: string; name: string }) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (item: { id: string; name: string }) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description={canEdit ? "เพิ่มด้านล่างเพื่อเริ่มจัดหมวดเอกสาร" : "ครูยังไม่ได้เพิ่มเอกสาร"} />
      ) : (
        <div className="table-panel">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{title}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-muted">
                  <td className="cursor-pointer px-3 py-3 font-medium" onClick={() => onOpen(item)}>
                    {item.name}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canEdit && (
                      <div className="flex items-center justify-end gap-1">
                        <EditableName value={item.name} onSave={(name) => onRename(item.id, name)} />
                        <Button size="icon" variant="ghost" aria-label="ลบ" onClick={() => onDelete(item)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-3">
          <NewNameInput placeholder={addPlaceholder} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function TopicFiles({
  topic,
  canEdit,
  onBack,
}: {
  topic: { id: string; name: string };
  canEdit: boolean;
  onBack: () => void;
}) {
  const { profile: me } = useAuth();
  const { data: files = [] } = useDocFiles(topic.id);
  const upload = useUploadDocFile();
  const remove = useDeleteDocFile();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [inputKey, setInputKey] = useState(0);

  // Open a blank tab synchronously (popup blockers), then point it at the signed URL.
  async function open(f: DocFile) {
    const tab = window.open("", "_blank");
    const url = await docFileSignedUrl(f.file_path);
    if (!url) {
      tab?.close();
      toast("เปิดไฟล์ไม่สำเร็จ", "error");
      return;
    }
    if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  function submit() {
    if (!file || !me) return;
    upload.mutate(
      { file, topicId: topic.id, title: title.trim() || file.name, description: description.trim() || null, uploadedBy: me.id },
      {
        onSuccess: () => {
          setFile(null);
          setTitle("");
          setDescription("");
          setInputKey((k) => k + 1);
        },
        onError: (e) => toast(e instanceof Error && e.message ? e.message : "อัพโหลดไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-3">
      <BackButton label={topic.name} onBack={onBack} />
      {files.length === 0 ? (
        <EmptyState title="ยังไม่มีเอกสาร" description={canEdit ? "อัพโหลดไฟล์ด้านล่าง" : "ครูยังไม่ได้อัพโหลดเอกสาร"} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2.5">
              <DocumentTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => void open(f)} className="tappable min-w-0 flex-1 text-left">
                <div className="truncate text-xs font-medium">{f.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.description ? `${f.description} · ` : ""}
                  {f.file_name} · {formatSize(f.size_bytes)}
                </div>
              </button>
              {canEdit && (
                <Button
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
      {canEdit && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Field label="ไฟล์ (PDF, Word, PowerPoint, Excel, รูปภาพ — ไม่เกิน 20 MB)">
            <input
              key={inputKey}
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
          <Button size="sm" onClick={submit} disabled={!file || upload.isPending}>
            {upload.isPending ? "กำลังอัพโหลด…" : "อัพโหลด"}
          </Button>
        </div>
      )}
    </div>
  );
}
