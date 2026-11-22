import { useEffect, useMemo, useState } from "react";
import { ViewToggle } from "@/components/ViewToggle";
import { useSearchParams } from "react-router-dom";
import { useAuth, usePauseIdleSignOut } from "@/auth/AuthProvider";
import { QuestionPromptView } from "@/components/editor/QuestionPromptView";
import { AlertTriangle, CalendarIcon, ChevronForward, SettingsIcon, CheckmarkCircleIcon, ChevronBack, ClipboardIcon, DocumentTextIcon, LayersIcon, ListIcon, PencilIcon, PeopleIcon, Plus, StarIcon, TrashIcon } from "@/components/icons";
import { Collapse } from "@/components/Collapse";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExamSeatingCard } from "@/components/ExamSeatingCard";
import { useSessionRoomIds, useSessionsWithSeating, useSetRoomPhysical } from "@/hooks/useExamSeating";
import { IconTile } from "@/components/IconTile";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Field, FormSection, Input, Select, Spinner, Switch } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { useProfilesByIds } from "@/hooks/usePractice";
import { useClassroomsByIds, useExamQuestionsOf, useGradeLevelsByIds, useSubjectsByIds, type ExamQuestionWithChoices } from "@/hooks/useExamBank";
import {
  useAddSessionQuestion,
  useRemoveSessionQuestion,
  useAttemptAnswers,
  useAttemptQuestions,
  useApproveTakeover,
  useAssignmentClassrooms,
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
  useAllExamSessions,
  useMyExamSessions,
  useMyTopicSets,
  useSaveAnswer,
  useSecurityEvents,
  useSessionAttempts,
  useSessionQuestionCounts,
  useSessionRoster,
  useStudentAvatars,
  useSessionSets,
  useStartOrResumeAttempt,
  useStudentNames,
  useSubmitAttempt,
  useTopicSetsByIds,
  useTopicSetsInUse,
  useTopicSetsTopics,
  useUnlockExamCode,
  useUpdateExamSession,
  useVerifyExamCode,
  type AvailableExam,
  type ExamSessionQuestionRow,
} from "@/hooks/useExams";
import { useRooms } from "@/hooks/useSchedule";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { ExamApprovalTab, ExamSubmissionsTab, ExamTopicsTab, useExamApprovalPendingCount } from "@/routes/ExamApproval";
import { DIFFICULTY_BADGE_CLASS, DIFFICULTY_LABEL, QuestionForm, QuestionSheet, SubjectPicker, useQuestionForm } from "@/routes/ExamBank";
import type { ExamAttempt, ExamSecurityEventType, ExamSession, ExamSessionRoom, ExamTopicSet, Student, Subject } from "@/lib/database.types";
import { EXAM_KINDS, examLabel, kindTone, roundTone } from "@/lib/examKinds";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { canApproveExams } from "@/lib/roles";
import { ICON, ICON_BTN } from "@/lib/iconButton";
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

function LoadingSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Spinner className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

// ============================================================== teacher side

type StaffTab = "rooms" | "schedule" | "topics" | "list" | "approve";

const TAB_ICON = { rooms: ClipboardIcon, schedule: CalendarIcon, topics: ListIcon, list: DocumentTextIcon, approve: CheckmarkCircleIcon } as const;

/** Tabs: ห้องสอบ + หัวข้อการสอบ (teachers), อนุมัติสอบ (approvers) — see migration 0183. */
function StaffExams({ teacherId, canApprove }: { teacherId: string | null; canApprove: boolean }) {
  const [tab, setTab] = useState<StaffTab>(teacherId ? "rooms" : "approve");
  const pending = useExamApprovalPendingCount(canApprove);
  // Room created from an approved topic set (topics card or approval drawer); the room belongs to the set's teacher.
  const [roomFor, setRoomFor] = useState<ExamTopicSet[] | null>(null);
  const tabs: [StaffTab, string][] = [
    ...(teacherId || canApprove ? ([["rooms", "ห้องสอบ"]] as [StaffTab, string][]) : []),
    ...(teacherId ? ([["schedule", "ตารางสอบ"], ["topics", "หัวข้อการสอบ"], ["list", "รายการ"]] as [StaffTab, string][]) : []),
    ...(canApprove ? ([["approve", pending > 0 ? `อนุมัติสอบ (${pending})` : "อนุมัติสอบ"]] as [StaffTab, string][]) : []),
  ];
  return (
    <div className="page-fill gap-2">
      {tabs.length > 1 && (
        <div className="flex w-full shrink-0 flex-wrap border-b border-border" role="tablist">
          {tabs.map(([key, label]) => {
            const Icon = TAB_ICON[key];
            return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-label={label}
              title={label}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px flex flex-1 flex-col items-center justify-center gap-1 border-b-2 px-2 py-2 text-[11px] font-medium whitespace-nowrap",
                tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
            );
          })}
        </div>
      )}
      {tab === "rooms" && (
        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pt-1">
          <TeacherExams teacherId={teacherId} canSeeAll={canApprove} />
        </div>
      )}
      {tab === "schedule" && teacherId && (
        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pt-1">
          <ExamSchedule teacherId={teacherId} canSeeAll={canApprove} />
        </div>
      )}
      {(tab === "topics" || tab === "list" || tab === "approve") && (
        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pt-1">
          {tab === "topics" && teacherId && <ExamTopicsTab teacherId={teacherId} canSeeAll={canApprove} />}
          {tab === "list" && teacherId && <ExamSubmissionsTab teacherId={teacherId} onCreateRoom={setRoomFor} />}
          {tab === "approve" && canApprove && <ExamApprovalTab onCreateRoom={setRoomFor} />}
        </div>
      )}
      {roomFor && <CreateSessionSheet open onOpenChange={() => setRoomFor(null)} teacherId={roomFor[0]!.teacher_id} presetSets={roomFor} />}
    </div>
  );
}

