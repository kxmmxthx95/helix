import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { QuestionPromptView } from "@/components/editor/QuestionPromptView";
import {
  AppsIcon,
  BookIcon,
  ChevronBack,
  ChevronForward,
  LibraryIcon,
  ListIcon,
  PencilIcon,
  Plus,
  Search,
  X,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import {
  useSubjectsByIds,
  type ExamQuestionWithChoices,
} from "@/hooks/useExamBank";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import {
  useAvailablePracticeSets,
  useCreatePracticeSet,
  useTopicPracticeSet,
  useCreateSelfServePracticeSet,
  useExamQuestionsByIds,
  useMyPracticeAttempts,
  useMySubjects,
  usePracticeAttemptAnswers,
  usePracticeSetProgress,
  usePracticeSetQuestions,
  usePracticeTopicsByIds,
  useSavePracticeAnswer,
  useSetPracticeSetQuestions,
  useStartOrResumePracticeAttempt,
  useSubmitPracticeAttempt,
} from "@/hooks/usePractice";
import { useDepartments } from "@/hooks/useProfiles";
import { usePlanOutline, usePlanSubjects, type PlanLessonNode } from "@/hooks/usePlan";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManage, isOrgWide } from "@/lib/roles";
import { GradeBadges, SubjectTile } from "@/routes/CurriculumMap";
import { QuestionSheet } from "@/routes/ExamBank";
import type {
  ExamQuestionDifficulty,
  ExamQuestionType,
  PracticeAttempt,
  GradeLevel,
  PracticeSet,
  Student,
} from "@/lib/database.types";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL: Record<ExamQuestionDifficulty, string> = {
  easy: "ง่าย",
  medium: "ปานกลาง",
  hard: "ยาก",
};

const DIFFICULTY_BADGE_CLASS: Record<ExamQuestionDifficulty, string> = {
  easy: "bg-success/15 text-success",
  medium: "bg-accent/15 text-accent",
  hard: "bg-destructive/15 text-destructive",
};

const QUESTION_TYPE_LABEL: Record<ExamQuestionType, string> = {
  multiple_choice: "ปรนัย (เลือกตอบ)",
  true_false: "ถูก/ผิด",
  short_answer: "เติมคำ",
};

/** Deterministic cover color per subject (no color/icon field on `subjects` — see grill note in Practice.tsx). Cycles through a fixed palette by id hash so the same subject always lands on the same color. */
const SUBJECT_COVER_PALETTE = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function subjectCoverColor(subjectId: string) {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++)
    hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_COVER_PALETTE[hash % SUBJECT_COVER_PALETTE.length];
}

/**
 * Both teacher/manager (curate sets) and student/parent (practice) render
 * from here — role-branched, same shape as Exams.tsx. A manager
 * (canManage — super_admin/director/staff/dept_head) gets the teacher-side
 * view scoped to every subject in their department rather than "my
 * assignments", mirroring can_write_practice_subject's can_manage()+
 * department grant in migration 0053 (same as ExamBank's fix). See
 * migration 0053.
 */
export function Practice() {
  const { profile: me, myStudent } = useAuth();
  const isTeacher = me?.roles.includes("teacher") ?? false;
  const isManager = me ? canManage(me.roles) : false;
  const isParent = me?.roles.includes("parent") ?? false;

  if (isTeacher || isManager) return <TeacherPractice me={me!} />;
  if (myStudent || isParent) return <StudentPractice />;
  return (
    <Card className="text-sm text-muted-foreground">
      ไม่มีสิทธิ์เข้าถึงเมนูนี้
    </Card>
  );
}

// ============================================================== teacher side

