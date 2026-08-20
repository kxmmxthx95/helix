import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, Plus, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner, Switch } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useClassroomsByIds, useExamQuestions, useSubjectsByIds } from "@/hooks/useExamBank";
import {
  useAttemptAnswers,
  useAttemptQuestions,
  useAvailableExams,
  useCreateExamSession,
  useDeleteExamSession,
  useExamSessionQuestions,
  useExamSessionTargets,
  useLogAttemptEvent,
  useMyCurrentClassroom,
  useMyExamSessions,
  useSaveAnswer,
  useSessionAttempts,
  useStartOrResumeAttempt,
  useSubmitAttempt,
  useUpdateExamSession,
  type AvailableExam,
} from "@/hooks/useExams";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { ExamAttempt, ExamSession, Student } from "@/lib/database.types";
import { cn } from "@/lib/utils";

/** Both teacher (create/manage sessions) and student/parent (take exams) render from here — role-branched, same as Assignments.tsx/ScoreRecording.tsx. See migration 0047. */
export function Exams() {
  const { profile: me, myStudent } = useAuth();
  const isTeacher = me?.roles.includes("teacher") ?? false;
  const isParent = me?.roles.includes("parent") ?? false;

  if (isTeacher) return <TeacherExams teacherId={me!.id} />;
  if (myStudent || isParent) return <StudentExams />;
  return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
}

// ============================================================== teacher side

