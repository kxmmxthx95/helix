import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, usePauseIdleSignOut } from "@/auth/AuthProvider";
import { QuestionPromptView } from "@/components/editor/QuestionPromptView";
import { ChevronBack, Plus, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, FormSection, Input, Skeleton, Switch } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useClassroomsByIds, useExamQuestions, useGradeLevelsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import {
  useAttemptAnswers,
  useAttemptQuestions,
  useApproveTakeover,
  useAvailableExams,
  useClaimAttempt,
  useCreateExamSession,
  useDeleteExamSession,
  useExamCode,
  useExamSessionQuestions,
  useExamSessionTargets,
  useLockedCodeStudents,
  useLogAttemptEvent,
  useMyAttempts,
  useMyCurrentClassroom,
  useMyExamSessions,
  useMyTopicSets,
  useSaveAnswer,
  useSecurityEvents,
  useSessionAttempts,
  useSetSessionQuestions,
  useStartOrResumeAttempt,
  useStudentNames,
  useSubmitAttempt,
  useTopicSetsTopics,
  useTopicSetTopicIds,
  useUnlockExamCode,
  useUpdateExamSession,
  useVerifyExamCode,
  type AvailableExam,
  type ExamSessionQuestionRow,
} from "@/hooks/useExams";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { ExamApprovalTab, ExamTopicsTab, useExamApprovalPendingCount } from "@/routes/ExamApproval";
import { SubjectPicker } from "@/routes/ExamBank";
import type { ExamAttempt, ExamSecurityEventType, ExamSession, ExamTopicSet, Student } from "@/lib/database.types";
import { canApproveExams } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Both teacher (create/manage sessions) and student/parent (take exams) render from here — role-branched, same as Assignments.tsx/ScoreRecording.tsx. See migration 0047. */
export function Exams() {
  const { profile: me, myStudent } = useAuth();
  const isTeacher = me?.roles.includes("teacher") ?? false;
  const isParent = me?.roles.includes("parent") ?? false;

  if (isTeacher || canApproveExams(me?.roles ?? [])) return <StaffExams teacherId={isTeacher ? me!.id : null} canApprove={canApproveExams(me?.roles ?? [])} />;
  if (myStudent || isParent) return <StudentExams />;
  return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
}

// ============================================================== teacher side

type StaffTab = "rooms" | "schedule" | "topics" | "approve";

/** Tabs: ห้องสอบ + หัวข้อการสอบ (teachers), อนุมัติสอบ (approvers) — see migration 0183. */
function StaffExams({ teacherId, canApprove }: { teacherId: string | null; canApprove: boolean }) {
  const [tab, setTab] = useState<StaffTab>(teacherId ? "rooms" : "approve");
  const pending = useExamApprovalPendingCount(canApprove);
  // Room created from an approved topic set (topics card or approval drawer); the room belongs to the set's teacher.
  const [roomFor, setRoomFor] = useState<ExamTopicSet | null>(null);
  const tabs: [StaffTab, string][] = [
    ...(teacherId ? ([["rooms", "ห้องสอบ"], ["schedule", "ตารางสอบ"], ["topics", "หัวข้อการสอบ"]] as [StaffTab, string][]) : []),
    ...(canApprove ? ([["approve", pending > 0 ? `อนุมัติสอบ (${pending})` : "อนุมัติสอบ"]] as [StaffTab, string][]) : []),
  ];
  return (
    <div className="page-fill">
      {tabs.length > 1 && (
        <div className="scrollbar-hidden flex shrink-0 overflow-x-auto border-b border-border" role="tablist">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px h-11 min-w-fit flex-1 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "rooms" && teacherId && <TeacherExams teacherId={teacherId} />}
      {tab === "schedule" && teacherId && <ExamSchedule teacherId={teacherId} />}
      {(tab === "topics" || tab === "approve") && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {tab === "topics" && teacherId && <ExamTopicsTab teacherId={teacherId} />}
          {tab === "approve" && canApprove && <ExamApprovalTab onCreateRoom={setRoomFor} />}
        </div>
      )}
      {roomFor && <CreateSessionSheet open onOpenChange={() => setRoomFor(null)} teacherId={roomFor.teacher_id} presetSet={roomFor} />}
    </div>
  );
}