/** Cards of the ผังการเรียน subjects of the teacher's department -> ชั้น -> บทเรียน -> หัวข้อ -> แบบฝึกหัดของหัวข้อ. Not tied to catalog subjects (0174). */
function TeacherPractice({
  me,
}: {
  me: NonNullable<ReturnType<typeof useAuth>["profile"]>;
}) {
  const orgWide = isOrgWide(me.roles);
  const { data: departments = [] } = useDepartments();
  const [pickedDept, setPickedDept] = useState("");
  const departmentId = orgWide ? pickedDept : (me.department_id ?? "");
  const { data: planSubjects = [] } = usePlanSubjects(departmentId || null);
  const { data: grades = [] } = useGradeLevels(departmentId || null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [topic, setTopic] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setSubjectId("");
    setGradeId("");
    setTopic(null);
  }, [departmentId]);

  const subject = planSubjects.find((s) => s.id === subjectId) ?? null;
  if (subject) {
    return (
      <PlanOutline
        subject={subject}
        grades={grades}
        gradeId={gradeId}
        topic={topic}
        setGradeId={setGradeId}
        setTopic={setTopic}
        onExit={() => {
          setSubjectId("");
          setGradeId("");
        }}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const shown = planSubjects.filter((s) => !q || s.name.toLowerCase().includes(q));
  const gradeOf = (s: (typeof planSubjects)[number]) =>
    grades.filter((g) => s.gradeLevelIds.includes(g.id)).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="page-fill gap-5">
      <div className="flex shrink-0 flex-wrap gap-2">
        {orgWide && (
          <Select
            className="w-auto min-w-[10rem]"
            value={pickedDept}
            onChange={(e) => setPickedDept(e.target.value)}
            aria-label="แผนก"
            placeholder="เลือกแผนก"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาวิชา..."
            className="pl-9"
            aria-label="ค้นหา"
          />
        </div>
        <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex h-full w-8 items-center justify-center rounded-md",
                view === v ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูวิชาในผังการเรียน" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ไม่พบรายวิชา"
            description={planSubjects.length === 0 ? "ยังไม่มีวิชาในผังการเรียน" : "ลองเปลี่ยนคำค้นหา"}
          />
        </div>
      ) : view === "list" ? (
        <div className="table-panel rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[32rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">ระดับชั้น</th>
                  <th className="px-4 py-3 text-right">บท</th>
                  <th className="px-4 py-3 text-right">หัวข้อ</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSubjectId(s.id)}
                    className="h-14 cursor-pointer border-t border-border first:border-t-0 active:bg-muted"
                  >
                    <td className="max-w-xs px-4 py-2">
                      <span className="flex items-center gap-3">
                        <SubjectTile subject={s} size="sm" />
                        <span className="truncate">{s.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <GradeBadges grades={gradeOf(s)} />
                    </td>
                    <td className="px-4 py-2 text-right">{s.lessonCount}</td>
                    <td className="px-4 py-2 text-right">{s.topicCount}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      <ChevronForward className="h-3 w-3" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubjectId(s.id)}
              className="group flex flex-col gap-3 rounded-xl bg-card p-4 text-left shadow-card transition-shadow hover:shadow-float"
            >
              <div className="flex min-w-0 items-start gap-3">
                <SubjectTile subject={s} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="truncate text-sm font-bold">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.lessonCount} บท · {s.topicCount} หัวข้อ
                  </div>
                  <GradeBadges grades={gradeOf(s)} />
                </div>
              </div>
              <div className="mt-auto flex justify-end pt-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
                  <ChevronForward className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** ชั้น -> บทเรียน -> หัวข้อ of one ผังการเรียน subject, read-only. The ชั้น level is skipped when the subject only has one grade. */
function PlanOutline({
  subject,
  grades,
  gradeId,
  topic,
  setGradeId,
  setTopic,
  onExit,
}: {
  subject: { id: string; name: string };
  grades: GradeLevel[];
  gradeId: string;
  topic: { id: string; name: string } | null;
  setGradeId: (id: string) => void;
  setTopic: (t: { id: string; name: string } | null) => void;
  onExit: () => void;
}) {
  const { data: lessons = [] } = usePlanOutline(subject.id);
  const gradeIds = [...new Set(lessons.map((l) => l.grade_level_id))];
  const sortedGrades = grades.filter((g) => gradeIds.includes(g.id)).sort((a, b) => a.sort_order - b.sort_order);
  const activeGradeId = sortedGrades.find((g) => g.id === gradeId)?.id ?? sortedGrades[0]?.id ?? "";

  if (topic) {
    return <TopicExercises topic={topic} onBack={() => setTopic(null)} />;
  }

  const gradeLessons = lessons.filter((l) => l.grade_level_id === activeGradeId);

  return (
    <div className="page-fill">
      <div className="toolbar shrink-0">
        <Button size="sm" variant="ghost" onClick={onExit}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {subject.name}
        </Button>
      </div>
      {sortedGrades.length > 1 && (
        <div className="scrollbar-hidden flex w-full shrink-0 gap-0 overflow-x-auto border-b border-border" role="tablist">
          {sortedGrades.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={activeGradeId === g.id}
              onClick={() => setGradeId(g.id)}
              className={cn(
                "-mb-px inline-flex h-8 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors",
                activeGradeId === g.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{gradeShortLabel(g.code)}</span>
            </button>
          ))}
        </div>
      )}

      {gradeLessons.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ยังไม่มีบทเรียนในผังการเรียน"
            description="เพิ่มได้ที่หน้าผังการเรียน (ฝ่ายวิชาการ)"
            action={
              <Link to="/curriculum-map" className="text-xs underline">
                ไปที่ผังการเรียน
              </Link>
            }
          />
        </div>
      ) : (
        <div className="scrollbar-hidden -mx-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-2">
          {gradeLessons.map((l, i) => (
            <PlanLessonCard key={l.id} lesson={l} index={i} onOpenTopic={setTopic} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One ผังการเรียน lesson as a collapsible card (read-only) — its topics open that topic's แบบฝึกหัด. */
function PlanLessonCard({
  lesson,
  index,
  onOpenTopic,
}: {
  lesson: PlanLessonNode;
  index: number;
  onOpenTopic: (t: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-card shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <ChevronForward className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {index + 1}
        </span>
        <LibraryIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{lesson.name}</div>
          {lesson.tags.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {lesson.tags.map(({ linkId, subject }) => (
                <li
                  key={linkId}
                  title={subject.name_th}
                  className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium uppercase text-accent"
                >
                  {subject.code}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{lesson.topics.length} หัวข้อ</span>
      </button>
      {open && (
        <ol className="flex flex-col border-t border-border px-3 py-2">
          {lesson.topics.length === 0 && <li className="py-1 text-[11px] text-muted-foreground">ยังไม่มีหัวข้อ</li>}
          {lesson.topics.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpenTopic({ id: t.id, name: t.name })}
                className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="w-9 shrink-0 tabular-nums text-muted-foreground">
                  {index + 1}.{i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <ChevronForward className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** แบบฝึกหัดของหัวข้อ — one teacher-curated set per topic (0174), created on the first add. Opens SetDetail, whose "เพิ่มโจทย์" is a centered pop-up. */
function TopicExercises({ topic, onBack }: { topic: { id: string; name: string }; onBack: () => void }) {
  const { profile: me } = useAuth();
  const { data: existing, isLoading } = useTopicPracticeSet(topic.id);
  const createSet = useCreatePracticeSet();
  const toast = useToast();
  const [created, setCreated] = useState<PracticeSet | null>(null);
  const set = existing ?? created;

  if (set) return <SetDetail set={set} onBack={onBack} autoAdd={!!created && !existing} topicName={topic.name} />;

  return (
    <div className="page-fill">
      <div className="toolbar shrink-0">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {topic.name}
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        {isLoading ? (
          <Skeleton className="h-24 w-64" />
        ) : (
          <EmptyState
            title="ยังไม่มีแบบฝึกหัด"
            description="เพิ่มแบบฝึกหัดเพื่อเริ่มใส่โจทย์"
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={createSet.isPending || !me}
                onClick={() =>
                  createSet.mutate(
                    { subject_id: null, created_by: me!.id, topic_id: topic.id },
                    {
                      onSuccess: setCreated,
                      onError: () => toast("เพิ่มไม่สำเร็จ", "error"),
                    },
                  )
                }
              >
                <Plus className="h-3 w-3" /> เพิ่มแบบฝึกหัด
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

/** Click-to-edit name — swaps to an Input on click, saves on blur/Enter. Used for both lesson and topic rename. */
export function EditableName({
  value,
  onSave,
  noMotion,
}: {
  value: string;
  onSave: (name: string) => void;
  /** Drops the press-scale animation on the pencil button. */
  noMotion?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function save() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== value) onSave(name);
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        aria-label="แก้ไขชื่อ"
        className={noMotion ? "active:scale-100" : undefined}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <PencilIcon className="h-3 w-3" />
      </Button>
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setEditing(false)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label="แก้ไขชื่อ"
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h2 className="text-sm font-bold">แก้ไขชื่อ</h2>
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="ชื่อ" />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" className="flex-1" disabled={!draft.trim()}>
                บันทึก
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function SetDetail({
  set,
  onBack,
  autoAdd = false,
  topicName,
}: {
  set: PracticeSet;
  onBack: () => void;
  autoAdd?: boolean;
  /** Known up front by the topic page; avoids waiting on the topic lookup so the form can prefill "ชื่อเนื้อหา" on first render. */
  topicName?: string;
}) {
  const { profile: me } = useAuth();
  const { data: setQuestions = [] } = usePracticeSetQuestions(set.id);
  const { data: progress, isLoading } = usePracticeSetProgress(set.id);

  const questionById = new Map(setQuestions.map((q) => [q.question_id, q]));
  const { data: fullQuestions = [] } = useExamQuestionsByIds(
    setQuestions.map((q) => q.question_id),
  );
  const submittedCount = progress?.attempts.length ?? 0;
  const avgScore =
    submittedCount > 0
      ? (
          progress!.attempts.reduce((s, a) => s + (a.score ?? 0), 0) /
          submittedCount
        ).toFixed(1)
      : null;
  const [addingQuestion, setAddingQuestion] = useState(autoAdd);
  const [editingQuestion, setEditingQuestion] =
    useState<ExamQuestionWithChoices | null>(null);
  const setSetQuestions = useSetPracticeSetQuestions();
  const toast = useToast();
  const { data: [topic] = [] } = usePracticeTopicsByIds(
    set.topic_id ? [set.topic_id] : [],
  );
  const displayName = set.title ?? topic?.name ?? "—";

  return (
    <div className="page-fill">
      <div className="toolbar shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={onBack}
          aria-label="ย้อนกลับ"
        >
          <ChevronBack className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-sm font-semibold">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground">
            {setQuestions.length} ข้อ · ทำแล้ว {submittedCount} ครั้ง
            {avgScore != null && ` · เฉลี่ย ${avgScore} คะแนน`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddingQuestion(true)}>
          <Plus className="h-3 w-3" /> เพิ่มโจทย์
        </Button>
      </div>

      {me && (
        <QuestionSheet
          open={addingQuestion}
          onOpenChange={setAddingQuestion}
          subjectId={set.subject_id}
          planTopicId={set.topic_id}
          modal
          teacherId={me.id}
          question={null}
          defaultTopic={topicName ?? topic?.name}
          onSaved={(id) =>
            setSetQuestions.mutate(
              {
                setId: set.id,
                questionIds: [...setQuestions.map((q) => q.question_id), id],
              },
              { onError: () => toast("เพิ่มโจทย์เข้าชุดไม่สำเร็จ", "error") },
            )
          }
        />
      )}

      {me && (
        <QuestionSheet
          key={editingQuestion?.id ?? "none"}
          open={!!editingQuestion}
          onOpenChange={(v) => !v && setEditingQuestion(null)}
          subjectId={set.subject_id}
          planTopicId={set.topic_id}
          modal
          teacherId={me.id}
          question={editingQuestion}
        />
      )}

      {isLoading ? (
        <div className="table-panel-scroll space-y-3 py-1" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Skeleton className="h-6 w-6 rounded-md" />
                  <Skeleton className="h-6 w-6 rounded-md" />
                </div>
              </div>
              <Skeleton className="mt-2 h-3.5 w-3/4" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : setQuestions.length === 0 ? (
        <EmptyState title="ชุดนี้ยังไม่มีโจทย์" description="" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="table-panel-scroll space-y-3 py-1">
            {[...fullQuestions]
              .sort(
                (a, b) =>
                  (questionById.get(a.id)?.position ?? 0) -
                  (questionById.get(b.id)?.position ?? 0),
              )
              .map((q, i) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-border bg-card p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-1 flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span>#{i + 1}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {QUESTION_TYPE_LABEL[q.question_type]}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-normal",
                          DIFFICULTY_BADGE_CLASS[q.difficulty],
                        )}
                      >
                        {DIFFICULTY_LABEL[q.difficulty]}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="แก้ไขโจทย์"
                        onClick={() => setEditingQuestion(q)}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ลบ"
                        onClick={() => {
                          if (!confirm("เอาโจทย์นี้ออกจากชุด?")) return;
                          setSetQuestions.mutate(
                            {
                              setId: set.id,
                              questionIds: setQuestions
                                .filter((sq) => sq.question_id !== q.id)
                                .map((sq) => sq.question_id),
                            },
                            {
                              onError: () =>
                                toast("เอาโจทย์ออกไม่สำเร็จ", "error"),
                            },
                          );
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    <QuestionPromptView value={q.prompt_json} />
                  </div>
                  {q.question_type === "short_answer" ? (
                    <p className="mt-3 text-muted-foreground">
                      เฉลย: {q.correct_answer}
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {q.choices.map((c) => (
                        <li
                          key={c.id}
                          className={cn(
                            "flex items-center gap-1.5",
                            c.is_correct && "font-medium text-success",
                          )}
                        >
                          {c.is_correct ? "✓" : "○"} <QuestionPromptView value={c.label_json} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================== student side

/** Same self/child picker shape as Exams.tsx. */
function StudentPractice() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(
    isParent ? (profile?.id ?? null) : null,
  );
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current =
    options.find((s) => s.id === selectedId) ?? options[0] ?? null;
  const [activeSet, setActiveSet] = useState<PracticeSet | null>(null);

  if (options.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          title="ไม่มีข้อมูล"
          description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น"
        />
      </div>
    );
  }

  if (current && activeSet) {
    return (
      <TakePractice
        student={current}
        set={activeSet}
        onExit={() => setActiveSet(null)}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col space-y-4">
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "tappable rounded-full px-3 py-1.5 text-xs font-medium",
                current?.id === s.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.first_name} {s.last_name}
            </button>
          ))}
        </div>
      )}
      {current && <PracticeHome student={current} onOpen={setActiveSet} />}
    </div>
  );
}

function PracticeHome({
  student,
  onOpen,
}: {
  student: Student;
  onOpen: (s: PracticeSet) => void;
}) {
  const { data: classroom } = useMyCurrentClassroom(student.id);
  const { data: subjectIds = [] } = useMySubjects(
    classroom?.classroomId ?? null,
    classroom?.academicYear ?? null,
  );
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const { data: sets = [], isLoading } = useAvailablePracticeSets(subjectIds);
  const topicIds = [
    ...new Set(sets.map((s) => s.topic_id).filter((id): id is string => !!id)),
  ];
  const { data: topics = [] } = usePracticeTopicsByIds(topicIds);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const setName = (s: PracticeSet) =>
    s.topic_id ? (topicById.get(s.topic_id)?.name ?? "—") : (s.title ?? "—");

  const [rolling, setRolling] = useState(false);
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(null);
  const selfServe = useCreateSelfServePracticeSet();
  const toast = useToast();

  // Group by catalog subject, or by ผังการเรียน subject for topic-only sets (subject_id null, 0174).
  const groupKey = (s: PracticeSet) =>
    s.subject_id ?? topicById.get(s.topic_id ?? "")?.planSubjectId ?? "";
  const setsBySubject = new Map<string, PracticeSet[]>();
  for (const s of sets)
    setsBySubject.set(groupKey(s), [...(setsBySubject.get(groupKey(s)) ?? []), s]);
  const groupName = new Map<string, string>([
    ...subjects.map((s) => [s.id, s.name_th] as [string, string]),
    ...topics.map((t) => [t.planSubjectId, t.planSubjectName] as [string, string]),
  ]);
  const subjectsWithSets = [...setsBySubject.keys()]
    .filter((id) => groupName.has(id))
    .map((id) => ({ id, name_th: groupName.get(id)! }));

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="status"
        aria-label="กำลังโหลด"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex aspect-[3/4] flex-col justify-between rounded-xl border border-border p-3"
          >
            <Skeleton className="h-6 w-6 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-2.5 w-10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const openSubject = openSubjectId ? { id: openSubjectId, name_th: groupName.get(openSubjectId) ?? "—" } : null;

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setRolling(true)}
        disabled={subjectIds.length === 0}
      >
        สุ่มโจทย์มาฝึกเอง
      </Button>

      {openSubject ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOpenSubjectId(null)}
            className="tappable flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronBack className="h-3.5 w-3.5" /> {openSubject.name_th}
          </button>
          <ul className="space-y-2">
            {(setsBySubject.get(openSubject.id) ?? []).map((s) => (
              <Card
                key={s.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{setName(s)}</p>
                  <p className="text-muted-foreground">{openSubject.name_th}</p>
                </div>
                <Button size="sm" onClick={() => onOpen(s)}>
                  ฝึกเลย
                </Button>
              </Card>
            ))}
          </ul>
        </div>
      ) : subjectsWithSets.length === 0 ? (
        <EmptyState
          title="ยังไม่มีชุดฝึกหัด"
          description="รอครูสร้างชุดฝึกหัด หรือลองสุ่มโจทย์มาฝึกเองด้านบน"
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {subjectsWithSets.map((s) => {
            const count = setsBySubject.get(s.id)?.length ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpenSubjectId(s.id)}
                className={cn(
                  "tappable flex aspect-[3/4] flex-col justify-between rounded-xl p-3 text-left text-white shadow-sm transition-transform active:scale-[0.97]",
                  subjectCoverColor(s.id),
                )}
              >
                <BookIcon className="h-6 w-6 opacity-90" />
                <div>
                  <p className="text-xs font-semibold leading-snug">
                    {s.name_th}
                  </p>
                  <p className="mt-0.5 text-[10px] opacity-80">{count} ชุด</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SelfServeSheet
        open={rolling}
        onOpenChange={setRolling}
        subjectIds={subjectIds}
        subjects={subjects}
        studentId={student.id}
        onCreated={(set) => {
          setRolling(false);
          onOpen(set);
        }}
        onError={() => toast("ไม่สามารถสุ่มโจทย์ได้", "error")}
        pending={selfServe.isPending}
        create={selfServe.mutate}
      />
    </div>
  );
}

function SelfServeSheet({
  open,
  onOpenChange,
  subjectIds,
  subjects,
  studentId,
  onCreated,
  onError,
  pending,
  create,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectIds: string[];
  subjects: { id: string; name_th: string }[];
  studentId: string;
  onCreated: (set: PracticeSet) => void;
  onError: () => void;
  pending: boolean;
  create: (
    draft: {
      subject_id: string;
      created_by: string;
      topic: string | null;
      difficulty: ExamQuestionDifficulty | null;
    },
    opts: { onSuccess: (set: PracticeSet) => void; onError: () => void },
  ) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [difficulty, setDifficulty] = useState<ExamQuestionDifficulty | "">("");

  useEffect(() => {
    if (open) {
      setSubjectId(subjectIds[0] ?? "");
      setDifficulty("");
    }
  }, [open, subjectIds]);

  function roll() {
    if (!subjectId) return;
    create(
      {
        subject_id: subjectId,
        created_by: studentId,
        topic: null,
        difficulty: difficulty || null,
      },
      { onSuccess: onCreated, onError },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="สุ่มโจทย์มาฝึกเอง"
      footer={
        <Button
          className="w-full"
          onClick={roll}
          disabled={!subjectId || pending}
        >
          สุ่ม 10 ข้อ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="วิชา" required>
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_th}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ระดับความยาก">
          <Select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as ExamQuestionDifficulty | "")
            }
            placeholder="ทุกระดับ"
          >
            {Object.entries(DIFFICULTY_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

function TakePractice({
  student,
  set,
  onExit,
}: {
  student: Student;
  set: PracticeSet;
  onExit: () => void;
}) {
  const { data: setQuestions = [] } = usePracticeSetQuestions(set.id);
  const { data: pastAttempts = [] } = useMyPracticeAttempts(set.id, student.id);
  const startOrResume = useStartOrResumePracticeAttempt();
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (attempt || setQuestions.length === 0) return;
    startOrResume.mutate(
      {
        setId: set.id,
        studentId: student.id,
        questionIds: setQuestions.map((q) => q.question_id),
      },
      {
        onSuccess: setAttempt,
        onError: () => toast("เริ่มฝึกไม่สำเร็จ", "error"),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setQuestions.length]);

  if (!attempt) {
    return (
      <div
        className="mx-auto max-w-xl space-y-3 pb-4"
        role="status"
        aria-label="กำลังโหลด"
      >
        <Skeleton className="h-3 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <Skeleton className="h-4 w-4/5" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (attempt.status === "submitted") {
    return (
      <AttemptSummary
        attempt={attempt}
        maxPoints={setQuestions.reduce((s, q) => s + q.points, 0)}
        triesSoFar={pastAttempts.length}
        onRetry={() => setAttempt(null)}
        onExit={onExit}
      />
    );
  }

  return (
    <PracticeRunner
      attempt={attempt}
      onSubmitted={setAttempt}
      onExit={onExit}
    />
  );
}

function PracticeRunner({
  attempt,
  onSubmitted,
  onExit,
}: {
  attempt: PracticeAttempt;
  onSubmitted: (a: PracticeAttempt) => void;
  onExit: () => void;
}) {
  const { data: questions = [] } = useExamQuestionsByIds(
    attempt.question_order,
  );
  const { data: answers } = usePracticeAttemptAnswers(attempt.id);
  const saveAnswer = useSavePracticeAnswer();
  const submit = useSubmitPracticeAttempt();
  const toast = useToast();

  const orderedQuestions = attempt.question_order
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const answeredCount = orderedQuestions.filter((q) =>
    answers?.has(q.id),
  ).length;

  function doSubmit() {
    submit.mutate(attempt.id, {
      onSuccess: () => onSubmitted({ ...attempt, status: "submitted" }),
      onError: () => toast("ส่งไม่สำเร็จ", "error"),
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-4">
      <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between bg-background/95 px-3 py-2 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          ตอบแล้ว {answeredCount}/{orderedQuestions.length} ข้อ
        </p>
      </div>

      {orderedQuestions.map((q, i) => {
        const answer = answers?.get(q.id);
        const answered = !!answer;
        return (
          <Card
            key={q.id}
            className={cn(
              "space-y-2 text-sm",
              answered &&
                (answer.is_correct
                  ? "border-success/40"
                  : "border-destructive/40"),
            )}
          >
            <div className="font-medium">
              {i + 1}. <QuestionPromptView value={q.prompt_json} />
            </div>
            {q.question_type === "short_answer" ? (
              <Input
                value={answer?.short_answer ?? ""}
                onChange={(e) =>
                  saveAnswer.mutate({
                    attempt_id: attempt.id,
                    question_id: q.id,
                    choice_id: null,
                    short_answer: e.target.value,
                  })
                }
                placeholder="พิมพ์คำตอบ"
              />
            ) : (
              <div className="space-y-1.5">
                {q.choices.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answer?.choice_id === c.id}
                      onChange={() =>
                        saveAnswer.mutate({
                          attempt_id: attempt.id,
                          question_id: q.id,
                          choice_id: c.id,
                          short_answer: null,
                        })
                      }
                    />
                    <QuestionPromptView value={c.label_json} />
                  </label>
                ))}
              </div>
            )}
            {answered && (
              <p
                className={cn(
                  "text-xs",
                  answer.is_correct ? "text-success" : "text-destructive",
                )}
              >
                {answer.is_correct ? "ถูกต้อง" : "ยังไม่ถูก ลองอีกครั้งได้"}
                {q.question_type === "short_answer" &&
                  !answer.is_correct &&
                  ` — เฉลย: ${q.correct_answer}`}
                {q.question_type !== "short_answer" &&
                  !answer.is_correct &&
                  ` — เฉลย: ${q.choices.find((c) => c.is_correct)?.label ?? "—"}`}
              </p>
            )}
          </Card>
        );
      })}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onExit}>
          ออกไปก่อน (ทำต่อได้ภายหลัง)
        </Button>
        <Button
          className="flex-1"
          onClick={doSubmit}
          disabled={submit.isPending}
        >
          เสร็จแล้ว
        </Button>
      </div>
    </div>
  );
}

function AttemptSummary({
  attempt,
  maxPoints,
  triesSoFar,
  onRetry,
  onExit,
}: {
  attempt: PracticeAttempt;
  maxPoints: number;
  triesSoFar: number;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <Card className="text-center">
        <p className="text-xs text-muted-foreground">คะแนนที่ทำได้</p>
        <p className="font-heading text-2xl font-bold">
          {attempt.score ?? "—"}/{maxPoints}
        </p>
        <p className="text-xs text-muted-foreground">
          ฝึกไปแล้ว {triesSoFar} ครั้ง
        </p>
      </Card>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onExit}>
          กลับไปหน้ารายการ
        </Button>
        <Button className="flex-1" onClick={onRetry}>
          ฝึกอีกครั้ง
        </Button>
      </div>
    </div>
  );
}
