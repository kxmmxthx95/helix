import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { QuestionPromptView } from "@/components/editor/QuestionPromptView";
import { BookIcon, ChevronBack, Plus, Search, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useExamQuestions, useGradeLevelsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import {
  useAvailablePracticeSets,
  useCreatePracticeSet,
  useCreateSelfServePracticeSet,
  useDeletePracticeSet,
  useExamQuestionsByIds,
  useMyPracticeAttempts,
  useMyPracticeSets,
  useMySubjects,
  usePracticeAttemptAnswers,
  usePracticeSetProgress,
  usePracticeSetQuestions,
  useProfilesByIds,
  useSavePracticeAnswer,
  useSetPracticeSetQuestions,
  useStartOrResumePracticeAttempt,
  useSubmitPracticeAttempt,
  type PracticeSetQuestionRow,
} from "@/hooks/usePractice";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { SubjectPicker } from "@/routes/ExamBank";
import type { ExamQuestionDifficulty, PracticeAttempt, PracticeSet, Student } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL: Record<ExamQuestionDifficulty, string> = { easy: "ง่าย", medium: "ปานกลาง", hard: "ยาก" };

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
  for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_COVER_PALETTE[hash % SUBJECT_COVER_PALETTE.length];
}

/** Both teacher (curate sets) and student/parent (practice) render from here — role-branched, same shape as Exams.tsx. See migration 0053. */
export function Practice() {
  const { profile: me, myStudent } = useAuth();
  const isTeacher = me?.roles.includes("teacher") ?? false;
  const isParent = me?.roles.includes("parent") ?? false;

  if (isTeacher) return <TeacherPractice teacherId={me!.id} />;
  if (myStudent || isParent) return <StudentPractice />;
  return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
}

// ============================================================== teacher side