/** Exam timetable: scheduled rooms by opening day, plus rooms still waiting for a time. Tap a row to set/change its window. */
function ExamSchedule({ teacherId, canSeeAll }: { teacherId: string; canSeeAll: boolean }) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const mine = useMyExamSessions(teacherId);
  const all = useAllExamSessions(canSeeAll && scope === "all");
  const { data: sessions = [], isLoading } = scope === "all" && canSeeAll ? all : mine;
  const { data: sessionSets } = useSessionSets(sessions.map((s) => s.id));
  const { data: subjects = [] } = useSubjectsByIds([...new Set([...sessions.map((s) => s.subject_id), ...[...(sessionSets?.values() ?? [])].flat().map((x) => x.subject_id)])]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: owners = [] } = useProfilesByIds([...new Set(sessions.map((s) => s.teacher_id))]);
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const [editing, setEditing] = useState<ExamSession | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [when, setWhen] = useState<"active" | "past" | "all">("active");
  const colors = useSubjectColors([]);
  // Physical rooms where each exam is sat (exam_session_rooms → rooms), first room first.
  const { profile: scheduleMe } = useAuth();
  const { data: venues = [] } = useRooms(scheduleMe?.department_id ?? null);
  const { data: roomIdsOf } = useSessionRoomIds(sessions.map((s) => s.id));
  const venueOf = (s: ExamSession) => {
    const names = (roomIdsOf?.get(s.id) ?? []).flatMap((id) => venues.find((v) => v.id === id)?.name ?? []);
    return names.length > 0 ? names.join(", ") : undefined;
  };
  // subject → room, via the topic set each session subject was created from (works for other teachers' rooms too).
  const { data: roomSets = [] } = useTopicSetsByIds([...new Set([...(sessionSets?.values() ?? [])].flat().map((x) => x.topic_set_id).filter(Boolean))]);
  const { data: classroomOfAssignment } = useAssignmentClassrooms([...new Set(roomSets.map((t) => t.teaching_assignment_id).filter((id): id is string => !!id))]);
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(classroomOfAssignment?.values() ?? [])]);
  const { data: grades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const roomOfSet = (setId: string) => {
    const c = classrooms.find((x) => x.id === classroomOfAssignment?.get(roomSets.find((t) => t.id === setId)?.teaching_assignment_id ?? ""));
    const g = grades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : null;
  };
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  // Rooms without an exam time are not listed here; set the time from the room settings.
  const now = Date.now();
  const shown = sessions.filter((s) => {
    if (!s.opens_at) return false;
    if (when === "all") return true;
    const ended = !!s.closes_at && new Date(s.closes_at).getTime() < now;
    return when === "past" ? ended : !ended;
  });
  const byDay = new Map<string, ExamSession[]>();
  for (const s of shown.slice().sort((a, b) => a.opens_at!.localeCompare(b.opens_at!))) {
    const day = new Date(s.opens_at!).toLocaleDateString("th-TH", { dateStyle: "full" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ยังไม่มีตารางสอบ" description="สร้างห้องสอบจากชุดหัวข้อที่อนุมัติแล้ว แล้วมาจัดเวลาที่นี่" />
      </div>
    );
  }
  const subjectsOf = (s: ExamSession) => (sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]).flatMap((id) => subjectById.get(id) ?? []);
  const setIdOf = (s: ExamSession, subjectId: string) => sessionSets?.get(s.id)?.find((x) => x.subject_id === subjectId)?.topic_set_id ?? "";
  const row = (s: ExamSession) => {
    const sets = sessionSets?.get(s.id) ?? [{ subject_id: s.subject_id, topic_set_id: "" }];
    return (
      <div
        key={s.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(s)}
        onKeyDown={(e) => e.key === "Enter" && setEditing(s)}
        className="cursor-pointer rounded-xl border border-border bg-card p-3 text-xs hover:bg-muted active:bg-muted"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold tabular-nums">{fmtTime(s.opens_at!)}{s.closes_at ? ` – ${fmtTime(s.closes_at)}` : ""}</p>
            {s.exam_type ? (
              <p className="flex flex-wrap items-center gap-1">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", kindTone(s.exam_type))}>{s.exam_type}</span>
                {s.round && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", roundTone(s.round))}>ครั้งที่ {s.round}</span>}
                {venueOf(s) && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">ห้องสอบ {venueOf(s)}</span>}
              </p>
            ) : (
              <p className="truncate text-muted-foreground">{s.title}</p>
            )}
            {sets.map((x) => {
              const subject = subjectById.get(x.subject_id);
              const room = roomOfSet(x.topic_set_id);
              return subject ? (
                <div key={x.subject_id + x.topic_set_id}>
                  <p className="truncate text-sm font-medium">{subject.name_th}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(subject.learning_area_id))}>{subject.code}</span>
                    {room && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span>}
                  </p>
                </div>
              ) : null;
            })}
            <div className="flex min-w-0 items-center gap-2 pt-1 text-muted-foreground">
              <Avatar name={ownerName(ownerById.get(s.teacher_id))} src={ownerById.get(s.teacher_id) ? avatarUrl(ownerById.get(s.teacher_id)!) : null} className="h-6 w-6 text-[9px]" />
              <span className="truncate">{ownerName(ownerById.get(s.teacher_id))}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };
  const scheduled = shown.slice().sort((a, b) => a.opens_at!.localeCompare(b.opens_at!));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pt-1">
      <div className="flex shrink-0 items-center justify-end gap-2">
        {canSeeAll && (
          <Select className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:w-40 sm:pr-8" aria-label="ขอบเขตตารางสอบ" value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")}>
            <option value="mine">ของฉัน</option>
            <option value="all">ทุกวิชา</option>
          </Select>
        )}
        <Select className="ui-control-compact mr-auto h-8 px-2.5 pr-7 text-[13px] sm:w-64 sm:pr-8" aria-label="ช่วงเวลาสอบ" value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
          <option value="active">ยังไม่สิ้นสุด</option>
          <option value="past">ผ่านไปแล้ว</option>
          <option value="all">ทั้งหมด</option>
        </Select>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {isLoading ? <LoadingSpinner /> : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={when === "past" ? "ยังไม่มีการสอบที่ผ่านไปแล้ว" : "ไม่มีการสอบที่ยังไม่สิ้นสุด"}
            description={when === "past" ? "เลือก 'ทั้งหมด' เพื่อดูทุกการสอบ" : "เลือก 'ทั้งหมด' เพื่อดูการสอบที่ผ่านไปแล้ว"}
          />
        </div>
      ) : view === "table" ? (
        <div className="table-panel flex rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[36rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">วันที่และเวลา</th>
                  <th className="px-4 py-3">รหัสวิชา</th>
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">ชั้น</th>
                  <th className="px-4 py-3">ห้องสอบ</th>
                  <th className="px-4 py-3">ประเภทการสอบ</th>
                  <th className="px-4 py-3">ครั้งที่</th>
                  <th className="px-4 py-3">ครูผู้สอน</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((s) => (
                  <tr key={s.id} onClick={() => setEditing(s)} className="h-12 cursor-pointer border-t border-border first:border-t-0">
                    <td className="whitespace-nowrap px-4 py-2">
                      <div>{s.opens_at ? new Date(s.opens_at).toLocaleDateString("th-TH", { dateStyle: "medium" }) : <span className="text-muted-foreground">ยังไม่กำหนด</span>}</div>
                      <div className="tabular-nums text-muted-foreground">{s.opens_at ? `${fmtTime(s.opens_at)} – ${fmtTime(s.closes_at!)}` : "ตั้งเวลา"}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{subjectsOf(s).map((x) => <div key={x.id} className="flex h-8 items-center"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span></div>)}</td>
                    <td className="px-4 py-3 font-medium">{subjectsOf(s).map((x) => <div key={x.id} className="flex h-8 items-center">{x.name_th}</div>)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{subjectsOf(s).map((x) => {
                        const room = roomOfSet(setIdOf(s, x.id));
                        return <div key={x.id} className="flex h-8 items-center">{room ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span> : "—"}</div>;
                      })}</td>
                    <td className="px-4 py-0">{venueOf(s) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-0">{s.exam_type ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", kindTone(s.exam_type))}>{s.exam_type}</span> : <span className="text-muted-foreground">{s.title}</span>}</td>
                    <td className="px-4 py-0">{s.round ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", roundTone(s.round))}>{s.round}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar name={ownerName(ownerById.get(s.teacher_id))} src={ownerById.get(s.teacher_id) ? avatarUrl(ownerById.get(s.teacher_id)!) : null} className="h-7 w-7 text-[10px]" />
                        <span className="whitespace-nowrap">{ownerName(ownerById.get(s.teacher_id))}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {[...byDay].map(([day, list]) => (
            <section key={day} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">{day}</h3>
              {list.map((s) => row(s))}
            </section>
          ))}
        </div>
      )}
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

/** Close time when the exam has a duration: opens + เวลาทำ (local input string in, local input string out). */
const closeAfter = (opensLocal: string, minutes: number | null) =>
  minutes && opensLocal ? toLocalInput(new Date(new Date(opensLocal).getTime() + minutes * 60_000).toISOString()) : null;

/** เวลาสอบ card on the room page: same layout as ExamSettingsCard; the window saves on blur once both ends are valid. */
function ScheduleCard({ session }: { session: ExamSession }) {
  const [open, setOpen] = useState(false);
  const [opensAt, setOpensAt] = useState(toLocalInput(session.opens_at));
  const [closesAt, setClosesAt] = useState(toLocalInput(session.closes_at));
  const update = useUpdateExamSession();
  const toast = useToast();
  useEffect(() => setOpensAt(toLocalInput(session.opens_at)), [session.opens_at]);
  useEffect(() => setClosesAt(toLocalInput(session.closes_at)), [session.closes_at]);
  const valid = !!opensAt && !!closesAt && new Date(closesAt) > new Date(opensAt);
  // With เวลาทำ set, the close time follows the open time and is not typed by hand.
  const autoClose = !!session.duration_minutes;

  function save() {
    if (!valid || (opensAt === toLocalInput(session.opens_at) && closesAt === toLocalInput(session.closes_at))) return;
    update.mutate(
      { id: session.id, opens_at: new Date(opensAt).toISOString(), closes_at: new Date(closesAt).toISOString() },
      { onError: () => toast("บันทึกไม่สำเร็จ", "error") },
    );
  }

  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
      >
        <span className="flex shrink-0 items-center gap-2">
          <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><CalendarIcon className="h-4 w-4" /></IconTile>
          <span className="font-semibold text-foreground">เวลาสอบ</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-right text-foreground">
          {session.opens_at && session.closes_at ? (
            (() => {
              const w = windowParts(session.opens_at, session.closes_at);
              return (
                <>
                  <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">{w.date}</span>
                  <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{w.time}</span>
                </>
              );
            })()
          ) : (
            <span className="truncate rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">ยังไม่ได้ตั้งเวลา</span>
          )}
          {!(session.opens_at && session.closes_at) && <span className="flex shrink-0 text-destructive" role="img" aria-label="ยังไม่ได้ตั้งค่า"><AlertTriangle className="h-4 w-4" /></span>}
          <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </span>
      </button>
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-muted/40 p-3 [&_.text-sm]:text-xs [&_input]:!h-6 [&_input]:!text-xs">
          <FormSection>
            <Field label="เปิดสอบ" required>
              <Input
                type="datetime-local"
                value={opensAt}
                onChange={(e) => {
                  setOpensAt(e.target.value);
                  const end = autoClose ? closeAfter(e.target.value, session.duration_minutes) : null;
                  if (end) setClosesAt(end);
                }}
                onBlur={save}
              />
            </Field>
            <Field label="ปิดสอบ" required error={opensAt && closesAt && !valid ? "ต้องหลังเวลาเปิดสอบ" : undefined}>
              <Input type="datetime-local" value={closesAt} min={opensAt} disabled={autoClose} onChange={(e) => setClosesAt(e.target.value)} onBlur={save} />
              {autoClose && <p className="text-xs text-muted-foreground">คำนวณจากเวลาทำ {session.duration_minutes} นาที</p>}
            </Field>
          </FormSection>
            <p className="text-xs text-muted-foreground">นักเรียนจะเห็นและเข้าสอบได้เมื่อกำหนดเวลาแล้ว</p>
        </div>
      </Collapse>
    </div>
  );
}