const fmtDateTime = (d: string) => new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

/** Exam timetable: scheduled rooms by opening day, plus rooms still waiting for a time. Tap a row to set/change its window. */
function ExamSchedule({ teacherId }: { teacherId: string }) {
  const { data: sessions = [], isLoading } = useMyExamSessions(teacherId);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(sessions.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const [editing, setEditing] = useState<ExamSession | null>(null);
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const unscheduled = sessions.filter((s) => !s.opens_at);
  const byDay = new Map<string, ExamSession[]>();
  for (const s of sessions.filter((x) => x.opens_at).sort((a, b) => a.opens_at!.localeCompare(b.opens_at!))) {
    const day = new Date(s.opens_at!).toLocaleDateString("th-TH", { dateStyle: "full" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ยังไม่มีตารางสอบ" description="สร้างห้องสอบจากชุดหัวข้อที่อนุมัติแล้ว แล้วมาจัดเวลาที่นี่" />
      </div>
    );
  }
  const row = (s: ExamSession, time: string) => (
    <button
      key={s.id}
      type="button"
      onClick={() => setEditing(s)}
      className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-muted"
    >
      <span className="w-28 shrink-0 font-mono tabular-nums">{time}</span>
      <span className="font-medium">{s.title}</span>
      <span className="ml-auto text-muted-foreground">{subjectById.get(s.subject_id)?.name_th ?? "—"}</span>
    </button>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {unscheduled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">ยังไม่กำหนดเวลา ({unscheduled.length})</h3>
          {unscheduled.map((s) => row(s, "ตั้งเวลา"))}
        </section>
      )}
      {[...byDay].map(([day, list]) => (
        <section key={day} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{day}</h3>
          {list.map((s) => row(s, `${fmtTime(s.opens_at!)} – ${fmtTime(s.closes_at!)}`))}
        </section>
      ))}
      {editing && <ScheduleSheet session={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** `datetime-local` wants local "YYYY-MM-DDTHH:mm". */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function ScheduleSheet({ session, onClose }: { session: ExamSession; onClose: () => void }) {
  const [opensAt, setOpensAt] = useState(toLocalInput(session.opens_at));
  const [closesAt, setClosesAt] = useState(toLocalInput(session.closes_at));
  const update = useUpdateExamSession();
  const toast = useToast();
  const valid = !!opensAt && !!closesAt && new Date(closesAt) > new Date(opensAt);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    update.mutate(
      { id: session.id, opens_at: new Date(opensAt).toISOString(), closes_at: new Date(closesAt).toISOString() },
      { onSuccess: onClose, onError: () => toast("บันทึกไม่สำเร็จ", "error") },
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={session.title}
      description="จัดเวลาสอบ"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="schedule-session" className="flex-1" disabled={!valid || update.isPending}>
            บันทึก
          </Button>
        </div>
      }
    >
      <form id="schedule-session" onSubmit={save} className="space-y-3">
        <Field label="เปิดสอบ" required>
          <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </Field>
        <Field label="ปิดสอบ" required>
          <Input type="datetime-local" value={closesAt} min={opensAt} onChange={(e) => setClosesAt(e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">นักเรียนจะเห็นและเข้าสอบได้เมื่อกำหนดเวลาแล้ว</p>
      </form>
    </Sheet>
  );
}

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
      <div className="flex shrink-0 items-center justify-end">
        <Button size="sm" onClick={() => setCreating(true)} disabled={assignments.length === 0}>
          <Plus className="h-3 w-3" /> เปิดสอบใหม่
        </Button>
      </div>

      {isLoading ? (
        <div className="table-panel flex-1" role="status" aria-label="กำลังโหลด">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อสอบ</th>
                <th className="px-3 py-2 font-medium">วิชา</th>
                <th className="px-3 py-2 font-medium">เปิด – ปิด</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2"><Skeleton className="h-3 w-32" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-3 w-20" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-3 w-40" /></td>
                  <td className="px-3 py-2" />
                </tr>
              ))}
            </tbody>
          </table>
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
                      {s.opens_at && s.closes_at ? (
                        `${fmtDateTime(s.opens_at)} – ${fmtDateTime(s.closes_at)}`
                      ) : (
                        <span className="text-muted-foreground">ยังไม่กำหนดเวลา</span>
                      )}
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

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-[3.25rem] items-center justify-between gap-4 text-sm leading-5">
      <span>{label}</span>
      <Switch size="xs" label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

function CreateSessionSheet({
  open,
  onOpenChange,
  teacherId,
  presetSet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner of the room — the set's teacher when a head creates it for them. */
  teacherId: string;
  /** Approved topic set the room is created for: subject, room and set are fixed. */
  presetSet?: ExamTopicSet;
}) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const gradeLevelIds = [...new Set(subjects.map((s) => s.suggested_grade_level_id).filter((id): id is string => !!id))];
  const { data: gradeLevels = [] } = useGradeLevelsByIds(gradeLevelIds);
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));

  const [pickedSubjectId, setSubjectId] = useState("");
  const subjectId = presetSet?.subject_id ?? pickedSubjectId;
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [syncGradebook, setSyncGradebook] = useState(false);
  const [pickedTopicSetId, setTopicSetId] = useState("");
  const topicSetId = presetSet?.id ?? pickedTopicSetId;

  const { data: mySets = [] } = useMyTopicSets(teacherId);
  const approvedSets = mySets.filter(
    (s) => s.approval_status === "approved" && !s.no_exam && s.teaching_assignment_id && s.subject_id === subjectId,
  );
  const { data: setTopics } = useTopicSetsTopics(approvedSets.map((s) => s.id));
  const setLabel = (id: string) => {
    const names = (setTopics?.get(id) ?? []).map((t) => t.topic);
    return names.length === 0 ? "ไม่ระบุหัวข้อ" : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
  };

  const classroomIds = [...new Set(assignments.filter((a) => a.subject_id === subjectId).map((a) => a.classroom_id))];
  const { data: classrooms = [] } = useClassroomsByIds(classroomIds);
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));

  const create = useCreateExamSession();
  const toast = useToast();

  function reset() {
    setSubjectId("");
    setTitle("");
    setDuration("");
    setMaxAttempts("1");
    setTopicSetId("");
  }

  // A set belongs to one room, so the session opens for exactly that room.
  const targetAssignmentId = (presetSet ?? approvedSets.find((s) => s.id === topicSetId))?.teaching_assignment_id ?? "";
  const canSave = subjectId && topicSetId && title.trim() && !!targetAssignmentId;

  function close() {
    reset();
    onOpenChange(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    create.mutate(
      {
        subject_id: subjectId,
        teacher_id: teacherId,
        title: title.trim(),
        duration_minutes: duration ? Number(duration) : null,
        max_attempts: Number(maxAttempts) || 1,
        shuffle_questions: shuffleQuestions,
        shuffle_choices: shuffleChoices,
        sync_to_gradebook: syncGradebook,
        topic_set_id: topicSetId,
        teaching_assignment_ids: [targetAssignmentId],
        questions: [],
      },
      {
        onSuccess: () => {
          toast("สร้างห้องสอบแล้ว");
          close();
        },
        onError: () => toast("สร้างห้องสอบไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title={presetSet ? "สร้างห้องสอบ" : "เปิดสอบใหม่"}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="submit" form="create-session" className="flex-1" disabled={!canSave || create.isPending}>
            สร้างห้องสอบ
          </Button>
        </div>
      }
    >
      <form id="create-session" onSubmit={submit} className="space-y-3">
        {!presetSet && (
        <Field label="วิชา" required>
          <SubjectPicker
            subjects={subjects}
            gradeLevelById={gradeLevelById}
            value={subjectId}
            onChange={(id) => {
              setSubjectId(id);
              setTopicSetId("");
            }}
          />
        </Field>
        )}
        {!presetSet && subjectId && (
          <Field label="ห้อง / ชุดหัวข้อการสอบ" required>
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
              value={topicSetId}
              onChange={(e) => setTopicSetId(e.target.value)}
            >
              <option value="">{approvedSets.length === 0 ? "ยังไม่มีชุดหัวข้อที่อนุมัติ" : "เลือกห้อง"}</option>
              {approvedSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {classroomById.get(assignments.find((a) => a.id === s.teaching_assignment_id)?.classroom_id ?? "")?.name ?? "—"} · {setLabel(s.id)}
                </option>
              ))}
            </select>
            {approvedSets.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">ส่งชุดหัวข้อขออนุมัติที่แท็บ “หัวข้อการสอบ” ก่อน</p>
            )}
          </Field>
        )}
        <FormSection>
          <Field label="ชื่อการสอบ" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น สอบกลางภาค" />
          </Field>
        </FormSection>

        <FormSection>
          <Field label="เวลาทำ (นาที)">
            <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="ไม่จำกัด" />
          </Field>
          <Field label="จำนวนครั้งที่สอบได้">
            <Input type="number" min="1" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
          </Field>
        </FormSection>

        <FormSection>
          <SwitchRow label="สุ่มลำดับข้อ" checked={shuffleQuestions} onChange={setShuffleQuestions} />
          <SwitchRow label="สุ่มลำดับตัวเลือก" checked={shuffleChoices} onChange={setShuffleChoices} />
          <SwitchRow label="บันทึกคะแนนเข้าสมุดคะแนน" checked={syncGradebook} onChange={setSyncGradebook} />
        </FormSection>

        <p className="text-xs text-muted-foreground">เลือกข้อสอบได้หลังสร้างห้องสอบ ในหน้ารายละเอียดห้องสอบ</p>
      </form>
    </Sheet>
  );
}