function TeacherPractice({ teacherId }: { teacherId: string }) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const gradeLevelIds = [...new Set(subjects.map((s) => s.suggested_grade_level_id).filter((id): id is string => !!id))];
  const { data: gradeLevels = [] } = useGradeLevelsByIds(gradeLevelIds);
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));

  const { data: sets = [], isLoading } = useMyPracticeSets(subjectIds);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PracticeSet | null>(null);
  const [search, setSearch] = useState("");
  const deleteSet = useDeletePracticeSet();
  const toast = useToast();

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const creatorIds = [...new Set(sets.map((s) => s.created_by))];
  const { data: creators = [] } = useProfilesByIds(creatorIds);
  const creatorById = new Map(creators.map((p) => [p.id, p]));

  const filteredSets = sets.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const subject = subjectById.get(s.subject_id);
    return (
      (s.title ?? "").toLowerCase().includes(q) ||
      (subject?.name_th ?? "").toLowerCase().includes(q) ||
      (subject?.code ?? "").toLowerCase().includes(q)
    );
  });

  if (selected) {
    return <SetDetail set={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาแบบฝึกหัดหรือวิชา"
            className="pl-9"
            type="search"
          />
        </div>
        <Button size="sm" onClick={() => setCreating(true)} disabled={assignments.length === 0}>
          <Plus className="h-3 w-3" /> สร้างชุดฝึกหัด
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : filteredSets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={sets.length === 0 ? "ยังไม่มีชุดฝึกหัด" : "ไม่พบชุดฝึกหัดที่ค้นหา"}
            description={sets.length === 0 ? "กด “สร้างชุดฝึกหัด” เพื่อเลือกโจทย์จากคลังมาให้นักเรียนฝึก" : ""}
          />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[44rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">แบบฝึกหัด</th>
                  <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                  <th className="px-3 py-2 font-medium">วิชา</th>
                  <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                  <th className="px-3 py-2 font-medium">ผู้สร้าง</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filteredSets.map((s) => {
                  const subject = subjectById.get(s.subject_id);
                  const gradeLevel = subject?.suggested_grade_level_id
                    ? gradeLevelById.get(subject.suggested_grade_level_id)
                    : null;
                  const creator = creatorById.get(s.created_by);
                  return (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                  >
                    <td className="px-3 py-2 font-medium">{s.title}</td>
                    <td className="px-3 py-2">{subject?.code ?? "—"}</td>
                    <td className="px-3 py-2">{subject?.name_th ?? "—"}</td>
                    <td className="px-3 py-2">{gradeLevel ? gradeShortLabel(gradeLevel.code) : "—"}</td>
                    <td className="px-3 py-2">{creator ? `${creator.first_name} ${creator.last_name}` : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ลบ"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(`ลบชุดฝึกหัด "${s.title}"?`)) return;
                          deleteSet.mutate(s.id, { onError: () => toast("ลบไม่สำเร็จ", "error") });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateSetSheet open={creating} onOpenChange={setCreating} teacherId={teacherId} />
    </div>
  );
}

function CreateSetSheet({
  open,
  onOpenChange,
  teacherId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherId: string;
}) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const gradeLevelIds = [...new Set(subjects.map((s) => s.suggested_grade_level_id).filter((id): id is string => !!id))];
  const { data: gradeLevels = [] } = useGradeLevelsByIds(gradeLevelIds);
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));

  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");

  const create = useCreatePracticeSet();
  const toast = useToast();

  function reset() {
    setSubjectId("");
    setTitle("");
  }

  const canSave = subjectId && title.trim();

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    create.mutate(
      { subject_id: subjectId, created_by: teacherId, title: title.trim() },
      { onSuccess: () => close(), onError: () => toast("สร้างชุดฝึกหัดไม่สำเร็จ", "error") },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title="สร้างชุดฝึกหัด"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="submit" form="create-practice-set" className="flex-1" disabled={!canSave || create.isPending}>
            สร้าง
          </Button>
        </div>
      }
    >
      <form id="create-practice-set" onSubmit={submit} className="space-y-3">
        <Field label="วิชา" required>
          <SubjectPicker subjects={subjects} gradeLevelById={gradeLevelById} value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field label="แบบฝึกหัด" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ฝึกก่อนสอบบทที่ 3" />
        </Field>

        <p className="text-xs text-muted-foreground">เลือกโจทย์ได้หลังสร้างชุด ในหน้ารายละเอียดชุดฝึกหัด</p>
      </form>
    </Sheet>
  );
}

function SetDetail({ set, onBack }: { set: PracticeSet; onBack: () => void }) {
  const { data: setQuestions = [] } = usePracticeSetQuestions(set.id);
  const { data: progress, isLoading } = usePracticeSetProgress(set.id);

  const questionById = new Map(setQuestions.map((q) => [q.question_id, q]));
  const submittedCount = progress?.attempts.length ?? 0;
  const avgScore =
    submittedCount > 0 ? (progress!.attempts.reduce((s, a) => s + (a.score ?? 0), 0) / submittedCount).toFixed(1) : null;
  const [editingQuestions, setEditingQuestions] = useState(false);

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label="ย้อนกลับ">
          <ChevronBack className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-sm font-semibold">{set.title}</p>
          <p className="text-xs text-muted-foreground">
            {setQuestions.length} ข้อ · ทำแล้ว {submittedCount} ครั้ง{avgScore != null && ` · เฉลี่ย ${avgScore} คะแนน`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEditingQuestions(true)}
        className="flex shrink-0 items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-muted"
      >
        จัดการโจทย์ ({setQuestions.length} ข้อ)
        <span className="text-muted-foreground">แก้ไข</span>
      </button>

      <EditPracticeSetQuestionsSheet
        set={set}
        setQuestions={setQuestions}
        open={editingQuestions}
        onOpenChange={setEditingQuestions}
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : setQuestions.length === 0 ? (
        <EmptyState title="ชุดนี้ยังไม่มีโจทย์" description="" />
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[28rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">โจทย์</th>
                  <th className="px-3 py-2 font-medium">ตอบถูก</th>
                  <th className="px-3 py-2 font-medium">ตอบผิด</th>
                </tr>
              </thead>
              <tbody>
                {[...questionById.values()]
                  .sort((a, b) => a.position - b.position)
                  .map((q: PracticeSetQuestionRow) => {
                    const stat = progress?.perQuestion.get(q.question_id);
                    return (
                      <tr key={q.question_id} className="border-t border-border">
                        <td className="max-w-xs truncate px-3 py-2">{q.prompt}</td>
                        <td className="px-3 py-2 text-success">{stat?.correct ?? 0}</td>
                        <td className="px-3 py-2 text-destructive">{stat?.incorrect ?? 0}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EditPracticeSetQuestionsSheet({
  set,
  setQuestions,
  open,
  onOpenChange,
}: {
  set: PracticeSet;
  setQuestions: PracticeSetQuestionRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: questions = [] } = useExamQuestions(open ? set.subject_id : null);
  const setSetQuestions = useSetPracticeSetQuestions();
  const toast = useToast();
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setQuestionIds(setQuestions.map((q) => q.question_id));
  }, [open, setQuestions]);

  function save() {
    setSetQuestions.mutate(
      { setId: set.id, questionIds },
      { onSuccess: () => onOpenChange(false), onError: () => toast("บันทึกโจทย์ไม่สำเร็จ", "error") },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="จัดการโจทย์"
      footer={
        <Button className="w-full" onClick={save} disabled={questionIds.length === 0 || setSetQuestions.isPending}>
          บันทึก
        </Button>
      }
    >
      <Field label={`โจทย์ (เลือกแล้ว ${questionIds.length} ข้อ)`} required>
        <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
          {questions.length === 0 && <p className="text-xs text-muted-foreground">คลังข้อสอบวิชานี้ยังว่าง</p>}
          {questions.map((q) => (
            <label key={q.id} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={questionIds.includes(q.id)}
                onChange={(e) =>
                  setQuestionIds(e.target.checked ? [...questionIds, q.id] : questionIds.filter((id) => id !== q.id))
                }
              />
              {q.prompt}
            </label>
          ))}
        </div>
      </Field>
    </Sheet>
  );
}

// ============================================================== student side

/** Same self/child picker shape as Exams.tsx. */
function StudentPractice() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = options.find((s) => s.id === selectedId) ?? options[0] ?? null;
  const [activeSet, setActiveSet] = useState<PracticeSet | null>(null);

  if (options.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีข้อมูล" description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น" />
      </div>
    );
  }

  if (current && activeSet) {
    return <TakePractice student={current} set={activeSet} onExit={() => setActiveSet(null)} />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "tappable rounded-full px-3 py-1.5 text-xs font-medium",
                current?.id === s.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted",
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

function PracticeHome({ student, onOpen }: { student: Student; onOpen: (s: PracticeSet) => void }) {
  const { data: classroom } = useMyCurrentClassroom(student.id);
  const { data: subjectIds = [] } = useMySubjects(classroom?.classroomId ?? null, classroom?.academicYear ?? null);
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const { data: sets = [], isLoading } = useAvailablePracticeSets(subjectIds);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const [rolling, setRolling] = useState(false);
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(null);
  const selfServe = useCreateSelfServePracticeSet();
  const toast = useToast();

  const setsBySubject = new Map<string, PracticeSet[]>();
  for (const s of sets) setsBySubject.set(s.subject_id, [...(setsBySubject.get(s.subject_id) ?? []), s]);
  const subjectsWithSets = subjects.filter((s) => (setsBySubject.get(s.id)?.length ?? 0) > 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  const openSubject = openSubjectId ? subjectById.get(openSubjectId) : null;

  return (
    <div className="space-y-4">
      <Button variant="outline" className="w-full" onClick={() => setRolling(true)} disabled={subjectIds.length === 0}>
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
              <Card key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.title}</p>
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
        <EmptyState title="ยังไม่มีชุดฝึกหัด" description="รอครูสร้างชุดฝึกหัด หรือลองสุ่มโจทย์มาฝึกเองด้านบน" />
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
                  <p className="text-xs font-semibold leading-snug">{s.name_th}</p>
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
    draft: { subject_id: string; created_by: string; topic: string | null; difficulty: ExamQuestionDifficulty | null },
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
      { subject_id: subjectId, created_by: studentId, topic: null, difficulty: difficulty || null },
      { onSuccess: onCreated, onError },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="สุ่มโจทย์มาฝึกเอง"
      footer={
        <Button className="w-full" onClick={roll} disabled={!subjectId || pending}>
          สุ่ม 10 ข้อ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="วิชา" required>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_th}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ระดับความยาก">
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as ExamQuestionDifficulty | "")} placeholder="ทุกระดับ">
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

function TakePractice({ student, set, onExit }: { student: Student; set: PracticeSet; onExit: () => void }) {
  const { data: setQuestions = [] } = usePracticeSetQuestions(set.id);
  const { data: pastAttempts = [] } = useMyPracticeAttempts(set.id, student.id);
  const startOrResume = useStartOrResumePracticeAttempt();
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (attempt || setQuestions.length === 0) return;
    startOrResume.mutate(
      { setId: set.id, studentId: student.id, questionIds: setQuestions.map((q) => q.question_id) },
      { onSuccess: setAttempt, onError: () => toast("เริ่มฝึกไม่สำเร็จ", "error") },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setQuestions.length]);

  if (!attempt) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
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

  return <PracticeRunner attempt={attempt} onSubmitted={setAttempt} onExit={onExit} />;
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
  const { data: questions = [] } = useExamQuestionsByIds(attempt.question_order);
  const { data: answers } = usePracticeAttemptAnswers(attempt.id);
  const saveAnswer = useSavePracticeAnswer();
  const submit = useSubmitPracticeAttempt();
  const toast = useToast();

  const orderedQuestions = attempt.question_order
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const answeredCount = orderedQuestions.filter((q) => answers?.has(q.id)).length;

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
              answered && (answer.is_correct ? "border-success/40" : "border-destructive/40"),
            )}
          >
            <div className="font-medium">
              {i + 1}. <QuestionPromptView value={q.prompt_json} />
            </div>
            {q.question_type === "short_answer" ? (
              <Input
                value={answer?.short_answer ?? ""}
                onChange={(e) =>
                  saveAnswer.mutate({ attempt_id: attempt.id, question_id: q.id, choice_id: null, short_answer: e.target.value })
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
                        saveAnswer.mutate({ attempt_id: attempt.id, question_id: q.id, choice_id: c.id, short_answer: null })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
            {answered && (
              <p className={cn("text-xs", answer.is_correct ? "text-success" : "text-destructive")}>
                {answer.is_correct ? "ถูกต้อง" : "ยังไม่ถูก ลองอีกครั้งได้"}
                {q.question_type === "short_answer" && !answer.is_correct && ` — เฉลย: ${q.correct_answer}`}
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
        <Button className="flex-1" onClick={doSubmit} disabled={submit.isPending}>
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
        <p className="text-xs text-muted-foreground">ฝึกไปแล้ว {triesSoFar} ครั้ง</p>
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