/** "17 พ.ย. 09:00 – 10:30", or both dates when the window spans days. */
/** Date and time of an exam window as two labels (date: "26 พ.ย. 2569", time: "08:30 – 09:30"). */
function windowParts(opens: string, closes: string) {
  const o = new Date(opens);
  const c = new Date(closes);
  const day = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return o.toDateString() === c.toDateString()
    ? { date: day(o), time: `${time(o)} – ${time(c)}` }
    : { date: `${day(o)} – ${day(c)}`, time: `${time(o)} – ${time(c)}` };
}

function ScheduleSheet({ session, onClose }: { session: ExamSession; onClose: () => void }) {
  const [opensAt, setOpensAt] = useState(toLocalInput(session.opens_at));
  const [closesAt, setClosesAt] = useState(toLocalInput(session.closes_at));
  const update = useUpdateExamSession();
  const toast = useToast();
  const valid = !!opensAt && !!closesAt && new Date(closesAt) > new Date(opensAt);
  // The room is set from its own button; changing the time still warns if the room is already taken then.

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
      title="ตั้งเวลาสอบ"
      description={session.title}
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
        <FormSection>
          <Field label="เปิดสอบ" required>
            <Input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => {
                setOpensAt(e.target.value);
                const end = session.duration_minutes ? closeAfter(e.target.value, session.duration_minutes) : null;
                if (end) setClosesAt(end);
              }}
            />
          </Field>
          <Field label="ปิดสอบ" required>
            <Input type="datetime-local" value={closesAt} min={opensAt} disabled={!!session.duration_minutes} onChange={(e) => setClosesAt(e.target.value)} />
            {session.duration_minutes && <p className="text-xs text-muted-foreground">คำนวณจากเวลาทำ {session.duration_minutes} นาที</p>}
          </Field>
        </FormSection>
        <p className="text-xs text-muted-foreground">นักเรียนจะเห็นและเข้าสอบได้เมื่อกำหนดเวลาแล้ว</p>
      </form>
    </Sheet>
  );
}

const ownerName = (o: { first_name: string; last_name: string } | undefined) => (o ? `${o.first_name} ${o.last_name}` : "—");