function SessionDetail({ session, onBack }: { session: ExamSession; onBack: () => void }) {
  const { data: attempts = [], isLoading } = useSessionAttempts(session.id);
  const { data: targetIds = [] } = useExamSessionTargets(session.id);
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const update = useUpdateExamSession();
  const toast = useToast();
  const [editingQuestions, setEditingQuestions] = useState(false);

  const maxPoints = sessionQuestions.reduce((s, q) => s + q.points, 0);
  const submitted = attempts.filter((a) => a.status === "submitted");

  return (
    <div className="page-fill">
      <div className="toolbar shrink-0">
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

      <button
        type="button"
        onClick={() => setEditingQuestions(true)}
        className="flex shrink-0 items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-muted"
      >
        จัดการข้อสอบ ({sessionQuestions.length} ข้อ)
        <span className="text-muted-foreground">แก้ไข</span>
      </button>

      <label className="flex shrink-0 items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
        เปิดเฉลยให้นักเรียนดู
        <Switch
          checked={session.review_released}
          onChange={(v) =>
            update.mutate({ id: session.id, review_released: v }, { onError: () => toast("บันทึกไม่สำเร็จ", "error") })
          }
        />
      </label>

      <SecurityPanel session={session} attempts={attempts} />

      <EditSessionQuestionsSheet
        session={session}
        sessionQuestions={sessionQuestions}
        open={editingQuestions}
        onOpenChange={setEditingQuestions}
      />

      {isLoading ? (
        <div className="table-panel flex-1" role="status" aria-label="กำลังโหลด">
          <table className="w-full min-w-[28rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">นักเรียน</th>
                <th className="px-3 py-2 font-medium">ครั้งที่</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">คะแนน</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2"><Skeleton className="h-3 w-24" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-3 w-6" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-3 w-14" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-3 w-8" /></td>
                </tr>
              ))}
            </tbody>
          </table>
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

const SECURITY_EVENT_LABEL: Record<ExamSecurityEventType, string> = {
  login_blocked: "พยายามล็อกอินซ้อนระหว่างสอบ",
  takeover_requested: "ขอเปลี่ยนเครื่อง",
  takeover_approved: "ครูอนุมัติเปลี่ยนเครื่อง",
  code_failed: "กรอกรหัสสอบผิด",
  code_locked: "รหัสสอบถูกล็อก",
  code_unlocked: "ครูปลดล็อกรหัสสอบ",
  strict_disabled: "ปิดโหมดสอบจริง",
  reset_blocked: "ถูกปฏิเสธการรีเซ็ตรหัสผ่านช่วงสอบ",
};

/** Teacher view of the anti-impersonation controls (migration 0132): code, single-device takeovers, locked students, event trail. */
function SecurityPanel({ session, attempts }: { session: ExamSession; attempts: ExamAttempt[] }) {
  const update = useUpdateExamSession();
  const approve = useApproveTakeover();
  const unlock = useUnlockExamCode();
  const toast = useToast();
  const { data: code } = useExamCode(session.strict_mode ? session.id : null);
  const { data: locked = [] } = useLockedCodeStudents(session.id);
  const { data: events = [] } = useSecurityEvents(session.id);

  const pending = attempts.filter((a) => a.status === "in_progress" && a.takeover_session);
  const names = useStudentNames([
    ...pending.map((a) => a.student_id),
    ...locked.map((l) => l.student_id),
    ...events.flatMap((e) => (e.student_id ? [e.student_id] : [])),
  ]).data;
  const nameOf = (id: string | null) => (id ? (names?.get(id) ?? "นักเรียน") : "—");
  const onError = () => toast("ทำรายการไม่สำเร็จ", "error");

  return (
    <div className="shrink-0 space-y-2 rounded-lg border border-border px-3 py-2 text-xs">
      <label className="flex items-center justify-between">
        โหมดสอบจริง (รหัสสอบ + ล็อกเครื่องเดียว)
        <Switch checked={session.strict_mode} onChange={(v) => update.mutate({ id: session.id, strict_mode: v }, { onError })} />
      </label>

      {session.strict_mode && (
        <p className="flex items-center justify-between">
          รหัสสอบ (แจ้งในห้องสอบเท่านั้น)
          <span className="font-mono text-base font-semibold tracking-widest">{code ?? "······"}</span>
        </p>
      )}

      {pending.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5">
          <span>{nameOf(a.student_id)} ขอเปลี่ยนเครื่อง</span>
          <Button size="sm" onClick={() => approve.mutate(a.id, { onError })}>
            อนุมัติ
          </Button>
        </div>
      ))}

      {locked.map((l) => (
        <div key={l.student_id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5">
          <span>{nameOf(l.student_id)} ถูกล็อกรหัสสอบ</span>
          <Button size="sm" onClick={() => unlock.mutate({ sessionId: session.id, studentId: l.student_id }, { onError })}>
            ปลดล็อก
          </Button>
        </div>
      ))}

      {events.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">เหตุการณ์ผิดปกติ ({events.length})</summary>
          <ul className="mt-1 space-y-1">
            {events.map((e) => (
              <li key={e.id} className="text-muted-foreground">
                {new Date(e.at).toLocaleString("th-TH")} · {nameOf(e.student_id)} · {SECURITY_EVENT_LABEL[e.event_type]}
                {e.device && <span className="block truncate">{e.device}{e.ip ? ` · ${e.ip}` : ""}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EditSessionQuestionsSheet({
  session,
  sessionQuestions,
  open,
  onOpenChange,
}: {
  session: ExamSession;
  sessionQuestions: ExamSessionQuestionRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: bank = [] } = useExamQuestions(open ? session.subject_id : null);
  const setTopicIds = useTopicSetTopicIds(open ? session.topic_set_id : null);
  // Legacy sessions migrated from before topic sets may have a set with no topics: offer the whole bank.
  const questions = setTopicIds.length === 0 ? bank : bank.filter((q) => q.plan_topic_id && setTopicIds.includes(q.plan_topic_id));
  const setQuestions = useSetSessionQuestions();
  const toast = useToast();
  const [questionIds, setQuestionIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setQuestionIds(sessionQuestions.map((q) => q.question_id));
  }, [open, sessionQuestions]);

  const totalPoints = questions.filter((q) => questionIds.includes(q.id)).reduce((s, q) => s + q.points, 0);

  function save() {
    setQuestions.mutate(
      {
        sessionId: session.id,
        questions: questionIds.map((question_id) => ({
          question_id,
          points: questions.find((q) => q.id === question_id)?.points ?? 1,
        })),
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: () => toast("บันทึกข้อสอบไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="จัดการข้อสอบ"
      footer={
        <Button className="w-full" onClick={save} disabled={questionIds.length === 0 || setQuestions.isPending}>
          บันทึก
        </Button>
      }
    >
      <Field label={`ข้อสอบ (เลือกแล้ว ${questionIds.length} ข้อ, รวม ${totalPoints} คะแนน)`} required>
        <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
          {questions.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีข้อสอบในหัวข้อของชุดที่อนุมัติ (เพิ่มในคลังข้อสอบโดยระบุหัวข้อ)</p>}
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
    </Sheet>
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

/** Joinable right now: inside the window and attempts left. */
export function isExamOpen(e: AvailableExam, now = new Date()) {
  return now >= new Date(e.opens_at) && now <= new Date(e.closes_at) && e.my_attempts < e.max_attempts;
}

/** Subject ids with at least one joinable exam for this student — for the home island screen. */
export function useOpenExamSubjectIds(studentId: string | null) {
  const { data: classroom } = useMyCurrentClassroom(studentId);
  const { data: exams = [] } = useAvailableExams(studentId, classroom?.classroomId ?? null, classroom?.academicYear ?? null);
  return useMemo(() => new Set(exams.filter((e) => isExamOpen(e)).map((e) => e.subject_id)), [exams]);
}

function ExamList({ student, onOpen }: { student: Student; onOpen: (s: AvailableExam) => void }) {
  const { data: classroom } = useMyCurrentClassroom(student.id);
  const { data: allExams = [], isLoading } = useAvailableExams(
    student.id,
    classroom?.classroomId ?? null,
    classroom?.academicYear ?? null,
  );
  const [params, setParams] = useSearchParams();
  const subjectCode = params.get("subject");
  const { data: subjects = [] } = useSubjectsByIds(subjectCode ? [...new Set(allExams.map((e) => e.subject_id))] : []);
  const subjectId = subjects.find((s) => s.code === subjectCode)?.id;
  const exams = subjectCode ? allExams.filter((e) => e.subject_id === subjectId) : allExams;
  const clearFilter = subjectCode && (
    <button type="button" onClick={() => setParams({})} className="tappable mb-2 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium">
      {subjectCode} ✕ ดูทั้งหมด
    </button>
  );

  if (isLoading) {
    return (
      <ul className="space-y-2" role="status" aria-label="กำลังโหลด">
        {[0, 1].map((i) => (
          <li key={i}>
            <Card className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
            </Card>
          </li>
        ))}
      </ul>
    );
  }
  if (exams.length === 0) {
    return (
      <>
        {clearFilter}
        <EmptyState title="ไม่มีข้อสอบ" description="ยังไม่มีการเปิดสอบสำหรับห้องนี้" />
      </>
    );
  }

  const now = new Date();
  return (
    <>
      {clearFilter}
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
    </>
  );
}

function TakeExam({ student, session, onExit }: { student: Student; session: AvailableExam; onExit: () => void }) {
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const { data: mine, isLoading: mineLoading } = useMyAttempts(session.id, student.id);
  const startOrResume = useStartOrResumeAttempt();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [codeOk, setCodeOk] = useState(false);
  const toast = useToast();

  // Resuming an unsubmitted attempt needs no code; starting a new one does (strict_mode, migration 0132).
  const needsCode = session.strict_mode && !mineLoading && !codeOk && !mine?.some((a) => a.status === "in_progress");

  useEffect(() => {
    if (attempt || sessionQuestions.length === 0 || mineLoading || needsCode) return;
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
  }, [sessionQuestions.length, mineLoading, needsCode]);

  if (needsCode) return <ExamCodeForm sessionId={session.id} onPassed={() => setCodeOk(true)} onExit={onExit} />;

  if (!attempt) {
    return (
      <div className="mx-auto max-w-xl space-y-3 pb-4" role="status" aria-label="กำลังโหลด">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (attempt.status === "submitted") {
    return <AttemptResult attempt={attempt} session={session} onExit={onExit} />;
  }

  return (
    <AttemptGuard attemptId={attempt.id} onExit={onExit}>
      <AttemptRunner attempt={attempt} session={session} onSubmitted={setAttempt} onExit={onExit} />
    </AttemptGuard>
  );
}

function ExamCodeForm({ sessionId, onPassed, onExit }: { sessionId: string; onPassed: () => void; onExit: () => void }) {
  const verify = useVerifyExamCode();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    verify.mutate(
      { sessionId, code: code.trim() },
      {
        onSuccess: (r) => {
          if (r === "ok") onPassed();
          else setError(r === "locked" ? "กรอกรหัสผิดเกินกำหนด กรุณาแจ้งครูเพื่อปลดล็อก" : "รหัสสอบไม่ถูกต้อง");
        },
        onError: () => setError("ตรวจรหัสไม่สำเร็จ ลองใหม่อีกครั้ง"),
      },
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xs space-y-3 pt-8">
      <Field label="รหัสสอบ (ครูจะแจ้งในห้องสอบ)" error={error}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full" disabled={code.length !== 6 || verify.isPending}>
        เริ่มสอบ
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onExit}>
        กลับ
      </Button>
    </form>
  );
}

/** Only the session holding the attempt may render the exam; any other browser session waits here. */
function AttemptGuard({ attemptId, onExit, children }: { attemptId: string; onExit: () => void; children: React.ReactNode }) {
  usePauseIdleSignOut(); // the exam has its own clock + heartbeat; an idle sign-out mid-attempt just strands the student
  const { data: status, isError } = useClaimAttempt(attemptId);

  if (status === "ok") return <>{children}</>;
  if (!status && !isError) {
    return <div className="mx-auto max-w-xl pt-8" role="status" aria-label="กำลังโหลด"><Skeleton className="h-3.5 w-full" /></div>;
  }
  const message =
    status === "blocked"
      ? "บัญชีนี้กำลังทำข้อสอบอยู่ในอุปกรณ์อื่น ไม่สามารถทำซ้อนได้"
      : status === "pending_teacher"
        ? "อุปกรณ์เดิมหยุดตอบสนอง ส่งคำขอเปลี่ยนเครื่องให้ครูแล้ว กรุณารอครูอนุมัติ"
        : status === "ended"
          ? "การสอบครั้งนี้สิ้นสุดแล้ว"
          : "เชื่อมต่อไม่สำเร็จ กำลังลองใหม่…";
  return (
    <Card className="mx-auto max-w-xl space-y-3 text-sm" role="alert">
      <p>{message}</p>
      <Button variant="ghost" onClick={onExit}>
        กลับ
      </Button>
    </Card>
  );
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
      <div className="mx-auto max-w-xl space-y-3 pb-4" role="status" aria-label="กำลังโหลด">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </Card>
        ))}
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
                    <QuestionPromptView value={c.label_json} />
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
              <div className="font-medium">
                {i + 1}. <QuestionPromptView value={q.prompt_json} />
              </div>
              {q.question_type === "short_answer" ? (
                <p className="text-xs">คำตอบของคุณ: {answer?.short_answer || "—"}</p>
              ) : (
                <ul className="space-y-0.5 text-xs">
                  {choices.map((c) => (
                    <li key={c.id} className={cn(answer?.choice_id === c.id && "font-medium")}>
                      {answer?.choice_id === c.id ? "● " : "○ "}
                      <QuestionPromptView value={c.label_json} />
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