function TeacherExams({ teacherId }: { teacherId: string }) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);

  const { data: sessions = [], isLoading } = useMyExamSessions(teacherId);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ExamSession | null>(null);
  const deleteSession = useDeleteExamSession();
  const toast = useToast();

  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  if (selected) {
    return <SessionDetail session={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center justify-between">
        <p className="font-heading text-sm font-semibold">สอบออนไลน์</p>
        <Button size="sm" onClick={() => setCreating(true)} disabled={assignments.length === 0}>
          <Plus className="h-3 w-3" /> เปิดสอบใหม่
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีการเปิดสอบ" description="กด “เปิดสอบใหม่” เพื่อเลือกข้อสอบจากคลังมาจัดสอบ" />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[36rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">ชื่อสอบ</th>
                  <th className="px-3 py-2 font-medium">วิชา</th>
                  <th className="px-3 py-2 font-medium">เปิด – ปิด</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                  >
                    <td className="px-3 py-2 font-medium">{s.title}</td>
                    <td className="px-3 py-2">{subjectById.get(s.subject_id)?.name_th ?? "—"}</td>
                    <td className="px-3 py-2">
                      {new Date(s.opens_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} –{" "}
                      {new Date(s.closes_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ลบ"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(`ลบการเปิดสอบ "${s.title}"?`)) return;
                          deleteSession.mutate(s.id, { onError: () => toast("ลบไม่สำเร็จ", "error") });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateSessionSheet open={creating} onOpenChange={setCreating} teacherId={teacherId} />
    </div>
  );
}

function CreateSessionSheet({
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

  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [duration, setDuration] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [syncGradebook, setSyncGradebook] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  const { data: questions = [] } = useExamQuestions(subjectId || null);
  const targets = assignments.filter((a) => a.subject_id === subjectId);
  const classroomIds = [...new Set(targets.map((a) => a.classroom_id))];
  const { data: classrooms = [] } = useClassroomsByIds(classroomIds);
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));

  const create = useCreateExamSession();
  const toast = useToast();

  function reset() {
    setSubjectId("");
    setTitle("");
    setOpensAt("");
    setClosesAt("");
    setDuration("");
    setMaxAttempts("1");
    setTargetIds([]);
    setQuestionIds([]);
  }

  const totalPoints = questions.filter((q) => questionIds.includes(q.id)).reduce((s, q) => s + q.points, 0);
  const canSave =
    subjectId && title.trim() && opensAt && closesAt && new Date(closesAt) > new Date(opensAt) &&
    targetIds.length > 0 && questionIds.length > 0;

  function save() {
    if (!canSave) return;
    create.mutate(
      {
        subject_id: subjectId,
        teacher_id: teacherId,
        title: title.trim(),
        opens_at: new Date(opensAt).toISOString(),
        closes_at: new Date(closesAt).toISOString(),
        duration_minutes: duration ? Number(duration) : null,
        max_attempts: Number(maxAttempts) || 1,
        shuffle_questions: shuffleQuestions,
        shuffle_choices: shuffleChoices,
        sync_to_gradebook: syncGradebook,
        teaching_assignment_ids: targetIds,
        questions: questionIds.map((question_id) => ({
          question_id,
          points: questions.find((q) => q.id === question_id)?.points ?? 1,
        })),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
        onError: () => toast("เปิดสอบไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="เปิดสอบใหม่"
      wide
      footer={
        <Button className="w-full" onClick={save} disabled={!canSave || create.isPending}>
          เปิดสอบ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="วิชา" required>
          <Select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTargetIds([]);
              setQuestionIds([]);
            }}
            placeholder="เลือกวิชา"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} {s.name_th}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ชื่อการสอบ" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น สอบกลางภาค" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="เปิดสอบ" required>
            <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          </Field>
          <Field label="ปิดสอบ" required>
            <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="เวลาทำ (นาที, ไม่บังคับ)">
            <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="ไม่จำกัด" />
          </Field>
          <Field label="จำนวนครั้งที่สอบได้">
            <Input type="number" min="1" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-2.5">
          <label className="flex items-center justify-between text-xs">
            สุ่มลำดับข้อ
            <Switch checked={shuffleQuestions} onChange={setShuffleQuestions} />
          </label>
          <label className="flex items-center justify-between text-xs">
            สุ่มลำดับตัวเลือก
            <Switch checked={shuffleChoices} onChange={setShuffleChoices} />
          </label>
          <label className="flex items-center justify-between text-xs">
            บันทึกคะแนนเข้าสมุดคะแนน
            <Switch checked={syncGradebook} onChange={setSyncGradebook} />
          </label>
        </div>

        {subjectId && (
          <Field label="ห้องที่เปิดสอบ" required>
            <div className="space-y-1.5 rounded-lg border border-border p-2">
              {targets.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีภาระงานสอนวิชานี้</p>}
              {[...new Set(targets.map((a) => a.id))].map((taId) => {
                const a = targets.find((t) => t.id === taId)!;
                const c = classroomById.get(a.classroom_id);
                return (
                  <label key={a.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={targetIds.includes(a.id)}
                      onChange={(e) =>
                        setTargetIds(e.target.checked ? [...targetIds, a.id] : targetIds.filter((id) => id !== a.id))
                      }
                    />
                    {c?.name ?? "—"}
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        {subjectId && (
          <Field label={`ข้อสอบ (เลือกแล้ว ${questionIds.length} ข้อ, รวม ${totalPoints} คะแนน)`} required>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
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
                  <span>
                    {q.prompt} <span className="text-muted-foreground">({q.points} คะแนน)</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  );
}

function SessionDetail({ session, onBack }: { session: ExamSession; onBack: () => void }) {
  const { data: attempts = [], isLoading } = useSessionAttempts(session.id);
  const { data: targetIds = [] } = useExamSessionTargets(session.id);
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const update = useUpdateExamSession();
  const toast = useToast();

  const maxPoints = sessionQuestions.reduce((s, q) => s + q.points, 0);
  const submitted = attempts.filter((a) => a.status === "submitted");

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label="ย้อนกลับ">
          <ChevronBack className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-sm font-semibold">{session.title}</p>
          <p className="text-xs text-muted-foreground">
            {targetIds.length} ห้อง · {sessionQuestions.length} ข้อ · เต็ม {maxPoints} คะแนน
          </p>
        </div>
      </div>

      <label className="flex shrink-0 items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
        เปิดเฉลยให้นักเรียนดู
        <Switch
          checked={session.review_released}
          onChange={(v) =>
            update.mutate({ id: session.id, review_released: v }, { onError: () => toast("บันทึกไม่สำเร็จ", "error") })
          }
        />
      </label>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : attempts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีนักเรียนเข้าสอบ" description="" />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[28rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">นักเรียน</th>
                  <th className="px-3 py-2 font-medium">ครั้งที่</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 font-medium">คะแนน</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2">{a.student_id}</td>
                    <td className="px-3 py-2">{a.attempt_no}</td>
                    <td className="px-3 py-2">{a.status === "submitted" ? "ส่งแล้ว" : "กำลังทำ"}</td>
                    <td className="px-3 py-2">{a.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {submitted.length > 0 && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              ค่าเฉลี่ย: {(submitted.reduce((s, a) => s + (a.score ?? 0), 0) / submitted.length).toFixed(1)}/{maxPoints}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================== student side

/** Same self/child picker shape as Assignments.tsx. */
function StudentExams() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = options.find((s) => s.id === selectedId) ?? options[0] ?? null;
  const [activeSession, setActiveSession] = useState<AvailableExam | null>(null);

  if (options.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีข้อมูล" description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น" />
      </div>
    );
  }

  if (current && activeSession) {
    return <TakeExam student={current} session={activeSession} onExit={() => setActiveSession(null)} />;
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
      {current && <ExamList student={current} onOpen={setActiveSession} />}
    </div>
  );
}

function ExamList({ student, onOpen }: { student: Student; onOpen: (s: AvailableExam) => void }) {
  const { data: classroom } = useMyCurrentClassroom(student.id);
  const { data: exams = [], isLoading } = useAvailableExams(
    student.id,
    classroom?.classroomId ?? null,
    classroom?.academicYear ?? null,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  if (exams.length === 0) {
    return <EmptyState title="ไม่มีข้อสอบ" description="ยังไม่มีการเปิดสอบสำหรับห้องนี้" />;
  }

  const now = new Date();
  return (
    <ul className="space-y-2">
      {exams.map((e) => {
        const opens = new Date(e.opens_at);
        const closes = new Date(e.closes_at);
        const isOpen = now >= opens && now <= closes;
        const usedUp = e.my_attempts >= e.max_attempts;
        return (
          <Card key={e.id} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{e.title}</p>
              <p className="text-muted-foreground">
                {isOpen ? "กำลังเปิดสอบ" : now < opens ? "ยังไม่เปิดสอบ" : "ปิดสอบแล้ว"} · ทำแล้ว {e.my_attempts}/{e.max_attempts} ครั้ง
              </p>
            </div>
            <Button size="sm" disabled={!isOpen || usedUp} onClick={() => onOpen(e)}>
              {usedUp ? "ทำครบแล้ว" : "เข้าสอบ"}
            </Button>
          </Card>
        );
      })}
    </ul>
  );
}

function TakeExam({ student, session, onExit }: { student: Student; session: AvailableExam; onExit: () => void }) {
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const startOrResume = useStartOrResumeAttempt();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (attempt || sessionQuestions.length === 0) return;
    startOrResume.mutate(
      {
        sessionId: session.id,
        studentId: student.id,
        questionIds: sessionQuestions.map((q) => q.question_id),
        shuffle: session.shuffle_questions,
      },
      { onSuccess: setAttempt, onError: () => toast("เข้าสอบไม่สำเร็จ", "error") },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQuestions.length]);

  if (!attempt) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (attempt.status === "submitted") {
    return <AttemptResult attempt={attempt} session={session} onExit={onExit} />;
  }

  return <AttemptRunner attempt={attempt} session={session} onSubmitted={setAttempt} onExit={onExit} />;
}

function AttemptRunner({
  attempt,
  session,
  onSubmitted,
  onExit,
}: {
  attempt: ExamAttempt;
  session: AvailableExam;
  onSubmitted: (a: ExamAttempt) => void;
  onExit: () => void;
}) {
  const { data } = useAttemptQuestions(attempt.question_order);
  const { data: answers } = useAttemptAnswers(attempt.id);
  const saveAnswer = useSaveAnswer();
  const submit = useSubmitAttempt();
  const logEvent = useLogAttemptEvent();
  const toast = useToast();

  const deadline = useMemo(() => {
    const windowEnd = new Date(session.closes_at).getTime();
    if (!session.duration_minutes) return windowEnd;
    return Math.min(windowEnd, new Date(attempt.started_at).getTime() + session.duration_minutes * 60_000);
  }, [session, attempt]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remainingMs = deadline - now;

  useEffect(() => {
    function onBlur() {
      logEvent.mutate({ attemptId: attempt.id, eventType: "blur" });
    }
    function onVisibility() {
      if (document.hidden) logEvent.mutate({ attemptId: attempt.id, eventType: "visibility_hidden" });
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id]);

  function doSubmit() {
    submit.mutate(attempt.id, {
      onSuccess: () => onSubmitted({ ...attempt, status: "submitted" }),
      onError: () => toast("ส่งคำตอบไม่สำเร็จ", "error"),
    });
  }

  useEffect(() => {
    if (remainingMs <= 0 && attempt.status === "in_progress" && !submit.isPending) doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs <= 0]);

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  const orderedQuestions = attempt.question_order
    .map((id) => data.questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const answeredCount = orderedQuestions.filter((q) => answers?.has(q.id)).length;
  const mins = Math.max(0, Math.floor(remainingMs / 60_000));
  const secs = Math.max(0, Math.floor((remainingMs % 60_000) / 1000));

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-4">
      <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between bg-background/95 px-3 py-2 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          ตอบแล้ว {answeredCount}/{orderedQuestions.length} ข้อ
        </p>
        {session.duration_minutes && (
          <p className={cn("font-mono text-sm font-semibold", remainingMs < 60_000 && "text-destructive")}>
            {mins}:{String(secs).padStart(2, "0")}
          </p>
        )}
      </div>

      {orderedQuestions.map((q, i) => {
        const choices = session.shuffle_choices
          ? [...(data.choicesByQuestion.get(q.id) ?? [])].sort(() => Math.random() - 0.5)
          : (data.choicesByQuestion.get(q.id) ?? []);
        const answer = answers?.get(q.id);
        return (
          <Card key={q.id} className="space-y-2 text-sm">
            <p className="font-medium">
              {i + 1}. {q.prompt}
            </p>
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
                {choices.map((c) => (
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
          </Card>
        );
      })}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onExit}>
          ออกไปก่อน (ทำต่อได้ภายหลัง)
        </Button>
        <Button className="flex-1" onClick={doSubmit} disabled={submit.isPending}>
          ส่งคำตอบ
        </Button>
      </div>
    </div>
  );
}

function AttemptResult({
  attempt,
  session,
  onExit,
}: {
  attempt: ExamAttempt;
  session: AvailableExam;
  onExit: () => void;
}) {
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const { data: answers } = useAttemptAnswers(attempt.id);
  const reviewIds = session.review_released ? attempt.question_order : [];
  const { data: reviewData } = useAttemptQuestions(reviewIds);
  const maxPoints = sessionQuestions.reduce((s, q) => s + q.points, 0);

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <Card className="text-center">
        <p className="text-xs text-muted-foreground">คะแนนที่ได้</p>
        <p className="font-heading text-2xl font-bold">
          {attempt.score ?? "—"}/{maxPoints}
        </p>
      </Card>

      {!session.review_released ? (
        <p className="text-center text-xs text-muted-foreground">รอครูเปิดเฉลย</p>
      ) : (
        reviewData?.questions.map((q, i) => {
          const answer = answers?.get(q.id);
          const choices = reviewData.choicesByQuestion.get(q.id) ?? [];
          return (
            <Card key={q.id} className={cn("space-y-1 text-sm", answer?.is_correct ? "border-success/40" : "border-destructive/40")}>
              <p className="font-medium">
                {i + 1}. {q.prompt}
              </p>
              {q.question_type === "short_answer" ? (
                <p className="text-xs">คำตอบของคุณ: {answer?.short_answer || "—"}</p>
              ) : (
                <ul className="space-y-0.5 text-xs">
                  {choices.map((c) => (
                    <li key={c.id} className={cn(answer?.choice_id === c.id && "font-medium")}>
                      {answer?.choice_id === c.id ? "● " : "○ "}
                      {c.label}
                    </li>
                  ))}
                </ul>
              )}
              <p className={cn("text-xs", answer?.is_correct ? "text-success" : "text-destructive")}>
                {answer?.is_correct ? "ถูกต้อง" : "ไม่ถูกต้อง"} ({answer?.points_awarded ?? 0} คะแนน)
              </p>
            </Card>
          );
        })
      )}

      <Button variant="outline" className="w-full" onClick={onExit}>
        กลับไปหน้ารายการสอบ
      </Button>
    </div>
  );
}