/** canSeeAll: heads/approvers may switch to every room RLS shows them (their department; all for org-wide). A head with no teaching load has no "mine". */
function TeacherExams({ teacherId, canSeeAll }: { teacherId: string | null; canSeeAll: boolean }) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const [scope, setScope] = useState<"mine" | "all">(teacherId ? "mine" : "all");
  const mine = useMyExamSessions(teacherId);
  const all = useAllExamSessions(canSeeAll && scope === "all");
  const { data: sessions = [], isLoading } = scope === "all" && canSeeAll ? all : mine;
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ExamSession | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [deleting, setDeleting] = useState<ExamSession | null>(null);
  const colors = useSubjectColors([]);
  const { data: questionCounts } = useSessionQuestionCounts(sessions.map((s) => s.id));
  const deleteSession = useDeleteExamSession();
  const updateSession = useUpdateExamSession();
  const toast = useToast();
  const { data: sessionSets } = useSessionSets(sessions.map((s) => s.id));
  // Subjects come from the rooms themselves — rooms of other teachers aren't in my assignments.
  const { data: subjects = [] } = useSubjectsByIds([...new Set(sessions.flatMap((s) => sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]))]);
  const { data: owners = [] } = useProfilesByIds([...new Set(sessions.map((s) => s.teacher_id))]);
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  // Room of a session = classroom of its topic set's teaching assignment.
  const { data: roomSets = [] } = useTopicSetsByIds([...new Set(sessions.map((s) => s.topic_set_id))]);
  const assignmentOfSet = new Map(roomSets.map((t) => [t.id, t.teaching_assignment_id]));
  const { data: classroomOfAssignment } = useAssignmentClassrooms([...new Set([...assignmentOfSet.values()].filter((id): id is string => !!id))]);
  const { data: roomClassrooms = [] } = useClassroomsByIds([...new Set(classroomOfAssignment?.values() ?? [])]);
  const { data: roomGrades = [] } = useGradeLevelsByIds([...new Set(roomClassrooms.map((c) => c.grade_level_id))]);
  const roomOf = (topicSetId: string) => {
    const c = roomClassrooms.find((x) => x.id === classroomOfAssignment?.get(assignmentOfSet.get(topicSetId) ?? ""));
    const g = roomGrades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : null;
  };

  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // A room can only be switched on once time, questions and seating are set (switching off is always allowed).
  const { data: seatedIds } = useSessionsWithSeating(sessions.map((s) => s.id));
  const missingOf = (s: ExamSession) => [
    ...(s.opens_at && s.closes_at ? [] : ["เวลาสอบ"]),
    ...((questionCounts?.get(s.id) ?? 0) > 0 ? [] : ["ข้อสอบ"]),
    ...(seatedIds?.has(s.id) ? [] : ["ผังห้องสอบ"]),
  ];
  const enableSwitch = (s: ExamSession) => {
    const missing = s.is_enabled ? [] : missingOf(s);
    return (
      <span title={missing.length > 0 ? `ยังเปิดไม่ได้ ข้อมูลไม่ครบ: ${missing.join(", ")}` : undefined}>
        <Switch
          size="xs"
          label={`เปิดใช้งานห้องสอบ ${s.title}`}
          checked={s.is_enabled}
          disabled={updateSession.isPending || missing.length > 0 || !questionCounts || (sessions.length > 0 && !seatedIds)}
          onChange={(on) => updateSession.mutate({ id: s.id, is_enabled: on }, { onError: () => toast("บันทึกไม่สำเร็จ", "error") })}
        />
      </span>
    );
  };

  if (selected) {
    // Live row from the list so edits made inside the detail (time, settings) show without reopening.
    return <SessionDetail session={sessions.find((x) => x.id === selected.id) ?? selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="page-fill gap-3 pt-1">
      <div className="flex shrink-0 items-center justify-end gap-2">
        {canSeeAll && teacherId && (
          <Select className="ui-control-compact mr-auto h-8 px-2.5 pr-7 text-[13px] sm:w-64 sm:pr-8" aria-label="ขอบเขตห้องสอบ" value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")}>
            <option value="mine">ของฉัน</option>
            <option value="all">ทุกวิชา</option>
          </Select>
        )}
        <Button size="sm" className="ui-control-compact h-8 gap-1 px-2.5 sm:px-3" onClick={() => setCreating(true)} disabled={!teacherId || assignments.length === 0}>
          <Plus className="h-3 w-3" /> เปิดสอบใหม่
        </Button>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {isLoading ? <LoadingSpinner /> : sessions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีการเปิดสอบ" description="กด “เปิดสอบใหม่” เพื่อเลือกข้อสอบจากคลังมาจัดสอบ" />
        </div>
      ) : view === "cards" ? (
        <ul className="-mx-1 -mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
          {sessions.map((s) => {
            const roomSubjects = (sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]).map((id) => subjectById.get(id)).filter((x): x is Subject => !!x);
            const owner = ownerById.get(s.teacher_id);
            const room = roomOf(s.topic_set_id);
            return (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(s);
                    }
                  }}
                  className="cursor-pointer rounded-xl border border-border bg-card p-3 text-xs hover:bg-muted active:bg-muted"
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {s.exam_type && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", kindTone(s.exam_type))}>{s.exam_type}</span>}
                    {s.round && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", roundTone(s.round))}>ครั้งที่ {s.round}</span>}
                    {room && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span>}
                    {(questionCounts?.get(s.id) ?? 0) > 0 ? (
                      <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">มีข้อสอบ {questionCounts?.get(s.id)} ข้อ</span>
                    ) : (
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">ยังไม่มีข้อสอบ</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    {roomSubjects.map((x) => (
                      <div key={x.id} className="min-w-0">
                        <p className="truncate text-sm font-medium">{x.name_th}</p>
                        <p className="mt-1">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={ownerName(owner)} src={owner ? avatarUrl(owner) : null} className="h-6 w-6 text-[9px]" />
                      <span className="truncate">{ownerName(owner)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {enableSwitch(s)}
                      <Button
                        size="icon"
                        variant="outline"
                        className={ICON_BTN}
                        aria-label="ลบ"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(s);
                        }}
                      >
                        <TrashIcon className={ICON} />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="table-panel flex-1 rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[36rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">ประเภทห้องสอบ</th>
                  <th className="px-4 py-3">ครั้งที่</th>
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">ห้อง</th>
                  <th className="px-4 py-3">ข้อสอบ</th>
                  <th className="px-4 py-3">ครูผู้สอน</th>
                  <th className="px-4 py-3">เปิดใช้งาน</th>
                  <th className="w-14 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const roomSubjects = (sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]).map((id) => subjectById.get(id)).filter((x): x is Subject => !!x);
                  const owner = ownerById.get(s.teacher_id);
                  return (
                    <tr key={s.id} onClick={() => setSelected(s)} className="h-14 cursor-pointer border-t border-border first:border-t-0">
                      <td className="px-4 py-0 text-sm font-medium">{s.exam_type ?? "—"}</td>
                      <td className="px-4 py-0 tabular-nums">{s.round ?? "—"}</td>
                      <td className="px-4 py-2">
                        {roomSubjects.length === 0 ? (
                          "—"
                        ) : (
                          roomSubjects.map((x) => (
                            <div key={x.id} className="py-0.5">
                              <p className="truncate text-sm font-medium">{x.name_th}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">{x.code}</p>
                            </div>
                          ))
                        )}
                      </td>
                      <td className="px-4 py-0">
                        {roomOf(s.topic_set_id) ? (
                          <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", levelTone(roomOf(s.topic_set_id)!))}>{roomOf(s.topic_set_id)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-0 tabular-nums">
                        {(questionCounts?.get(s.id) ?? 0) > 0 ? (
                          <span className="font-medium text-success">{questionCounts?.get(s.id)} ข้อ</span>
                        ) : (
                          <span className="text-muted-foreground">ยังไม่มี</span>
                        )}
                      </td>
                      <td className="px-4 py-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={ownerName(owner)} src={owner ? avatarUrl(owner) : null} className="h-7 w-7 text-[10px]" />
                          <span className="truncate">{ownerName(owner)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-0" onClick={(e) => e.stopPropagation()}>
                        {enableSwitch(s)}
                      </td>
                      <td className="px-4 py-0 text-right">
                        <Button
                          size="icon"
                          variant="outline"
                          className={ICON_BTN}
                          aria-label="ลบ"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(s);
                          }}
                        >
                          <TrashIcon className={ICON} />
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

      {teacherId && <CreateSessionSheet open={creating} onOpenChange={setCreating} teacherId={teacherId} />}
      <ConfirmDialog
        open={!!deleting}
        title="ลบห้องสอบ?"
        description={deleting ? `ลบการเปิดสอบ "${deleting.title}" ข้อสอบที่เลือกไว้และผลสอบของรอบนี้จะถูกลบด้วย และกู้คืนไม่ได้` : undefined}
        pending={deleteSession.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteSession.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: () => toast("ลบไม่สำเร็จ", "error") })}
      />
    </div>
  );
}

function SwitchRow({ label, checked, onChange, compact }: { label: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm leading-5", compact ? "min-h-9" : "min-h-[3.25rem]")}>
      <span>{label}</span>
      <Switch size="xs" label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

function CreateSessionSheet({
  open,
  onOpenChange,
  teacherId,
  presetSets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner of the room — the set's teacher when a head creates it for them. */
  teacherId: string;
  /** Approved topic sets (one per subject, same room) a room is created for: subject, room and set are fixed. */
  presetSets?: ExamTopicSet[];
}) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const gradeLevelIds = [...new Set(subjects.map((s) => s.suggested_grade_level_id).filter((id): id is string => !!id))];
  const { data: gradeLevels = [] } = useGradeLevelsByIds(gradeLevelIds);
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));

  const [pickedSubjectId, setSubjectId] = useState("");
  const subjectId = pickedSubjectId;
  const [kind, setKind] = useState("");
  const [round, setRound] = useState("");
  const [duration, setDuration] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [syncGradebook, setSyncGradebook] = useState(false);
  const [pickedTopicSetId, setTopicSetId] = useState("");
  const topicSetId = pickedTopicSetId;

  const { data: mySets = [] } = useMyTopicSets(teacherId);
  const { data: usedSets } = useTopicSetsInUse(mySets.map((s) => s.id));
  // One room per approved set — sets a room already uses are not offered again.
  const approvedSets = mySets.filter(
    (s) => s.approval_status === "approved" && !s.no_exam && s.teaching_assignment_id && s.subject_id === subjectId && !!usedSets && !usedSets.has(s.id),
  );
  const { data: setTopics } = useTopicSetsTopics(approvedSets.map((s) => s.id));
  const setLabel = (set: ExamTopicSet) => {
    const names = (setTopics?.get(set.id) ?? []).map((t) => t.topic);
    const topics = names.length === 0 ? "ไม่ระบุหัวข้อ" : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
    return [examLabel(set), topics].filter(Boolean).join(" · ");
  };

  const classroomIds = [...new Set(assignments.map((a) => a.classroom_id))];
  const { data: classrooms = [] } = useClassroomsByIds(classroomIds);
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const { data: roomGrades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);

  const create = useCreateExamSession();
  const toast = useToast();

  function reset() {
    setSubjectId("");
    setKind("");
    setRound("");
    setDuration("");
    setMaxAttempts("1");
    setTopicSetId("");
  }

  // A set belongs to one room, so each session opens for exactly that room.
  const targets = presetSets ?? approvedSets.filter((x) => x.id === topicSetId);
  // Same shape for every room — "ประเภท [ครั้งที่ n] รหัสวิชา ชื่อวิชา ห้อง" — so many exams across subjects stay tellable apart.
  // A set made with its exam (type + round) fixes them; older sets still ask here.
  const kindOf = (set: ExamTopicSet) => set.exam_type ?? kind;
  const roundOf = (set: ExamTopicSet) => (set.exam_type ? set.round : round ? Number(round) : null);
  const askExam = targets.length === 0 || targets.some((t) => !t.exam_type);
  // One room covers every subject of the merged card; the name lists them all.
  const titleOf = (sets: ExamTopicSet[]) => {
    const first = sets[0];
    if (!first || !kindOf(first)) return "";
    const named = sets.map((set) => subjects.find((x) => x.id === set.subject_id)).filter((x): x is Subject => !!x);
    if (named.length !== sets.length) return "";
    const room = classroomById.get(assignments.find((a) => a.id === first.teaching_assignment_id)?.classroom_id ?? "");
    const roomGrade = roomGrades.find((g) => g.id === room?.grade_level_id);
    return [examLabel({ exam_type: kindOf(first), round: roundOf(first) }), named.map((x) => `${x.code} ${x.name_th}`).join(" · "), room && roomGrade ? `${gradeShortLabel(roomGrade.code)}/${room.name}` : ""].filter(Boolean).join(" ");
  };
  const canSave = targets.length > 0 && targets.every((x) => !!x.teaching_assignment_id) && !!titleOf(targets);

  function close() {
    reset();
    onOpenChange(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    try {
      const first = targets[0]!;
      await create.mutateAsync({
        subject_id: first.subject_id,
        teacher_id: teacherId,
        title: titleOf(targets), // stored as exam_sessions.title, never typed by hand
        exam_type: kindOf(first),
        round: roundOf(first),
        duration_minutes: duration ? Number(duration) : null,
        max_attempts: Number(maxAttempts) || 1,
        shuffle_questions: shuffleQuestions,
        shuffle_choices: shuffleChoices,
        sync_to_gradebook: syncGradebook,
        topic_set_id: first.id,
        sets: targets.map((x) => ({ topic_set_id: x.id, subject_id: x.subject_id })),
        teaching_assignment_ids: [...new Set(targets.map((x) => x.teaching_assignment_id!))],
        questions: [],
      });
      toast("สร้างห้องสอบแล้ว");
      close();
    } catch {
      toast("สร้างห้องสอบไม่สำเร็จ", "error");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title={presetSets ? "สร้างห้องสอบ" : "เปิดสอบใหม่"}
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
        {!presetSets && (
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
        {!presetSets && subjectId && (
          <Field label="ห้อง / ชุดหัวข้อการสอบ" required>
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
              value={topicSetId}
              onChange={(e) => setTopicSetId(e.target.value)}
            >
              <option value="">{approvedSets.length === 0 ? "ยังไม่มีชุดหัวข้อที่อนุมัติ" : "เลือกห้อง"}</option>
              {approvedSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {classroomById.get(assignments.find((a) => a.id === s.teaching_assignment_id)?.classroom_id ?? "")?.name ?? "—"} · {setLabel(s)}
                </option>
              ))}
            </select>
            {approvedSets.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">ส่งชุดหัวข้อขออนุมัติที่แท็บ “หัวข้อการสอบ” ก่อน</p>
            )}
          </Field>
        )}
        {askExam && (
        <FormSection>
          <Field label="ประเภทการสอบ" required>
            <Select
              value={kind}
              placeholder="เลือกประเภท"
              onChange={(e) => {
                setKind(e.target.value);
                          }}
            >
              {EXAM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ครั้งที่">
            <Input
              type="number"
              min="1"
              value={round}
              onChange={(e) => {
                setRound(e.target.value);
                          }}
              placeholder="เช่น 1 (ไม่ระบุได้)"
            />
          </Field>
        </FormSection>
        )}

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
  const { data: targetIds = [], isLoading: targetsLoading } = useExamSessionTargets(session.id);
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const eventCount = useSecurityEvents(session.id).data?.length ?? 0;
  const toast = useToast();
  const updateSession = useUpdateExamSession();
  const { data: seatedIds } = useSessionsWithSeating([session.id]);
  // Toggle appears once time, questions and seating are all set (or while on, so it can be switched off).
  const canEnable = session.is_enabled || (!!session.opens_at && !!session.closes_at && sessionQuestions.length > 0 && !!seatedIds?.has(session.id));

  const maxPoints = sessionQuestions.reduce((s, q) => s + q.points, 0);
  const submitted = attempts.filter((a) => a.status === "submitted");
  const { data: roomSets } = useSessionSets([session.id]);
  const sets = roomSets?.get(session.id) ?? [];
  const { data: subjects = [] } = useSubjectsByIds([...new Set([session.subject_id, ...sets.map((x) => x.subject_id)])]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const subjectList = [...new Set(sets.length > 0 ? sets.map((x) => x.subject_id) : [session.subject_id])]
    .map((id) => subjectById.get(id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const colors = useSubjectColors([]);
  const { data: assignments = [], isLoading: assignmentsLoading } = useMyTeachingAssignments(session.teacher_id);
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(assignments.filter((a) => targetIds.includes(a.id)).map((a) => a.classroom_id))]);
  const roomCountLabel = targetsLoading || assignmentsLoading ? "—" : new Set(assignments.filter((a) => targetIds.includes(a.id)).map((a) => a.classroom_id)).size;
  const { data: grades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const roomList = [...new Set(classrooms.flatMap((c) => { const g = grades.find((x) => x.id === c.grade_level_id); return g ? [`${gradeShortLabel(g.code)}/${c.name}`] : []; }))];
  const targets = assignments.filter((a) => targetIds.includes(a.id)).map((a) => ({ classroom_id: a.classroom_id, academic_year: a.academic_year }));
  const { data: roster = [], isLoading: rosterLoading } = useSessionRoster(targets);
  const { data: rosterNames } = useStudentNames(roster.map((r) => r.student_id));
  const { data: rosterAvatars } = useStudentAvatars(roster.map((r) => r.student_id));
  const { data: lockedRows = [] } = useLockedCodeStudents(session.id);
  const roomOfClassroom = new Map(classrooms.map((c) => { const g = grades.find((x) => x.id === c.grade_level_id); return [c.id, g ? `${gradeShortLabel(g.code)}/${c.name}` : c.name]; }));
  const lockedIds = new Set(lockedRows.map((l) => l.student_id));
  const rosterRows = roster
    .map((r) => {
      const mine = attempts.filter((a) => a.student_id === r.student_id);
      const latest = mine.reduce<ExamAttempt | null>((best, a) => (!best || a.attempt_no > best.attempt_no ? a : best), null);
      const best = mine.reduce<number | null>((m, a) => (a.status !== "submitted" || a.score == null ? m : m == null || a.score > m ? a.score : m), null);
      const status: "locked" | "submitted" | "in_progress" | "none" = lockedIds.has(r.student_id)
        ? "locked"
        : !latest
          ? "none"
          : latest.status === "submitted"
            ? "submitted"
            : "in_progress";
      const full = rosterNames?.get(r.student_id) ?? "นักเรียน";
      const [code, ...rest] = full.split(" ");
      return {
        student_id: r.student_id,
        room: roomOfClassroom.get(r.classroom_id) ?? "—",
        code: rest.length > 0 ? code : "",
        name: rest.length > 0 ? rest.join(" ") : full,
        full,
        status,
        best,
      };
    })
    .sort((a, b) => a.room.localeCompare(b.room, "th") || a.full.localeCompare(b.full, "th"));
  const count = (st: string) => rosterRows.filter((r) => r.status === st).length;
  const STATUS_LABEL = { locked: "ถูกล็อก", submitted: "ส่งแล้ว", in_progress: "กำลังทำ", none: "ยังไม่เข้าสอบ" } as const;
  const STATUS_CLASS = { locked: "text-destructive", submitted: "text-success", in_progress: "text-foreground", none: "text-muted-foreground" } as const;
  const STATUS_DOT = { locked: "bg-destructive", submitted: "bg-success", in_progress: "bg-primary", none: "bg-muted-foreground" } as const;
  const now = new Date();
  const status = !session.opens_at
    ? { label: "ฉบับร่าง", dot: "bg-primary" }
    : !session.is_enabled
      ? { label: "ยังไม่เปิดห้องสอบ", dot: "bg-muted-foreground" }
      : now < new Date(session.opens_at)
      ? { label: "ยังไม่เปิดสอบ", dot: "bg-primary" }
      : now <= new Date(session.closes_at!)
        ? { label: "กำลังเปิดสอบ", dot: "bg-success" }
        : { label: "ปิดสอบแล้ว", dot: "bg-muted-foreground" };

  return (
    <div className="page-fill gap-3 pt-1">
      <div className="toolbar shrink-0">
        <Button size="icon" variant="outline" className={ICON_BTN} onClick={onBack} aria-label="ย้อนกลับ">
          <ChevronBack className={ICON} />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-base font-semibold">
            {session.exam_type ? `${session.exam_type}${session.round ? ` ครั้งที่ ${session.round}` : ""}` : session.title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {subjectList.map((x) => (
              <span key={x.id} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span>
            ))}
            {roomList.map((r) => (
              <span key={r} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(r))}>{r}</span>
            ))}
          </p>
        </div>
        {eventCount > 0 && (
          <Button variant="outline" className="ui-control-compact h-7 sm:h-8" onClick={() => setEventsOpen(true)} aria-label="เหตุการณ์ผิดปกติ" title="เหตุการณ์ผิดปกติ">
            <AlertTriangle className={ICON} />
            <span className="tabular-nums">{eventCount}</span>
          </Button>
        )}
      </div>

      <div className="flex min-h-11 shrink-0 items-center gap-3 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs">
        <span className="flex items-center gap-2"><LayersIcon className="h-3.5 w-3.5 text-muted-foreground" />{roomCountLabel} ห้องเรียน</span>
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="flex items-center gap-2"><DocumentTextIcon className="h-3.5 w-3.5 text-muted-foreground" />{sessionQuestions.length} ข้อ</span>
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="flex items-center gap-2"><StarIcon className="h-3.5 w-3.5 text-muted-foreground" />เต็ม {maxPoints} คะแนน</span>
        <span className="ml-auto flex items-center gap-3">
          {canEnable && (
            <Switch
              size="xs"
              label="เปิดห้องสอบ"
              checked={session.is_enabled}
              disabled={updateSession.isPending}
              onChange={(on) => updateSession.mutate({ id: session.id, is_enabled: on }, { onError: () => toast("บันทึกไม่สำเร็จ", "error") })}
            />
          )}
          <span className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-[11px] font-medium">
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
        </span>
      </div>

      <SessionTopicsCard session={session} />

      {isLoading || rosterLoading ? <LoadingSpinner /> : rosterRows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีนักเรียนในห้องนี้" description="ตรวจสอบการลงทะเบียนนักเรียนของห้องเรียน" />
        </div>
      ) : (
        <div className="shrink-0 overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            aria-expanded={rosterOpen}
            onClick={() => setRosterOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
          >
            <span className="flex shrink-0 items-center gap-2">
              <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><PeopleIcon className="h-4 w-4" /></IconTile>
              <span className="font-semibold text-foreground">นักเรียน {rosterRows.length} คน</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right">
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-success/15 text-success">ส่งแล้ว {count("submitted")}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-warning/15 text-warning">กำลังทำ {count("in_progress")}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground">ยังไม่เข้าสอบ {count("none")}</span>
              {count("locked") > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15 text-destructive">ถูกล็อก {count("locked")}</span>}
            </span>
            <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", rosterOpen && "rotate-90")} />
          </button>
          <Collapse open={rosterOpen}>
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto border-t border-border bg-muted/40 p-2">
              {rosterRows.map((r) => (
                <li key={r.student_id} className="rounded-xl bg-card p-3.5 shadow-card">
                  <div className="flex items-start gap-3">
                    <Avatar name={r.name} src={rosterAvatars?.get(r.student_id) ?? null} className="h-11 w-11 text-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{r.name}</p>
                        <span className={cn("mt-0.5 flex shrink-0 items-center gap-1 text-[11px]", STATUS_CLASS[r.status])}>
                          <span className={cn("size-1.5 rounded-full", STATUS_DOT[r.status])} />
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        {r.code && <span className="text-xs tabular-nums text-muted-foreground">{r.code}</span>}
                        {r.room !== "—" && <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", levelTone(r.room))}>{r.room}</span>}
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{r.best != null ? `${r.best}/${maxPoints}` : "—"}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {submitted.length > 0 && (
              <p className="border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                ค่าเฉลี่ย: {(submitted.reduce((s, a) => s + (a.score ?? 0), 0) / submitted.length).toFixed(1)}/{maxPoints}
              </p>
            )}
          </Collapse>
        </div>
      )}
      <ScheduleCard session={session} />
      <ExamSettingsCard session={session} />
      {rosterRows.length > 0 && <ExamSeatingCard session={session} roomPicker={(room, usedRoomIds) => <ExamRoomField session={session} room={room} usedRoomIds={usedRoomIds} />} students={rosterRows.map((r) => ({ student_id: r.student_id, name: r.name, code: r.code ?? "", avatar: rosterAvatars?.get(r.student_id) ?? null }))} />}

      <SessionQuestionList session={session} sessionQuestions={sessionQuestions} />

      <div className="shrink-0 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={editingQuestions}
        onClick={() => setEditingQuestions((v) => !v)}
        className="flex w-full items-center justify-between min-h-11 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><Plus className="h-4 w-4" /></IconTile>
          เพิ่มข้อสอบ
        </span>
        <ChevronForward className={cn("h-3 w-3 text-muted-foreground transition-transform", editingQuestions && "rotate-90")} />
      </button>

      <AddSessionQuestionPanel session={session} open={editingQuestions} />
      </div>

      <SecurityPanel session={session} attempts={attempts} />
      <SecurityEventsSheet sessionId={session.id} open={eventsOpen} onOpenChange={setEventsOpen} />
    </div>
  );
}

/** Physical exam room (rooms table) of one room row, with its time-clash warning; sits at the top of that room's section in the seating card. */
function ExamRoomField({ session, room, usedRoomIds }: { session: ExamSession; room: ExamSessionRoom; usedRoomIds: string[] }) {
  const setRoom = useSetRoomPhysical();
  const toast = useToast();
  const { profile } = useAuth();
  const { data: rooms = [] } = useRooms(profile?.department_id ?? null);
  if (rooms.length === 0 && !room.room_id) return null;
  return (
    <>
      <Select
        aria-label="ห้องสอบ"
        className="ui-control-compact h-8 min-w-0 px-2.5 pr-7 text-[13px] sm:w-64"
        value={room.room_id ?? ""}
        onChange={(e) => setRoom.mutate({ sessionId: session.id, roomRowId: room.id, roomId: e.target.value || null }, { onError: () => toast("บันทึกไม่สำเร็จ", "error") })}
      >
        <option value="">ไม่ระบุห้องสอบ</option>
        {rooms
          // A room another row of this session already uses is not offered again.
          .filter((r) => (r.is_active && !usedRoomIds.includes(r.id)) || r.id === room.room_id)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </Select>
    </>
  );
}

/** หัวข้อการสอบ card: the approved topics the room's sets cover, grouped by lesson (read-only; subjects sharing a plan show once). */
function SessionTopicsCard({ session }: { session: ExamSession }) {
  const [open, setOpen] = useState(false);
  const { data: roomSets } = useSessionSets([session.id]);
  const { data: topicsBySet } = useTopicSetsTopics((roomSets?.get(session.id) ?? []).map((x) => x.topic_set_id));
  const topics = [...new Map([...(topicsBySet?.values() ?? [])].flat().map((t) => [t.topic_id, t] as const)).values()];
  const lessons = [...Map.groupBy(topics, (t) => t.lesson)];
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
      >
        <span className="flex items-center gap-2">
          <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><ListIcon className="h-4 w-4" /></IconTile>
          <span className="font-semibold text-foreground">หัวข้อการสอบ</span>
        </span>
        <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{topics.length} หัวข้อ</span>
        <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-card p-3">
          {lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีหัวข้อ</p>
          ) : (
            lessons.map(([lesson, items]) => (
              <section key={lesson}>
                <h3 className="mb-1.5 px-1 text-xs font-semibold">{lesson}</h3>
                <ul className="overflow-hidden rounded-xl bg-muted [&>*+*]:border-t [&>*+*]:border-border">
                  {items.map((t) => (
                    <li key={t.topic_id} className="px-4 py-2.5 text-xs">
                      {t.topic}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Collapse>
    </div>
  );
}

/** Room settings card: answer review + strict mode (migration 0132) with its exam code. */
function ExamSettingsCard({ session }: { session: ExamSession }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateExamSession();
  const toast = useToast();
  const { data: code } = useExamCode(open && session.strict_mode ? session.id : null);
  const onError = () => toast("บันทึกไม่สำเร็จ", "error");
  // Numbers are edited as text and saved on blur; an invalid entry snaps back to the saved value.
  const [duration, setDuration] = useState(session.duration_minutes?.toString() ?? "");
  const [attempts, setAttempts] = useState(session.max_attempts.toString());
  const [round, setRound] = useState(session.round?.toString() ?? "");
  useEffect(() => setRound(session.round?.toString() ?? ""), [session.round]);
  useEffect(() => setDuration(session.duration_minutes?.toString() ?? ""), [session.duration_minutes]);
  useEffect(() => setAttempts(session.max_attempts.toString()), [session.max_attempts]);
  // The title starts with "ประเภท [ครั้งที่ n]" (see the create dialog), so a type/round change swaps that prefix and keeps the rest.
  const saveExam = (exam_type: string, round: number | null) => {
    const old = examLabel(session);
    const rest = old && session.title.startsWith(old) ? session.title.slice(old.length).trimStart() : session.title;
    update.mutate({ id: session.id, exam_type, round, title: [examLabel({ exam_type, round }), rest].filter(Boolean).join(" ") }, { onError });
  };
  const saveRound = () => {
    const n = round.trim() === "" ? null : Math.floor(Number(round));
    if (n !== null && !(n >= 1)) return setRound(session.round?.toString() ?? "");
    if (n !== session.round && session.exam_type) saveExam(session.exam_type, n);
  };
  const saveDuration = () => {
    const n = duration.trim() === "" ? null : Math.floor(Number(duration));
    if (n !== null && !(n >= 1)) return setDuration(session.duration_minutes?.toString() ?? "");
    if (n !== session.duration_minutes) update.mutate({ id: session.id, duration_minutes: n }, { onError });
  };
  const saveAttempts = () => {
    const n = Math.floor(Number(attempts));
    if (!(n >= 1)) return setAttempts(session.max_attempts.toString());
    if (n !== session.max_attempts) update.mutate({ id: session.id, max_attempts: n }, { onError });
  };
  const summary = [session.strict_mode ? "โหมดสอบจริง" : "โหมดปกติ", session.review_released ? "เปิดเฉลย" : null].filter(Boolean).join(" · ");
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
      >
        <span className="flex shrink-0 items-center gap-2">
          <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><SettingsIcon className="h-4 w-4" /></IconTile>
          <span className="font-semibold text-foreground">ตั้งค่าห้องสอบ</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-right text-foreground">
          <span className="truncate rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">{summary}</span>
          <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </span>
      </button>
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-muted/40 p-3 [&_.text-sm]:text-xs [&_input]:!h-6 [&_input]:!text-xs">
          <FormSection>
            <Field label="ประเภทการสอบ">
              <Select value={session.exam_type ?? ""} placeholder="เลือกประเภท" onChange={(e) => e.target.value !== session.exam_type && saveExam(e.target.value, session.round)}>
                {(session.exam_type && !EXAM_KINDS.includes(session.exam_type) ? [session.exam_type, ...EXAM_KINDS] : EXAM_KINDS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ครั้งที่">
              <Input type="number" min="1" value={round} onChange={(e) => setRound(e.target.value)} onBlur={saveRound} placeholder="ไม่ระบุ" disabled={!session.exam_type} />
            </Field>
            <Field label="เวลาทำ (นาที)">
              <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} onBlur={saveDuration} placeholder="ไม่จำกัด" />
            </Field>
            <Field label="จำนวนครั้งที่สอบได้">
              <Input type="number" min="1" value={attempts} onChange={(e) => setAttempts(e.target.value)} onBlur={saveAttempts} />
            </Field>
          </FormSection>
          <FormSection>
            <SwitchRow compact label="สุ่มลำดับข้อ" checked={session.shuffle_questions} onChange={(v) => update.mutate({ id: session.id, shuffle_questions: v }, { onError })} />
            <SwitchRow compact label="สุ่มลำดับตัวเลือก" checked={session.shuffle_choices} onChange={(v) => update.mutate({ id: session.id, shuffle_choices: v }, { onError })} />
            <SwitchRow compact label="บันทึกคะแนนเข้าสมุดคะแนน" checked={session.sync_to_gradebook} onChange={(v) => update.mutate({ id: session.id, sync_to_gradebook: v }, { onError })} />
            <SwitchRow compact label="เปิดเฉลยให้นักเรียนดู" checked={session.review_released} onChange={(v) => update.mutate({ id: session.id, review_released: v }, { onError })} />
            <SwitchRow compact label="โหมดสอบจริง (รหัสสอบ + ล็อกเครื่องเดียว)" checked={session.strict_mode} onChange={(v) => update.mutate({ id: session.id, strict_mode: v }, { onError })} />
            {session.strict_mode && (
              <div className="flex min-h-9 items-center justify-between gap-4 text-sm leading-5">
                <span>รหัสสอบ (แจ้งในห้องสอบเท่านั้น)</span>
                <span className="font-mono text-base font-semibold tracking-widest">{code ?? "······"}</span>
              </div>
            )}
          </FormSection>
        </div>
      </Collapse>
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
  const approve = useApproveTakeover();
  const unlock = useUnlockExamCode();
  const toast = useToast();
  const { data: locked = [] } = useLockedCodeStudents(session.id);

  const pending = attempts.filter((a) => a.status === "in_progress" && a.takeover_session);
  const names = useStudentNames([
    ...pending.map((a) => a.student_id),
    ...locked.map((l) => l.student_id),
  ]).data;
  const nameOf = (id: string | null) => (id ? (names?.get(id) ?? "นักเรียน") : "—");
  const onError = () => toast("ทำรายการไม่สำเร็จ", "error");

  if (pending.length + locked.length === 0) return null;
  return (
    <div className="shrink-0 space-y-2 rounded-lg border border-border px-3 py-2 text-xs">
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
    </div>
  );
}

/** One bank question as in คลังข้อสอบ: number, prompt, badges, choices with the correct ones ticked. */
const CHOICE_LETTERS = ["ก", "ข", "ค", "ง", "จ", "ฉ"];

function QuestionBody({ q, i }: { q: ExamQuestionWithChoices; i: number }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums text-muted-foreground">{i + 1}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-semibold text-foreground [&_*]:font-semibold">
          <QuestionPromptView value={q.prompt_json} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("rounded-full px-2 py-0.5 font-medium", DIFFICULTY_BADGE_CLASS[q.difficulty])}>{DIFFICULTY_LABEL[q.difficulty]}</span>
          {q.topic && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{q.topic}</span>}
          <span className="tabular-nums">{q.points} คะแนน</span>
        </div>
        {q.question_type === "short_answer" ? (
          <p className="rounded-md bg-[hsl(var(--success)/0.15)] px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">เฉลย </span>
            <span className="font-medium text-success">{q.correct_answer}</span>
          </p>
        ) : (
          <ul className="space-y-1">
            {q.choices.map((c, ci) => (
              <li key={c.id} className={cn("flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground", c.is_correct && "bg-[hsl(var(--success)/0.15)] font-medium text-success")}>
                <span className="w-4 shrink-0 text-center text-muted-foreground">{CHOICE_LETTERS[ci] ?? ci + 1}</span>
                <span className="min-w-0 flex-1"><QuestionPromptView value={c.label_json} /></span>
                {c.is_correct && <CheckmarkCircleIcon className="h-4 w-4 shrink-0" aria-label="คำตอบที่ถูก" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Collapsible card listing the questions already in the room. */
function SessionQuestionList({ session, sessionQuestions }: { session: ExamSession; sessionQuestions: ExamSessionQuestionRow[] }) {
  const [open, setOpen] = useState(false);
  // Start fetching on hover/focus so the data is already there when the card opens.
  const [warm, setWarm] = useState(false);
  const [editingQ, setEditingQ] = useState<ExamQuestionWithChoices | null>(null);
  const { profile } = useAuth();
  const remove = useRemoveSessionQuestion();
  const toast = useToast();
  const fetchBank = warm || open;
  const { data: roomSets } = useSessionSets(fetchBank ? [session.id] : []);
  const subjectIds = (roomSets?.get(session.id) ?? []).map((x) => x.subject_id);
  const { data: bank = [] } = useExamQuestionsOf(fetchBank ? (subjectIds.length > 0 ? subjectIds : [session.subject_id]) : []);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const chosen = sessionQuestions.map((r) => byId.get(r.question_id)).filter((q): q is ExamQuestionWithChoices => !!q);
  // Every row is a stack of rich-text/math editors; mounting 20 at once stalls the opening animation. Mount a few
  // after the card starts opening, then the rest in small batches. Once mounted they stay, so reopening is instant.
  const [mounted, setMounted] = useState(0);
  useEffect(() => {
    if (!open || mounted >= chosen.length) return;
    const t = setTimeout(() => setMounted((n) => Math.min(chosen.length, n + (n === 0 ? 3 : 5))), mounted === 0 ? 150 : 40);
    return () => clearTimeout(t);
  }, [open, mounted, chosen.length]);
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={open} onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between min-h-11 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><DocumentTextIcon className="h-4 w-4" /></IconTile>
          รายการข้อสอบ
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{sessionQuestions.length} ข้อ</span>
          {sessionQuestions.length === 0 && <span className="flex shrink-0 text-destructive" role="img" aria-label="ยังไม่ได้ตั้งค่า"><AlertTriangle className="h-4 w-4" /></span>}
          <ChevronForward className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-90")} />
        </span>
      </button>
      <Collapse open={open}>
        <div className="divide-y divide-border border-t border-border bg-card">
          {sessionQuestions.length === 0 && <p className="p-3 text-xs text-muted-foreground">ยังไม่มีข้อสอบในห้องนี้</p>}
          {chosen.slice(0, mounted).map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 p-3 [contain-intrinsic-size:auto_260px] [content-visibility:auto]">
              <div className="min-w-0 flex-1"><QuestionBody q={q} i={i} /></div>
              <div className="flex shrink-0 items-center gap-1.5">
              <Button size="icon" variant="outline" className={ICON_BTN} aria-label="แก้ไขข้อสอบ" title="แก้ไขข้อสอบ" onClick={() => setEditingQ(q)}>
                <PencilIcon className={ICON} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className={ICON_BTN}
                aria-label="ลบข้อสอบออกจากห้อง"
                title="ลบข้อสอบออกจากห้อง"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm("ลบข้อสอบข้อนี้ออกจากห้อง?")) remove.mutate({ sessionId: session.id, questionId: q.id }, { onError: () => toast("ลบข้อสอบไม่สำเร็จ", "error") });
                }}
              >
                <TrashIcon className={ICON} />
              </Button>
              </div>
            </div>
          ))}
        </div>
      </Collapse>
      {/* Keyed so the form remounts with the picked question; its state is seeded once on mount. */}
      <QuestionSheet
        key={editingQ?.id ?? "new"}
        open={!!editingQ}
        onOpenChange={(v) => !v && setEditingQ(null)}
        subjectId={editingQ?.subject_id ?? null}
        planTopicId={editingQ?.plan_topic_id ?? null}
        teacherId={profile?.id ?? session.teacher_id}
        question={editingQ}
      />
    </div>
  );
}

/** Anti-impersonation event trail for one room (migration 0132). */
function SecurityEventsSheet({ sessionId, open, onOpenChange }: { sessionId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: events = [] } = useSecurityEvents(sessionId);
  const names = useStudentNames(events.flatMap((e) => (e.student_id ? [e.student_id] : []))).data;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="เหตุการณ์ผิดปกติ" description={`${events.length} รายการ`}>
      <ul className="space-y-3 text-sm">
        {events.map((e) => (
          <li key={e.id}>
            <p>{e.student_id ? (names?.get(e.student_id) ?? "นักเรียน") : "—"} · {SECURITY_EVENT_LABEL[e.event_type]}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(e.at).toLocaleString("th-TH")}
              {e.device && ` · ${e.device}`}
              {e.ip && ` · ${e.ip}`}
            </p>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** "เพิ่มข้อสอบ": a new question written here goes straight into the room. */
function AddSessionQuestionPanel({ session, open }: { session: ExamSession; open: boolean }) {
  const { profile } = useAuth();
  const add = useAddSessionQuestion();
  const toast = useToast();
  // The DB only accepts room questions tagged with a topic of the room's sets (check_exam_session_question_topic).
  const { data: roomSets } = useSessionSets([session.id]);
  const { data: topicsBySet } = useTopicSetsTopics((roomSets?.get(session.id) ?? []).map((x) => x.topic_set_id));
  const topics = [...new Map([...(topicsBySet?.values() ?? [])].flat().map((t) => [t.topic_id, t])).values()];
  const [pickedLesson, setPickedLesson] = useState("");
  const [picked, setPicked] = useState("");
  const lessons = [...new Set(topics.map((t) => t.lesson))];
  const lesson = lessons.includes(pickedLesson) ? pickedLesson : "";
  const lessonTopics = topics.filter((t) => t.lesson === lesson);
  // Nothing is preselected when there is a choice; a lone topic is used as is.
  const topicId = lessonTopics.some((t) => t.topic_id === picked) ? picked : topics.length === 1 ? (topics[0]?.topic_id ?? null) : null;
  const form = useQuestionForm({
    subjectId: session.subject_id,
    planTopicId: topicId,
    teacherId: profile?.id ?? session.teacher_id,
    question: null,
    onSaved: (questionId) => add.mutate({ sessionId: session.id, questionId }, { onError: () => toast("เพิ่มข้อสอบเข้าห้องไม่สำเร็จ", "error") }),
  });
  return (
    <Collapse open={open}>
      <div className="border-t border-border bg-card p-3">
        {topics.length > 1 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Field label="บทเรียน">
              <Select value={lesson} placeholder="เลือกบทเรียน" onChange={(e) => setPickedLesson(e.target.value)}>
                {lessons.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="หัวข้อ">
              <Select value={topicId ?? ""} placeholder="เลือกหัวข้อ" disabled={!lesson} onChange={(e) => setPicked(e.target.value)}>
                {lessonTopics.map((t) => (
                  <option key={t.topic_id} value={t.topic_id}>{t.topic}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {topicId ? <QuestionForm form={form} hideTopic /> : <p className="text-xs text-muted-foreground">เลือกบทเรียนและหัวข้อก่อนเพิ่มข้อสอบ</p>}
      </div>
    </Collapse>
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
  return useMemo(() => new Set(exams.filter((e) => isExamOpen(e)).flatMap((e) => e.subject_ids)), [exams]);
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
  const { data: subjects = [] } = useSubjectsByIds(subjectCode ? [...new Set(allExams.flatMap((e) => e.subject_ids))] : []);
  const subjectId = subjects.find((s) => s.code === subjectCode)?.id;
  const exams = subjectCode ? allExams.filter((e) => !!subjectId && e.subject_ids.includes(subjectId)) : allExams;
  const clearFilter = subjectCode && (
    <button type="button" onClick={() => setParams({})} className="tappable mb-2 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium">
      {subjectCode} ✕ ดูทั้งหมด
    </button>
  );

  if (isLoading) return <LoadingSpinner />;
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

  if (!attempt) return <LoadingSpinner />;

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
    return <LoadingSpinner />;
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

  if (!data) return <LoadingSpinner />;

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
