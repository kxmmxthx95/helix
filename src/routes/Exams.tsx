import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ViewToggle, defaultView } from "@/components/ViewToggle";
import { RoomsView } from "@/components/ExamRoomsView";
import { ChipFilter, FilterButton, FilterSheet, SegmentedFilter } from "@/components/FilterSheet";
import { LEAVE_WINDOW_MS } from "@/lib/examLeaves";
import { dayKey, isLive, roomClashes } from "@/lib/examRooms";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth, usePauseIdleSignOut } from "@/auth/AuthProvider";
import { preloadQuestionPromptView, QuestionPromptView } from "@/components/editor/LazyQuestionPromptView";
import { AlertTriangle, BookIcon, CalendarIcon, ChevronForward, SettingsIcon, CheckmarkCircleIcon, ChevronBack, ClipboardIcon, DocumentTextIcon, LayersIcon, ListIcon, LocationIcon, PrintIcon, Search, TimeIcon, PencilIcon, PeopleIcon, StarIcon, TrashIcon } from "@/components/icons";
import { AnswerSheetCard } from "@/components/AnswerSheetCard";
import { AnswerSheetScanCard } from "@/components/AnswerSheetScanCard";
import { Collapse } from "@/components/Collapse";
import { DetailAddRow, DetailGroup, DetailRow } from "@/components/DetailRow";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { COL_TONES, ExamSeatingCard, seatLabel } from "@/components/ExamSeatingCard";
import { useMyExamSeats, useSeatTemplates, useSessionRoomIds, useSessionRooms, useSessionSeats, useSeatingStatus, useSessionsWithSeating, useSetRoomPhysical, useSpecialSeats } from "@/hooks/useExamSeating";
import { GlyphTile, IconTile } from "@/components/IconTile";
import { Sheet, usePhone } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Field, FormSection, Input, PageSpinner, Select, Switch } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { useProfilesByIds } from "@/hooks/usePractice";
import { useClassroomsByIds, useExamQuestionsOf, useGradeLevelsByIds, useSubjectsByIds, type ExamQuestionWithChoices } from "@/hooks/useExamBank";
import {
  usePracticeCheck,
  usePracticeCounts,
  usePracticeQuestions,
  useRemoveSessionQuestion,
  useAttemptAnswers,
  useAttemptPaper,
  useAttemptQuestions,
  useExamReviewKey,
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
  useSessionLeaveCounts,
  useTopicSetQueue,
  useMyAttempts,
  useMyCurrentClassroom,
  useAllExamSessions,
  useMyExamSessions,
  useSaveAnswers,
  useSecurityEvents,
  useSessionAttempts,
  useSessionGrants,
  useGrantRetake,
  useSessionQuestionCounts,
  useSessionRoster,
  useStudentAvatars,
  useSessionSets,
  useStartOrResumeAttempt,
  useStudentNames,
  useSubmitAttempt,
  useTopicSetsByIds,
  useTopicSetsTopics,
  useSetTopicSetTopics,
  useSetManualScore,
  attemptScoreTime,
  useUnlockExamCode,
  useUpdateExamSession,
  useVerifyExamCode,
  type AvailableExam,
  type ExamSessionQuestionRow,
  type AnswerDraft,
} from "@/hooks/useExams";
import { useSubjectsLinkedLessons } from "@/hooks/usePlan";
import { useRooms } from "@/hooks/useSchedule";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { topArea } from "@/lib/subjectColor";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { DIFFICULTY_BADGE_CLASS, DIFFICULTY_LABEL } from "@/lib/examDifficulty";
import type { PracticeCheckResult, ExamAttempt, ExamSecurityEvent, ExamSecurityEventType, ExamSession, ExamSessionRoom, ExamTopicSet, Student, Subject } from "@/lib/database.types";
import { EXAM_KINDS, examLabel, kindTone, roundTone } from "@/lib/examKinds";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { canApproveExams } from "@/lib/roles";
import { ICON, ICON_BTN } from "@/lib/iconButton";
import { cn } from "@/lib/utils";
import { ExamPaper, type PaperQuestion } from "@/components/ExamPaper";
import { ExamRehearsal } from "@/routes/ExamRehearsal";

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

type StaffTab = "rooms" | "schedule" | "topics" | "list" | "approve";

// The question editor (rich text, formulas) is ~480 KB gzip: load it only when a teacher edits or adds a question.
const AddSessionQuestionPanel = lazy(() => import("@/components/AddSessionQuestionPanel"));
const QuestionSheet = lazy(() => import("@/routes/ExamBank").then((m) => ({ default: m.QuestionSheet })));

// The three approval-related tabs load when their tab is opened.
const ExamTopicsTab = lazy(() => import("@/routes/ExamApproval").then((m) => ({ default: m.ExamTopicsTab })));
const ExamSubmissionsTab = lazy(() => import("@/routes/ExamApproval").then((m) => ({ default: m.ExamSubmissionsTab })));
const ExamApprovalTab = lazy(() => import("@/routes/ExamApproval").then((m) => ({ default: m.ExamApprovalTab })));

/** Number of topic sets waiting for this approver (badge on the อนุมัติสอบ tab); lives here so the tab code itself can stay lazy. */
function useExamApprovalPendingCount(enabled: boolean) {
  const { profile } = useAuth();
  const { data = [] } = useTopicSetQueue(enabled, profile?.id ?? null);
  return data.filter((s) => s.approval_status === "pending").length;
}

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
          <Suspense fallback={<PageSpinner />}>
            {tab === "topics" && teacherId && <ExamTopicsTab teacherId={teacherId} canSeeAll={canApprove} />}
            {tab === "list" && teacherId && <ExamSubmissionsTab teacherId={teacherId} onCreateRoom={setRoomFor} />}
            {tab === "approve" && canApprove && <ExamApprovalTab onCreateRoom={setRoomFor} />}
          </Suspense>
        </div>
      )}
      {roomFor && <CreateSessionSheet open onOpenChange={() => setRoomFor(null)} teacherId={roomFor[0]!.teacher_id} presetSets={roomFor} />}
    </div>
  );
}

/** Exam timetable: scheduled rooms by opening day, plus rooms still waiting for a time. Tap a row to set/change its window. */
function ExamSchedule({ teacherId, canSeeAll }: { teacherId: string; canSeeAll: boolean }) {
  const defaultScope = canSeeAll ? "all" : "mine";
  const [scope, setScope] = useState<"mine" | "all">(defaultScope);
  const mine = useMyExamSessions(teacherId);
  const all = useAllExamSessions(canSeeAll && scope === "all");
  const { data: sessions = [], isLoading } = scope === "all" && canSeeAll ? all : mine;
  const { data: sessionSets, isLoading: setsLoading } = useSessionSets(sessions.map((s) => s.id));
  const { data: subjects = [], isLoading: subjectsLoading } = useSubjectsByIds([...new Set([...sessions.map((s) => s.subject_id), ...[...(sessionSets?.values() ?? [])].flat().map((x) => x.subject_id)])]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: owners = [], isLoading: ownersLoading } = useProfilesByIds([...new Set(sessions.map((s) => s.teacher_id))]);
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const [editing, setEditing] = useState<ExamSession | null>(null);
  const [view, setView] = useState<"cards" | "table" | "rooms">(defaultView);
  // Phones get cards or the room grid (table is desktop-only); the phone switch writes the same `view` state.
  const phone = usePhone();
  const mode = phone && view === "table" ? "cards" : view;
  const [when, setWhen] = useState<"active" | "past" | "all">("active");
  const [printing, setPrinting] = useState(false);
  const [fGrade, setFGrade] = useState("");
  const [fRoom, setFRoom] = useState("");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterCount = [canSeeAll && scope !== defaultScope, when !== "active", fGrade, fRoom].filter(Boolean).length;
  const colors = useSubjectColors([]);
  const { data: seatStatus } = useSeatingStatus(sessions.map((s) => s.id));
  // Physical rooms where each exam is sat (exam_session_rooms → rooms), first room first.
  const { profile: scheduleMe } = useAuth();
  const { data: venues = [], isLoading: venuesLoading } = useRooms(scheduleMe?.department_id ?? null);
  const { data: roomIdsOf, isLoading: roomIdsLoading } = useSessionRoomIds(sessions.map((s) => s.id));
  const venueOf = (s: ExamSession) => {
    const names = (roomIdsOf?.get(s.id) ?? []).flatMap((id) => venues.find((v) => v.id === id)?.name ?? []);
    return names.length > 0 ? names.join(", ") : undefined;
  };
  // subject → room, via the topic set each session subject was created from (works for other teachers' rooms too).
  const { data: roomSets = [], isLoading: roomSetsLoading } = useTopicSetsByIds([...new Set([...(sessionSets?.values() ?? [])].flat().map((x) => x.topic_set_id).filter(Boolean))]);
  const { data: classroomOfAssignment, isLoading: assignLoading } = useAssignmentClassrooms([...new Set(roomSets.map((t) => t.teaching_assignment_id).filter((id): id is string => !!id))]);
  const { data: classrooms = [], isLoading: classroomsLoading } = useClassroomsByIds([...new Set(classroomOfAssignment?.values() ?? [])]);
  const { data: grades = [], isLoading: gradesLoading } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const detailsLoading = setsLoading || subjectsLoading || ownersLoading || venuesLoading || roomIdsLoading || roomSetsLoading || assignLoading || classroomsLoading || gradesLoading;
  const roomOfSet = (setId: string) => {
    const c = classrooms.find((x) => x.id === classroomOfAssignment?.get(roomSets.find((t) => t.id === setId)?.teaching_assignment_id ?? ""));
    const g = grades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : null;
  };
  // A session is in a class room (ชั้น/ห้อง) through the topic set of each of its subjects.
  const classroomIdsOf = (s: ExamSession) => (sessionSets?.get(s.id) ?? []).flatMap((x) => classroomOfAssignment?.get(roomSets.find((t) => t.id === x.topic_set_id)?.teaching_assignment_id ?? "") ?? []);
  const gradeOptions = grades.slice().sort((a, b) => a.code.localeCompare(b.code));
  const roomOptions = classrooms
    .filter((c) => !fGrade || c.grade_level_id === fGrade)
    .map((c) => ({ id: c.id, label: `${gradeShortLabel(grades.find((g) => g.id === c.grade_level_id)?.code ?? "")}/${c.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  // Rooms without an exam time are not listed here; set the time from the room settings.
  // Re-render every 30 s so a live dot appears/disappears at the exact minute without a refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  const liveDot = (s: ExamSession) => isLive(s, now) && <span title="กำลังสอบ" className="mr-1.5 inline-block size-2 shrink-0 animate-pulse rounded-full bg-success" />;
  const shown = sessions.filter((s) => {
    if (!s.opens_at) return false;
    if (when === "all") return true;
    const ended = !!s.closes_at && new Date(s.closes_at).getTime() < now;
    return when === "past" ? ended : !ended;
  })
    .filter((s) => !fRoom || classroomIdsOf(s).includes(fRoom))
    .filter((s) => !fGrade || classroomIdsOf(s).some((id) => classrooms.find((c) => c.id === id)?.grade_level_id === fGrade))
    .filter((s) => {
      // Search: subject name/code, exam type or title, room, venue, teacher.
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      const texts = [
        s.title,
        s.exam_type,
        venueOf(s),
        ownerName(ownerById.get(s.teacher_id)),
        ...(sessionSets?.get(s.id) ?? []).flatMap((x) => roomOfSet(x.topic_set_id) ?? []),
        ...subjectsOf(s).flatMap((x) => [x.name_th, x.code]),
      ];
      return texts.some((t) => t?.toLowerCase().includes(needle));
    });

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ยังไม่มีตารางสอบ" description="สร้างห้องสอบจากชุดหัวข้อที่อนุมัติแล้ว แล้วมาจัดเวลาที่นี่" />
      </div>
    );
  }
  const subjectsOf = (s: ExamSession) => [...new Set(sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id])].flatMap((id) => subjectById.get(id) ?? []);
  const setIdOf = (s: ExamSession, subjectId: string) => sessionSets?.get(s.id)?.find((x) => x.subject_id === subjectId)?.topic_set_id ?? "";
  const seatBadge = (s: ExamSession) => {
    const st = seatStatus?.get(s.id);
    if (!st) return null;
    const tone = { bad: "bg-destructive/15 text-destructive", warn: "bg-warning/15 text-warning", ok: "bg-success/15 text-success" }[st.tone];
    return (
      <span title={st.problems.join(", ") || undefined} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", tone)}>
        {st.label}{st.problems.length > 1 && st.tone === "bad" ? ` +${st.problems.length - 1}` : ""}
      </span>
    );
  };
  const row = (s: ExamSession) => {
    const sets = sessionSets?.get(s.id) ?? [{ subject_id: s.subject_id, topic_set_id: "" }];
    const owner = ownerById.get(s.teacher_id);
    const venue = venueOf(s);
    // Only two things carry a colour: the seating status (top right) and each subject's class. The rest is plain text, so the badges don't line up in a row.
    return (
      <div
        key={s.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(s)}
        onKeyDown={(e) => e.key === "Enter" && setEditing(s)}
        className={cn("cursor-pointer rounded-xl border bg-card p-3.5 text-xs hover:bg-muted active:bg-muted", isLive(s, now) ? "border-success/50" : "border-border")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-muted-foreground">{new Date(s.opens_at!).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
            <p className="mt-0.5 flex items-center text-base font-semibold tabular-nums leading-6">{liveDot(s)}{fmtTime(s.opens_at!)}{s.closes_at ? ` – ${fmtTime(s.closes_at)}` : ""}</p>
            <p className="mt-0.5 truncate text-muted-foreground">
              {s.exam_type ? <><span className="font-medium text-foreground">{s.exam_type}</span>{s.round ? ` · ครั้งที่ ${s.round}` : ""}</> : s.title}
            </p>
          </div>
          <div className="shrink-0">{seatBadge(s)}</div>
        </div>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {sets.map((x) => {
            const subject = subjectById.get(x.subject_id);
            const room = roomOfSet(x.topic_set_id);
            return subject ? (
              <li key={x.subject_id + x.topic_set_id} className="flex items-center gap-2.5 py-2">
                <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(subject.learning_area_id))}>{subject.code}</span>
                <p className="min-w-0 flex-1 text-sm font-medium leading-5">{subject.name_th}</p>
                {room && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span>}
              </li>
            ) : null;
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={ownerName(owner)} src={owner ? avatarUrl(owner) : null} className="h-6 w-6 shrink-0 text-[9px]" />
            <span className="truncate font-medium text-foreground">{ownerName(owner)}</span>
          </div>
          {venue && (
            <span className="flex min-w-0 max-w-[55%] items-center gap-1 text-foreground" title="ห้องสอบ">
              <LocationIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium tabular-nums">{venue}</span>
            </span>
          )}
        </div>
      </div>
    );
  };
  const scheduled = shown.slice().sort((a, b) => a.opens_at!.localeCompare(b.opens_at!));
  const clashingIds = roomClashes(scheduled, roomIdsOf);
  // Every scheduled round in scope (not just the filtered ones): the print drawer has its own day/grade/room choices.
  const printItems: ScheduleItem[] = sessions
    .filter((s) => !!s.opens_at)
    .map((s) => ({
      id: s.id,
      opens: new Date(s.opens_at!),
      closes: s.closes_at ? new Date(s.closes_at) : null,
      subjects: subjectsOf(s),
      rooms: [...new Set((sessionSets?.get(s.id) ?? []).flatMap((x) => roomOfSet(x.topic_set_id) ?? []))],
      classroomIds: classroomIdsOf(s),
      venue: venueOf(s),
      exam: examLabel(s) ?? "",
    }));
  const printGrades = gradeOptions.map((g) => ({ id: g.id, label: gradeShortLabel(g.code) }));
  const printRooms = classrooms.map((c) => ({ id: c.id, gradeId: c.grade_level_id, label: `${gradeShortLabel(grades.find((g) => g.id === c.grade_level_id)?.code ?? "")}/${c.name}` }));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="กรองตารางสอบ"
        activeCount={filterCount}
        resultText={`ดู ${shown.length} รายการ`}
        onClear={() => { setScope(defaultScope); setWhen("active"); setFGrade(""); setFRoom(""); }}
      >
        {canSeeAll && <SegmentedFilter label="ขอบเขต" value={scope} onChange={(v) => setScope(v as "mine" | "all")} options={[["mine", "ของฉัน"], ["all", "ทุกวิชา"]]} />}
        <SegmentedFilter label="ช่วงเวลาสอบ" value={when} onChange={(v) => setWhen(v as typeof when)} options={[["active", "ยังไม่สิ้นสุด"], ["past", "ผ่านไปแล้ว"], ["all", "ทั้งหมด"]]} />
        <ChipFilter label="ชั้น" value={fGrade} onChange={(v) => { setFGrade(v); setFRoom(""); }} options={gradeOptions.map((g) => [g.id, gradeShortLabel(g.code)])} />
        <ChipFilter label="ห้อง" value={fRoom} onChange={setFRoom} options={roomOptions.map((r) => [r.id, r.label])} />
      </FilterSheet>
      {printing && <PrintScheduleDrawer items={printItems} grades={printGrades} rooms={printRooms} onClose={() => setPrinting(false)} />}
      <div className="flex shrink-0 items-center justify-end gap-2">
        <div className="relative min-w-0 flex-1 lg:flex-[1.3]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาวิชา ครู ห้อง" aria-label="ค้นหาตารางสอบ" className="ui-control-compact h-8 pl-8 text-[13px]" />
        </div>
        <FilterButton count={filterCount} label="กรองตารางสอบ" onClick={() => setFilterOpen(true)} />
        <div className="hidden lg:contents">
          {canSeeAll && (
            <Select className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:pr-8 min-w-0 flex-1" aria-label="ขอบเขตตารางสอบ" value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")}>
              <option value="mine">ของฉัน</option>
              <option value="all">ทุกวิชา</option>
            </Select>
          )}
          <Select className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:pr-8 min-w-0 flex-1" aria-label="ช่วงเวลาสอบ" value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
            <option value="active">ยังไม่สิ้นสุด</option>
            <option value="past">ผ่านไปแล้ว</option>
            <option value="all">ทั้งหมด</option>
          </Select>
          <Select className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:pr-8 min-w-0 flex-1" aria-label="ชั้น" value={fGrade} onChange={(e) => { setFGrade(e.target.value); setFRoom(""); }}>
            <option value="">ทุกชั้น</option>
            {gradeOptions.map((g) => <option key={g.id} value={g.id}>{gradeShortLabel(g.code)}</option>)}
          </Select>
          <Select className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:pr-8 min-w-0 flex-1" aria-label="ห้อง" value={fRoom} onChange={(e) => setFRoom(e.target.value)}>
            <option value="">ทุกห้อง</option>
            {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </div>
        <Button size="sm" variant="outline" className="ui-control-compact h-8 gap-1 px-2.5" aria-label="พิมพ์ตารางสอบ" disabled={isLoading || detailsLoading} onClick={() => setPrinting(true)}>
          <PrintIcon className="h-3.5 w-3.5" />
        </Button>
        <ViewToggle value={view} onChange={setView} views={["cards", "table", "rooms"]} className="hidden lg:flex" />
        <ViewToggle value={mode === "rooms" ? "rooms" : "cards"} onChange={setView} views={["cards", "rooms"]} className="flex lg:hidden" />
      </div>
      {isLoading || detailsLoading ? <PageSpinner /> : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={when === "past" ? "ยังไม่มีการสอบที่ผ่านไปแล้ว" : "ไม่มีการสอบที่ยังไม่สิ้นสุด"}
            description={when === "past" ? "เลือก 'ทั้งหมด' เพื่อดูทุกการสอบ" : "เลือก 'ทั้งหมด' เพื่อดูการสอบที่ผ่านไปแล้ว"}
          />
        </div>
      ) : mode === "table" ? (
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
                  <th className="px-4 py-3">ผังที่นั่ง</th>
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
                      <div className="flex items-center tabular-nums text-muted-foreground">{liveDot(s)}{s.opens_at ? `${fmtTime(s.opens_at)} – ${fmtTime(s.closes_at!)}` : "ตั้งเวลา"}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{subjectsOf(s).map((x) => <div key={x.id} className="flex h-8 items-center"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span></div>)}</td>
                    <td className="px-4 py-3 font-medium">{subjectsOf(s).map((x) => <div key={x.id} className="flex h-8 items-center">{x.name_th}</div>)}</td>
                    {(() => {
                      const rooms = subjectsOf(s).map((x) => roomOfSet(setIdOf(s, x.id)));
                      const badge = (room: string | null) => (room ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span> : "—");
                      // Every subject in the same room: one badge for the row, like the other columns.
                      return rooms.length > 1 && new Set(rooms).size === 1 ? (
                        <td className="whitespace-nowrap px-4 py-0">{badge(rooms[0]!)}</td>
                      ) : (
                        <td className="whitespace-nowrap px-4 py-3">{rooms.map((room, i) => <div key={i} className="flex h-8 items-center">{badge(room)}</div>)}</td>
                      );
                    })()}
                    <td className="px-4 py-0">{venueOf(s) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-0">{seatBadge(s) ?? <span className="text-muted-foreground">—</span>}</td>
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
      ) : mode === "rooms" ? (
        <RoomsView
          sessions={scheduled}
          roomIdsOf={roomIdsOf}
          venues={venues}
          subjectsOf={subjectsOf}
          subjectTone={(x) => colors.shade(x.learning_area_id)}
          levelsOf={(s) => [...new Set((sessionSets?.get(s.id) ?? []).flatMap((x) => roomOfSet(x.topic_set_id) ?? []))]}
          seatBadge={seatBadge}
          clashing={clashingIds}
          onOpen={setEditing}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {scheduled.map((s) => row(s))}
        </div>
      )}
      {editing && <SeatingSheet session={sessions.find((x) => x.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
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
function ScheduleCard({ session, defaultOpen = false }: { session: ExamSession; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow
        icon={CalendarIcon}
        tone="setup"
        title="เวลาสอบ"
        open={open}
        onClick={() => setOpen((v) => !v)}
        alert={!(session.opens_at && session.closes_at)}
        summary={session.opens_at && session.closes_at ? (() => { const w = windowParts(session.opens_at, session.closes_at); return `${w.date} · ${w.time}`; })() : "ยังไม่ได้ตั้งเวลา"}
      />
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

type ScheduleItem = { id: string; opens: Date; closes: Date | null; subjects: Subject[]; rooms: string[]; classroomIds: string[]; venue: string | undefined; exam: string };

const dayLabel = (d: Date) => d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "พิมพ์ตารางสอบ": pick days, grade and room independently of the table's filters, then preview/print on landscape A4. */
function PrintScheduleDrawer({ items, grades, rooms, onClose }: { items: ScheduleItem[]; grades: { id: string; label: string }[]; rooms: { id: string; gradeId: string; label: string }[]; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [grade, setGrade] = useState("");
  const [room, setRoom] = useState("");
  const [preview, setPreview] = useState(false);
  const now = Date.now();
  const gradeOfRoom = new Map(rooms.map((r) => [r.id, r.gradeId]));
  const matching = items.filter((i) => (!grade || i.classroomIds.some((id) => gradeOfRoom.get(id) === grade)) && (!room || i.classroomIds.includes(room)));
  const days = [...Map.groupBy(matching.slice().sort((a, b) => a.opens.getTime() - b.opens.getTime()), (i) => dayKey(i.opens))];
  // Default: every day not yet over; past days are listed but start unchecked.
  const upcoming = new Set(days.filter(([, list]) => list.some((i) => !i.closes || i.closes.getTime() >= now)).map(([k]) => k));
  const selected = picked ?? upcoming;
  const chosen = matching.filter((i) => selected.has(dayKey(i.opens))).sort((a, b) => a.opens.getTime() - b.opens.getTime());
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p ?? upcoming); if (!n.delete(k)) n.add(k); return n; });
  const allOn = days.length > 0 && days.every(([k]) => selected.has(k));
  const roomOptions = rooms.filter((r) => !grade || r.gradeId === grade).sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
  return (
    <>
      <Sheet
        open
        onOpenChange={(o) => !o && onClose()}
        title="พิมพ์ตารางสอบ"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>ยกเลิก</Button>
            <Button type="button" className="flex-1" disabled={chosen.length === 0} onClick={() => setPreview(true)}>
              <PrintIcon className="mr-1 h-4 w-4" />ดูตัวอย่าง/พิมพ์ ({chosen.length} รอบ)
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <section>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h3 className="text-[13px] font-medium">วันสอบ</h3>
              {days.length > 0 && (
                <button type="button" className="text-xs text-accent" onClick={() => setPicked(allOn ? new Set() : new Set(days.map(([k]) => k)))}>
                  {allOn ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                </button>
              )}
            </div>
            {days.length === 0 ? (
              <p className="rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">ไม่มีรอบสอบตามชั้น/ห้องที่เลือก</p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-muted [&>*+*]:border-t [&>*+*]:border-border">
                {days.map(([k, list]) => (
                  <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" className="h-[18px] w-[18px] shrink-0 accent-accent" checked={selected.has(k)} onChange={() => toggle(k)} />
                    <span className="min-w-0 flex-1">{dayLabel(list[0]!.opens)}</span>
                    {!upcoming.has(k) && <span className="shrink-0 text-[11px] text-muted-foreground">ผ่านแล้ว</span>}
                    <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">{list.length} รอบ</span>
                  </label>
                ))}
              </div>
            )}
          </section>
          <ChipRow label="ชั้น" value={grade} onChange={(v) => { setGrade(v); setRoom(""); }} options={grades.map((g) => [g.id, g.label])} />
          <ChipRow label="ห้อง" value={room} onChange={setRoom} options={roomOptions.map((r) => [r.id, r.label])} />
        </div>
      </Sheet>
      {preview && <PrintScheduleSheet items={chosen} gradeLabel={grades.find((g) => g.id === grade)?.label} roomLabel={rooms.find((r) => r.id === room)?.label} onDone={() => setPreview(false)} />}
    </>
  );
}

/** Landscape A4 paper of the chosen rounds: one table per day, time-ordered (no seating status or teacher: this goes to students). */
function PrintScheduleSheet({ items, gradeLabel, roomLabel, onDone }: { items: ScheduleItem[]; gradeLabel: string | undefined; roomLabel: string | undefined; onDone: () => void }) {
  const days = [...Map.groupBy(items, (i) => dayKey(i.opens))];
  const first = items[0]?.opens;
  const last = items[items.length - 1]?.opens;
  const short = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  const range = !first || !last ? "" : dayKey(first) === dayKey(last) ? short(first) : `${short(first)} – ${short(last)}`;
  const exams = [...new Set(items.map((i) => i.exam).filter(Boolean))].join(" / ");
  const who = roomLabel ?? gradeLabel ?? "ทุกชั้น";
  const hm = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "4px 8px", verticalAlign: "top", textAlign: "left" };
  return createPortal(
    <div className="print-sheet landscape">
      <div className="print-toolbar">
        <Button size="sm" variant="outline" onClick={onDone}>ปิด</Button>
        <Button size="sm" onClick={() => window.print()}><PrintIcon className="mr-1 h-4 w-4" />พิมพ์</Button>
      </div>
      <div className="paper">
        <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center" }}>ตารางสอบ{exams && ` ${exams}`}</h1>
        <p style={{ textAlign: "center" }}>{who} · {range}</p>
        {days.map(([k, list]) => (
          <section key={k} style={{ marginTop: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, breakAfter: "avoid" }}>{dayLabel(list[0]!.opens)}</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#eee" }}>
                  {["เวลา", "รหัสวิชา", "วิชา", "ชั้น/ห้อง", "ห้องสอบ"].map((h) => <th key={h} style={cell}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} style={{ breakInside: "avoid" }}>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{hm(i.opens)}{i.closes ? ` – ${hm(i.closes)} น.` : " น."}</td>
                    <td style={cell}>{i.subjects.map((x) => <div key={x.id}>{x.code}</div>)}</td>
                    <td style={cell}>{i.subjects.map((x) => <div key={x.id}>{x.name_th}</div>)}</td>
                    <td style={cell}>{i.rooms.join(", ") || "-"}</td>
                    <td style={cell}>{i.venue ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Seating chart of one exam room from the timetable (time itself is edited in the room detail). */
function SeatingSheet({ session, onClose }: { session: ExamSession; onClose: () => void }) {
  const { data: targetIds = [] } = useExamSessionTargets(session.id);
  const { data: assignments = [] } = useMyTeachingAssignments(session.teacher_id);
  const targets = assignments.filter((a) => targetIds.includes(a.id)).map((a) => ({ classroom_id: a.classroom_id, academic_year: a.academic_year }));
  const { data: roster = [], isLoading } = useSessionRoster(targets);
  const { data: names } = useStudentNames(roster.map((r) => r.student_id));
  const { data: avatars } = useStudentAvatars(roster.map((r) => r.student_id));
  const { data: rosterClassrooms = [] } = useClassroomsByIds([...new Set(roster.map((r) => r.classroom_id))]);
  const { data: rosterGrades = [] } = useGradeLevelsByIds([...new Set(rosterClassrooms.map((c) => c.grade_level_id))]);
  const classroomLabel = (classroomId: string) => {
    const c = rosterClassrooms.find((x) => x.id === classroomId);
    const g = rosterGrades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : "";
  };
  const students = roster
    .map((r) => {
      const full = names?.get(r.student_id) ?? "นักเรียน";
      const [code, ...rest] = full.split(" ");
      return { student_id: r.student_id, name: rest.length > 0 ? rest.join(" ") : full, code: rest.length > 0 ? code! : "", avatar: avatars?.get(r.student_id) ?? null, classroom: classroomLabel(r.classroom_id) };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "th") || a.name.localeCompare(b.name, "th"));
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="รายละเอียด" description={session.title}>
      <div className="space-y-3">
        <ScheduleCard session={session} defaultOpen />
        <PrintExamCard session={session} />
        {isLoading ? <PageSpinner /> : <ExamSeatingCard defaultOpen session={session} roomPicker={(room, usedRoomIds) => <ExamRoomField session={session} room={room} usedRoomIds={usedRoomIds} />} students={students} />}
      </div>
    </Sheet>
  );
}

/** Print card in the seating drawer: student copy and answer key of the room's questions (the same A4 sheet as the question list). */
function PrintExamCard({ session }: { session: ExamSession }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState<"student" | "key" | null>(null);
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const { data: roomSets } = useSessionSets([session.id]);
  const subjectIds = (roomSets?.get(session.id) ?? []).map((x) => x.subject_id);
  const { data: bank = [], isLoading } = useExamQuestionsOf(open || printing ? (subjectIds.length > 0 ? subjectIds : [session.subject_id]) : []);
  const { data: subjects = [] } = useSubjectsByIds(printing ? subjectIds : []);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const chosen = sessionQuestions.map((r) => byId.get(r.question_id)).filter((q): q is ExamQuestionWithChoices => !!q);
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow icon={PrintIcon} tone="content" title="พิมพ์ข้อสอบ" open={open} onClick={() => setOpen((v) => !v)} summary={`${sessionQuestions.length} ข้อ`} />
      <Collapse open={open}>
        <div className="flex flex-wrap gap-2 border-t border-border bg-card p-3">
          {sessionQuestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีข้อสอบในห้องนี้</p>
          ) : (
            <>
              <Button size="sm" variant="secondary" disabled={isLoading} onClick={() => setPrinting("student")}><PrintIcon className="mr-1 h-4 w-4" />ดูตัวอย่าง/พิมพ์ฉบับนักเรียน</Button>
              <Button size="sm" variant="secondary" disabled={isLoading} onClick={() => setPrinting("key")}><PrintIcon className="mr-1 h-4 w-4" />ดูตัวอย่าง/พิมพ์ฉบับเฉลย</Button>
            </>
          )}
        </div>
      </Collapse>
      {printing && <PrintExamSheet session={session} questions={chosen} subjects={subjects} withKey={printing === "key"} onDone={() => setPrinting(null)} />}
    </div>
  );
}

const ownerName = (o: { first_name: string; last_name: string } | undefined) => (o ? `${o.first_name} ${o.last_name}` : "—");

/** Wrapping pill row with "ทั้งหมด" first — same look as the student exam filters. */
function ChipRow({ label, value, onChange, options, all = "ทั้งหมด" }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; /** Label of the empty option; null hides it (every option is a real choice). */ all?: string | null }) {
  const chip = (active: boolean) =>
    cn(
      "tappable rounded-full border px-3 py-1 text-[13px] font-medium",
      active ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-foreground hover:bg-muted",
    );
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {all !== null && <button type="button" aria-pressed={!value} onClick={() => onChange("")} className={chip(!value)}>{all}</button>}
        {options.map(([id, name]) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)} className={chip(value === id)}>{name}</button>
        ))}
      </div>
    </div>
  );
}

/** canSeeAll: heads/approvers may switch to every room RLS shows them (their department; all for org-wide). A head with no teaching load has no "mine". */
function TeacherExams({ teacherId, canSeeAll }: { teacherId: string | null; canSeeAll: boolean }) {
  const [scope, setScope] = useState<"mine" | "all">(teacherId ? "mine" : "all");
  const mine = useMyExamSessions(teacherId);
  const all = useAllExamSessions(canSeeAll && scope === "all");
  const { data: sessions = [], isLoading } = scope === "all" && canSeeAll ? all : mine;
  const [selected, setSelected] = useState<ExamSession | null>(null);
  const [view, setView] = useState<"cards" | "table">(defaultView);
  // Phones always get the card list: the table and room grid are desktop-only, so the switch is hidden there too.
  const mode = usePhone() ? "cards" : view;
  const [deleting, setDeleting] = useState<ExamSession | null>(null);
  const colors = useSubjectColors([]);
  const { data: questionCounts, isLoading: countsLoading } = useSessionQuestionCounts(sessions.map((s) => s.id));
  const deleteSession = useDeleteExamSession();
  const updateSession = useUpdateExamSession();
  const toast = useToast();
  const { data: sessionSets, isLoading: setsLoading } = useSessionSets(sessions.map((s) => s.id));
  // Subjects come from the rooms themselves — rooms of other teachers aren't in my assignments.
  const { data: subjects = [], isLoading: subjectsLoading } = useSubjectsByIds([...new Set(sessions.flatMap((s) => sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]))]);
  const { data: owners = [], isLoading: ownersLoading } = useProfilesByIds([...new Set(sessions.map((s) => s.teacher_id))]);
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  // Room of a session = classroom of its topic set's teaching assignment.
  const { data: roomSets = [], isLoading: roomSetsLoading } = useTopicSetsByIds([...new Set(sessions.map((s) => s.topic_set_id))]);
  const assignmentOfSet = new Map(roomSets.map((t) => [t.id, t.teaching_assignment_id]));
  const { data: classroomOfAssignment, isLoading: assignLoading } = useAssignmentClassrooms([...new Set([...assignmentOfSet.values()].filter((id): id is string => !!id))]);
  const { data: roomClassrooms = [], isLoading: classroomsLoading } = useClassroomsByIds([...new Set(classroomOfAssignment?.values() ?? [])]);
  const { data: roomGrades = [], isLoading: gradesLoading } = useGradeLevelsByIds([...new Set(roomClassrooms.map((c) => c.grade_level_id))]);
  // Rows are built from these chained lookups; hold the spinner until all land so cells don't pop in one by one.
  const detailsLoading = countsLoading || setsLoading || subjectsLoading || ownersLoading || roomSetsLoading || assignLoading || classroomsLoading || gradesLoading;
  const roomOf = (topicSetId: string) => {
    const c = roomClassrooms.find((x) => x.id === classroomOfAssignment?.get(assignmentOfSet.get(topicSetId) ?? ""));
    const g = roomGrades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : null;
  };

  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // One filter button: กลุ่มสาระ + ชั้น + ห้อง, derived from the rooms loaded.
  const { data: areas = [] } = useLearningAreas();
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const [filterOpen, setFilterOpen] = useState(false);
  const [fArea, setFArea] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fRoom, setFRoom] = useState("");
  const [query, setQuery] = useState("");
  const classroomIdOf = (s: ExamSession) => classroomOfAssignment?.get(assignmentOfSet.get(s.topic_set_id) ?? "") ?? "";
  const areaIdsOf = (s: ExamSession) =>
    (sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]).map((id) => topArea(subjectById.get(id)?.learning_area_id, areaById)?.id ?? "");
  const gradeIdOf = (s: ExamSession) => roomClassrooms.find((c) => c.id === classroomIdOf(s))?.grade_level_id ?? "";
  // Search: subject name/code, exam type, class (ม.2/1) or teacher.
  const needle = query.trim().toLowerCase();
  const matches = (s: ExamSession) =>
    !needle ||
    [
      s.title,
      s.exam_type,
      roomOf(s.topic_set_id),
      ownerName(ownerById.get(s.teacher_id)),
      ...(sessionSets?.get(s.id)?.map((x) => x.subject_id) ?? [s.subject_id]).flatMap((id) => [subjectById.get(id)?.name_th, subjectById.get(id)?.code]),
    ].some((t) => t?.toLowerCase().includes(needle));
  const shown = sessions.filter(
    (s) => matches(s) && (!fArea || areaIdsOf(s).includes(fArea)) && (!fGrade || gradeIdOf(s) === fGrade) && (!fRoom || classroomIdOf(s) === fRoom),
  );
  const areaOptions = [...new Map(sessions.flatMap(areaIdsOf).filter(Boolean).map((id) => [id, areaById.get(id)?.name ?? id])).entries()];
  const gradeOptions = [...roomGrades].sort((a, b) => a.code.localeCompare(b.code));
  const roomOptions = roomClassrooms.filter((c) => !fGrade || c.grade_level_id === fGrade).sort((a, b) => a.name.localeCompare(b.name, "th", { numeric: true }));
  const defaultScope = teacherId ? "mine" : "all";
  const filterCount = [canSeeAll && teacherId && scope !== defaultScope, fArea, fGrade, fRoom].filter(Boolean).length;

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
    <div className="page-fill gap-3">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <div className="relative min-w-0 flex-1 lg:flex-[1.3]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาวิชา ครู ห้อง" aria-label="ค้นหาห้องสอบ" className="ui-control-compact h-8 pl-8 text-[13px]" />
        </div>
        <div className="hidden lg:contents">
          {canSeeAll && teacherId && (
            <Select className="ui-control-compact h-8 min-w-0 flex-1 px-2.5 pr-7 text-[13px] sm:pr-8" aria-label="ขอบเขตห้องสอบ" value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")}>
              <option value="mine">ของฉัน</option>
              <option value="all">ทุกวิชา</option>
            </Select>
          )}
          <Select className="ui-control-compact h-8 min-w-0 flex-1 px-2.5 pr-7 text-[13px] sm:pr-8" aria-label="กลุ่มสาระ" value={fArea} onChange={(e) => setFArea(e.target.value)}>
            <option value="">ทุกกลุ่มสาระ</option>
            {areaOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
          <Select className="ui-control-compact h-8 min-w-0 flex-1 px-2.5 pr-7 text-[13px] sm:pr-8" aria-label="ชั้น" value={fGrade} onChange={(e) => { setFGrade(e.target.value); setFRoom(""); }}>
            <option value="">ทุกชั้น</option>
            {gradeOptions.map((g) => <option key={g.id} value={g.id}>{gradeShortLabel(g.code)}</option>)}
          </Select>
          <Select className="ui-control-compact h-8 min-w-0 flex-1 px-2.5 pr-7 text-[13px] sm:pr-8" aria-label="ห้อง" value={fRoom} onChange={(e) => setFRoom(e.target.value)}>
            <option value="">ทุกห้อง</option>
            {roomOptions.map((c) => <option key={c.id} value={c.id}>{roomOf(sessions.find((x) => classroomIdOf(x) === c.id)?.topic_set_id ?? "") ?? c.name}</option>)}
          </Select>
        </div>
        <FilterButton count={filterCount} label="กรองห้องสอบ" onClick={() => setFilterOpen(true)} />
        <ViewToggle value={view} onChange={setView} className="hidden lg:flex" />
      </div>

      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="กรองห้องสอบ"
        activeCount={filterCount}
        resultText={`ดู ${shown.length} ห้อง`}
        onClear={() => { setScope(defaultScope); setFArea(""); setFGrade(""); setFRoom(""); }}
      >
        {canSeeAll && teacherId && <SegmentedFilter label="ขอบเขต" value={scope} onChange={(v) => setScope(v as "mine" | "all")} options={[["mine", "ของฉัน"], ["all", "ทุกวิชา"]]} />}
        <ChipFilter label="กลุ่มสาระ" value={fArea} onChange={setFArea} options={areaOptions.map(([id, name]) => [id, name])} />
        <ChipFilter label="ชั้น" value={fGrade} onChange={(v) => { setFGrade(v); setFRoom(""); }} options={gradeOptions.map((g) => [g.id, gradeShortLabel(g.code)])} />
        <ChipFilter label="ห้อง" value={fRoom} onChange={setFRoom} options={roomOptions.map((c) => [c.id, roomOf(sessions.find((x) => classroomIdOf(x) === c.id)?.topic_set_id ?? "") ?? c.name])} />
      </FilterSheet>

      {isLoading || detailsLoading ? <PageSpinner /> : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={sessions.length === 0 ? "ยังไม่มีการเปิดสอบ" : "ไม่พบห้องสอบตามตัวกรอง"} description={sessions.length === 0 ? "เปิดสอบจากชุดหัวข้อที่อนุมัติแล้ว" : "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา"} />
        </div>
      ) : mode === "cards" ? (
        <ul className="-mx-1 -mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
          {shown.map((s) => {
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
                  className="cursor-pointer rounded-xl border border-border bg-card p-3.5 text-xs hover:bg-muted active:bg-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm leading-6 text-muted-foreground">
                      {s.exam_type ? <><span className="font-semibold text-foreground">{s.exam_type}</span>{s.round ? ` · ครั้งที่ ${s.round}` : ""}</> : s.title}
                    </p>
                    {(questionCounts?.get(s.id) ?? 0) > 0 ? (
                      <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">มีข้อสอบ {questionCounts?.get(s.id)} ข้อ</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">ยังไม่มีข้อสอบ</span>
                    )}
                  </div>
                  <ul className="mt-2.5 divide-y divide-border border-y border-border">
                    {roomSubjects.map((x) => (
                      <li key={x.id} className="flex items-center gap-2.5 py-2">
                        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span>
                        <p className="min-w-0 flex-1 text-sm font-medium leading-5">{x.name_th}</p>
                        {room && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center justify-between gap-2 text-muted-foreground">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={ownerName(owner)} src={owner ? avatarUrl(owner) : null} className="h-6 w-6 text-[9px]" />
                      <span className="truncate font-medium text-foreground">{ownerName(owner)}</span>
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
                {shown.map((s) => {
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
  presetSets: ExamTopicSet[];
}) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);

  const [kind, setKind] = useState("");
  const [round, setRound] = useState("");
  const [duration, setDuration] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [syncGradebook, setSyncGradebook] = useState(false);

  const classroomIds = [...new Set(assignments.map((a) => a.classroom_id))];
  const { data: classrooms = [] } = useClassroomsByIds(classroomIds);
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const { data: roomGrades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);

  const create = useCreateExamSession();
  const submitting = useRef(false);
  const toast = useToast();

  function reset() {
    setKind("");
    setRound("");
    setDuration("");
    setMaxAttempts("1");
  }

  // A set belongs to one room, so each session opens for exactly that room.
  const targets = presetSets;
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
    if (!canSave || submitting.current) return;
    submitting.current = true; // sync lock: a double click / Enter lands before isPending re-renders
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
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title="สร้างห้องสอบ"
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
  const { data: sessionQuestions = [], isLoading: questionsLoading } = useExamSessionQuestions(session.id);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterFilter, setRosterFilter] = useState<"all" | "submitted" | "in_progress" | "none" | "locked">("all");
  const [retakeIds, setRetakeIds] = useState<string[] | null>(null);
  const [scoring, setScoring] = useState<string | null>(null); // student_id whose score the teacher is entering
  const { data: grants } = useSessionGrants(session.id);
  const { data: leaveCounts } = useSessionLeaveCounts(attempts.filter((a) => !a.is_manual).map((a) => ({ id: a.id, student_id: a.student_id })), rosterOpen);
  const grantRetake = useGrantRetake();
  const eventCount = useSecurityEvents(session.id).data?.length ?? 0;
  const toast = useToast();
  const updateSession = useUpdateExamSession();
  const { data: seatedIds, isLoading: seatedLoading } = useSessionsWithSeating([session.id]);
  // Toggle appears once time, questions and seating are all set (or while on, so it can be switched off).
  const canEnable = session.is_enabled || (!!session.opens_at && !!session.closes_at && sessionQuestions.length > 0 && !!seatedIds?.has(session.id));

  const maxPoints = sessionQuestions.reduce((s, q) => s + q.points, 0);
  const submitted = attempts.filter((a) => a.status === "submitted");
  const { data: roomSets, isLoading: roomSetsLoading } = useSessionSets([session.id]);
  const sets = roomSets?.get(session.id) ?? [];
  // Warm the queries of the cards below (shared cache) so every card appears at once instead of one by one.
  const warm = [
    useTopicSetsTopics(sets.map((x) => x.topic_set_id)).isLoading,
    useSeatTemplates().isLoading,
    useSessionRooms(session.id).isLoading,
    useSessionSeats(session.id).isLoading,
    useSpecialSeats(session.id).isLoading,
  ].some(Boolean);
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
  const { data: rosterNames, isLoading: namesLoading } = useStudentNames(roster.map((r) => r.student_id));
  const { data: rosterAvatars } = useStudentAvatars(roster.map((r) => r.student_id));
  const { data: lockedRows = [] } = useLockedCodeStudents(session.id);
  // Gate on loading flags, not on data being defined: an errored or offline-paused query never gets data and would spin forever.
  const ready = !(isLoading || targetsLoading || assignmentsLoading || rosterLoading || questionsLoading || warm || roomSetsLoading || seatedLoading || namesLoading);
  const roomOfClassroom = new Map(classrooms.map((c) => { const g = grades.find((x) => x.id === c.grade_level_id); return [c.id, g ? `${gradeShortLabel(g.code)}/${c.name}` : c.name]; }));
  const lockedIds = new Set(lockedRows.map((l) => l.student_id));
  const rosterRows = roster
    .map((r) => {
      const mine = attempts.filter((a) => a.student_id === r.student_id);
      const real = mine.filter((a) => !a.is_manual);
      const manual = mine.find((a) => a.is_manual) ?? null;
      // Newest by when its score last reached the gradebook, so a teacher-entered score after the last real attempt wins.
      const latest = mine.reduce<ExamAttempt | null>((best, a) => (!best || attemptScoreTime(a) > attemptScoreTime(best) ? a : best), null);
      const best = latest?.is_manual
        ? latest.score
        : real.reduce<number | null>((m, a) => (a.status !== "submitted" || a.score == null ? m : m == null || a.score > m ? a.score : m), null);
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
        // Submitted and every attempt (max_attempts + granted extra) used up → teacher can grant one more.
        canRetake: status === "submitted" && real.length >= session.max_attempts + (grants?.get(r.student_id) ?? 0),
        student_id: r.student_id,
        leaves: leaveCounts?.get(r.student_id) ?? 0,
        room: roomOfClassroom.get(r.classroom_id) ?? "—",
        code: rest.length > 0 ? code : "",
        name: rest.length > 0 ? rest.join(" ") : full,
        full,
        status,
        best,
        manual,
        isManual: !!latest?.is_manual,
        isScan: !!latest?.is_scan,
      };
    })
    .sort((a, b) => a.room.localeCompare(b.room, "th") || a.full.localeCompare(b.full, "th"));
  const retakeable = rosterRows.filter((r) => r.canRetake);
  const canScore = !!session.opens_at && new Date(session.opens_at) <= new Date(); // the server also checks the role and the roster
  const scoringRow = rosterRows.find((r) => r.student_id === scoring) ?? null;
  const count = (st: string) => rosterRows.filter((r) => r.status === st).length;
  const STATUS_LABEL = { locked: "ถูกล็อก", submitted: "ส่งแล้ว", in_progress: "กำลังทำ", none: "ยังไม่เข้าสอบ" } as const;
  const STATUS_CLASS = { locked: "text-destructive", submitted: "text-success", in_progress: "text-foreground", none: "text-muted-foreground" } as const;
  const STATUS_RING = { locked: "ring-destructive", submitted: "ring-success", in_progress: "ring-warning", none: "ring-transparent" } as const;
  const shownRoster = rosterFilter === "all" ? rosterRows : rosterRows.filter((r) => r.status === rosterFilter);
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

      {!ready ? (
        <PageSpinner />
      ) : (
        <>
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

      <DetailGroup label="ผู้เข้าสอบ">
      <SecurityPanel session={session} attempts={attempts} />
      {rosterRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-3 py-6">
          <EmptyState title="ยังไม่มีนักเรียนในห้องนี้" description="ตรวจสอบการลงทะเบียนนักเรียนของห้องเรียน" />
        </div>
      ) : (
        <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
              <DetailRow
            icon={PeopleIcon}
            tone="people"
            title={`นักเรียน ${rosterRows.length} คน`}
            open={rosterOpen}
            onClick={() => setRosterOpen((v) => !v)}
            summary={
              <>
                <span className={count("submitted") > 0 ? "text-success" : undefined}>ส่งแล้ว {count("submitted")}</span>
                {" · "}
                <span className={count("in_progress") > 0 ? "text-warning" : undefined}>กำลังทำ {count("in_progress")}</span>
                {" · "}
                <span>ยังไม่เข้าสอบ {count("none")}</span>
                {count("locked") > 0 && <span className="text-destructive"> · ถูกล็อก {count("locked")}</span>}
              </>
            }
          />
          <Collapse open={rosterOpen}>
            {retakeable.length > 0 && (
              <div className="flex justify-end border-t border-border bg-muted/40 p-2">
                <Button variant="outline" className="ui-control-compact h-7 sm:h-8" onClick={() => setRetakeIds(retakeable.map((r) => r.student_id))}>
                  สอบใหม่ทั้งหมด ({retakeable.length})
                </Button>
              </div>
            )}
            {/* Progress of the room at a glance: submitted / in progress / not started. */}
            <div
              role="img"
              aria-label={`ส่งแล้ว ${count("submitted")} กำลังทำ ${count("in_progress")} จาก ${rosterRows.length} คน`}
              className="flex h-1.5 border-t border-border bg-muted"
            >
              <span className="bg-success" style={{ width: `${(count("submitted") / rosterRows.length) * 100}%` }} />
              <span className="bg-warning" style={{ width: `${(count("in_progress") / rosterRows.length) * 100}%` }} />
            </div>
            {/* Counts double as filters, so a big room can be narrowed to "who has not started". */}
            <div role="group" aria-label="กรองตามสถานะ" className="flex flex-wrap gap-1.5 border-t border-border bg-card px-3 py-2.5">
              {(
                [
                  ["all", "ทั้งหมด", rosterRows.length],
                  ["submitted", STATUS_LABEL.submitted, count("submitted")],
                  ["in_progress", STATUS_LABEL.in_progress, count("in_progress")],
                  ["none", STATUS_LABEL.none, count("none")],
                  ...(count("locked") > 0 ? ([["locked", STATUS_LABEL.locked, count("locked")]] as const) : []),
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={rosterFilter === key}
                  onClick={() => setRosterFilter(key)}
                  className={cn(
                    "tappable rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                    rosterFilter === key ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {label} {n}
                </button>
              ))}
            </div>
            {shownRoster.length === 0 ? (
              <p className="border-t border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">ไม่มีนักเรียนในสถานะนี้</p>
            ) : (
              <ul className="grid max-h-[60vh] gap-2 overflow-y-auto border-t border-border bg-muted/40 p-2 sm:grid-cols-2 xl:grid-cols-3">
                {shownRoster.map((r) => (
                  <li key={r.student_id} className="flex flex-col rounded-xl border border-border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <Avatar
                        name={r.name}
                        src={rosterAvatars?.get(r.student_id) ?? null}
                        className={cn("h-10 w-10 shrink-0 text-xs ring-2 ring-offset-2 ring-offset-card", STATUS_RING[r.status])}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-5">{r.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {r.code && <span className="tabular-nums">{r.code}</span>}
                          {r.room !== "—" && <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", levelTone(r.room))}>{r.room}</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-base tabular-nums leading-5", r.best != null ? "font-semibold text-foreground" : "text-muted-foreground")}>{r.best != null ? r.best : "—"}</p>
                        <p className="text-[10px] tabular-nums text-muted-foreground">/{maxPoints}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                      <span className={cn("flex items-center gap-1.5 text-[11px] font-medium", STATUS_CLASS[r.status])}>
                        <span className={cn("size-1.5 rounded-full", STATUS_DOT[r.status])} />
                        {STATUS_LABEL[r.status]}
                        {r.isManual && <span title={r.manual?.manual_note ?? undefined} className="ml-1 rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-semibold text-warning">{r.isScan ? "สแกนแล้ว" : "ครูกรอก"}</span>}
                        {r.leaves > 0 && (
                          <span title="ตรวจพบการสลับแอปหรือหน้าจอระหว่างสอบ เป็นสัญญาณให้ตรวจดู ไม่ใช่หลักฐานว่าทุจริต" className="ml-1 rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-warning">
                            ออกจากหน้าสอบ {r.leaves} ครั้ง
                          </span>
                        )}
                      </span>
                      {(r.canRetake || canScore) && (
                        <span className="flex gap-1.5">
                          {r.canRetake && (
                            <Button variant="outline" className="ui-control-compact h-7" onClick={() => setRetakeIds([r.student_id])}>
                              สอบใหม่
                            </Button>
                          )}
                          {canScore && (
                            <Button variant="outline" className="ui-control-compact h-7" onClick={() => setScoring(r.student_id)}>
                              {r.manual ? "แก้คะแนน" : "กรอกคะแนน"}
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {submitted.length > 0 && (
              <p className="border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                ค่าเฉลี่ย: {(submitted.reduce((s, a) => s + (a.score ?? 0), 0) / submitted.length).toFixed(1)}/{maxPoints}
              </p>
            )}
          </Collapse>
        </div>
      )}
      </DetailGroup>

      <DetailGroup label="การจัดสอบ">
      <ScheduleCard session={session} />
      <ExamSettingsCard session={session} />
      {rosterRows.length > 0 && <ExamSeatingCard session={session} roomPicker={(room, usedRoomIds) => <ExamRoomField session={session} room={room} usedRoomIds={usedRoomIds} />} students={rosterRows.map((r) => ({ student_id: r.student_id, name: r.name, code: r.code ?? "", avatar: rosterAvatars?.get(r.student_id) ?? null, classroom: r.room !== "—" ? r.room : "" }))} />}
      </DetailGroup>

      <DetailGroup label="เนื้อหาข้อสอบ">
      <SessionTopicsCard session={session} />
      <SessionQuestionList session={session} sessionQuestions={sessionQuestions} />
      <PracticeQuestionsCards session={session} />
      </DetailGroup>

      <DetailGroup label="กระดาษคำตอบ">
        <AnswerSheetCard
          session={session}
          roster={rosterRows.map((r) => ({ student_id: r.student_id, name: r.name, code: r.code ?? "", room: r.room }))}
          questionIds={sessionQuestions.map((q) => q.question_id)}
          subjects={subjectList}
        />
        <AnswerSheetScanCard
          session={session}
          roster={rosterRows.map((r) => ({ student_id: r.student_id, name: r.name, code: r.code ?? "", room: r.room }))}
          attempts={attempts}
          sessionQuestions={sessionQuestions}
          subjects={subjectList}
        />
      </DetailGroup>
        </>
      )}

      <ConfirmDialog
        open={!!retakeIds}
        title="ให้สอบใหม่?"
        description={retakeIds ? `เพิ่มสิทธิ์สอบอีก 1 ครั้งให้นักเรียน ${retakeIds.length} คน ต้องสอบในช่วงเวลาสอบเดิม ผลรอบเก่าจะยังเก็บไว้ และคะแนนรอบล่าสุดจะเข้าสมุดคะแนน` : undefined}
        confirmLabel="ให้สอบใหม่"
        pending={grantRetake.isPending}
        onCancel={() => setRetakeIds(null)}
        onConfirm={() => retakeIds && grantRetake.mutate({ sessionId: session.id, studentIds: retakeIds }, { onSuccess: (n) => { setRetakeIds(null); if (n > 0) toast(`เพิ่มสิทธิ์สอบใหม่ ${n} คนแล้ว`); else toast("ไม่มีนักเรียนที่ให้สอบใหม่ได้ (กำลังทำอยู่ หรือยังมีสิทธิ์สอบเหลือ)", "error"); }, onError: () => toast("บันทึกไม่สำเร็จ", "error") })}
      />
      <SecurityEventsSheet sessionId={session.id} open={eventsOpen} onOpenChange={setEventsOpen} />
      {scoringRow && <ManualScoreSheet session={session} row={scoringRow} maxPoints={maxPoints} onClose={() => setScoring(null)} />}
    </div>
  );
}

/** Teacher enters (or edits) a student's score when the exam broke. A round still in progress is closed first (migration 0231). */
function ManualScoreSheet({ session, row, maxPoints, onClose }: { session: ExamSession; row: { student_id: string; full: string; status: string; manual: ExamAttempt | null }; maxPoints: number; onClose: () => void }) {
  const [score, setScore] = useState(row.manual?.score?.toString() ?? "");
  const [note, setNote] = useState(row.manual?.manual_note ?? "");
  const save = useSetManualScore();
  const toast = useToast();
  const n = Number(score);
  const valid = score.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= maxPoints && Math.round(n * 100) === n * 100 && note.trim() !== "";
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    save.mutate(
      { sessionId: session.id, studentId: row.student_id, score: n, note: note.trim() },
      {
        onSuccess: (r) => {
          if (r === "not_synced") toast("บันทึกที่ห้องสอบแล้ว แต่ยังไม่เข้าสมุดคะแนน (ภาคเรียนอาจถูกล็อก)", "error");
          else toast(r === "off" ? "บันทึกคะแนนแล้ว (ห้องนี้ไม่ซิงก์สมุดคะแนน)" : "บันทึกคะแนนแล้ว เข้าสมุดคะแนนแล้ว");
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={row.manual ? "แก้คะแนน" : "กรอกคะแนน"}
      description={row.full}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form="manual-score" className="flex-1" disabled={!valid || save.isPending}>
            {row.status === "in_progress" ? "ปิดรอบและบันทึก" : "บันทึก"}
          </Button>
        </div>
      }
    >
      <form id="manual-score" onSubmit={submit} className="space-y-4">
        {row.status === "in_progress" && (
          <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">นักเรียนกำลังทำข้อสอบอยู่ รอบนี้จะถูกปิดเป็น “ส่งแล้ว” ด้วยคำตอบเท่าที่ตอบไว้ และนักเรียนจะส่งซ้ำไม่ได้</p>
        )}
        {!session.sync_to_gradebook && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">ห้องนี้ไม่ได้ซิงก์สมุดคะแนน คะแนนจะบันทึกที่ห้องสอบเท่านั้น</p>
        )}
        <Field label={`คะแนน (เต็ม ${maxPoints})`} required>
          <Input type="number" inputMode="decimal" min={0} max={maxPoints} step="0.01" value={score} onChange={(e) => setScore(e.target.value)} autoFocus />
        </Field>
        <Field label="เหตุผล" required>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ระบบขัดข้อง เครือข่ายหลุดระหว่างสอบ" maxLength={200} />
        </Field>
      </form>
    </Sheet>
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
        className="ui-control-compact h-8 min-w-0 px-2.5 pr-7 text-[13px]"
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

/** หัวข้อการสอบ card: the approved topics the room's sets cover, grouped by lesson (subjects sharing a plan show once). Approvers can edit until the room opens (migration 0230). */
function SessionTopicsCard({ session }: { session: ExamSession }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { data: roomSets } = useSessionSets([session.id]);
  const canEdit = canApproveExams(profile?.roles ?? []) && !(session.opens_at && new Date(session.opens_at) <= new Date());
  const { data: topicsBySet } = useTopicSetsTopics((roomSets?.get(session.id) ?? []).map((x) => x.topic_set_id));
  const topics = [...new Map([...(topicsBySet?.values() ?? [])].flat().map((t) => [t.topic_id, t] as const)).values()];
  const lessons = [...Map.groupBy(topics, (t) => t.lesson)];
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow icon={ListIcon} tone="content" title="หัวข้อการสอบ" open={open} onClick={() => setOpen((v) => !v)} summary={`${topics.length} หัวข้อ`} alert={topics.length === 0} />
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-card p-3">
          {canEdit && (
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>แก้ไขหัวข้อ</Button>
            </div>
          )}
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
      {editing && <EditSessionTopicsSheet sets={roomSets?.get(session.id) ?? []} current={topicsBySet} title={session.title} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Approver edit of a room's topics: one checklist over the sets' subjects' ผังการเรียน lessons; each set keeps only topics that fit its own subject (the DB rejects others). */
function EditSessionTopicsSheet({ sets, current, title, onClose }: { sets: { topic_set_id: string; subject_id: string }[]; current: Map<string, { topic_id: string }[]> | undefined; title: string; onClose: () => void }) {
  const { data: lessons = [], isLoading } = useSubjectsLinkedLessons(sets.map((x) => x.subject_id));
  const save = useSetTopicSetTopics();
  const toast = useToast();
  const [picked, setPicked] = useState(() => new Set(sets.flatMap((x) => (current?.get(x.topic_set_id) ?? []).map((t) => t.topic_id))));
  const subjectsOf = new Map(lessons.flatMap((l) => l.topics.map((t) => [t.id, l.subjectIds] as const)));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (!n.delete(id)) n.add(id); return n; });
  async function submit() {
    try {
      for (const x of sets) {
        const cur = (current?.get(x.topic_set_id) ?? []).map((t) => t.topic_id);
        await save.mutateAsync({ setId: x.topic_set_id, current: cur, next: [...picked].filter((id) => subjectsOf.get(id)?.includes(x.subject_id)) });
      }
      toast("บันทึกหัวข้อแล้ว");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
    }
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="แก้ไขหัวข้อการสอบ" description={title}>
      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-4">
          {lessons.map((l) => (
            <section key={l.id}>
              <h3 className="mb-1.5 px-1 text-[13px] font-semibold">{l.name}</h3>
              <div className="overflow-hidden rounded-xl bg-muted [&>*+*]:border-t [&>*+*]:border-border">
                {l.topics.map((t) => (
                  <label key={t.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" className="h-[18px] w-[18px] shrink-0 accent-accent" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                    <span className="min-w-0">{t.name}</span>
                  </label>
                ))}
              </div>
            </section>
          ))}
          <Button type="button" className="w-full" disabled={save.isPending} onClick={() => void submit()}>บันทึก ({picked.size})</Button>
        </div>
      )}
    </Sheet>
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
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow icon={SettingsIcon} tone="setup" title="ตั้งค่าห้องสอบ" open={open} onClick={() => setOpen((v) => !v)} summary={summary} />
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
    <div className={cn("shrink-0 space-y-2 rounded-lg border px-3 py-2 text-xs", locked.length > 0 ? "border-destructive/40" : "border-border")}>
      {pending.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5">
          <span>{nameOf(a.student_id)} ขอเปลี่ยนเครื่อง</span>
          <Button size="sm" onClick={() => approve.mutate(a.id, { onError })}>
            อนุมัติ
          </Button>
        </div>
      ))}

      {locked.map((l) => (
        <div key={l.student_id} role="alert" className="flex items-center justify-between gap-2 rounded-md bg-destructive/15 px-2.5 py-2 text-destructive">
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0"><span className="font-semibold">{nameOf(l.student_id)}</span> ถูกล็อกรหัสสอบ</span>
          </span>
          {/* Off = locked; switching on unlocks and the row disappears once the lock is gone. */}
          <label className="flex shrink-0 items-center gap-2 font-medium">
            ปลดล็อก
            <Switch size="sm" label="ปลดล็อก" checked={unlock.isPending && unlock.variables?.studentId === l.student_id} disabled={unlock.isPending} onChange={(on) => on && unlock.mutate({ sessionId: session.id, studentId: l.student_id }, { onError })} />
          </label>
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

/** Full-screen preview of a room's questions on A4 paper (listed order, no shuffle), with a print button. Portals into <body>; index.css prints only the paper. */
function PrintExamSheet({ session, questions, subjects, withKey, onDone }: { session: ExamSession; questions: ExamQuestionWithChoices[]; subjects: Subject[]; withKey: boolean; onDone: () => void }) {
  const opens = session.opens_at ? new Date(session.opens_at) : null;
  const when = opens ? `${opens.toLocaleDateString("th-TH", { dateStyle: "long" })} ${opens.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.` : "-";
  // The title already names the subjects (line 2 lists them), so drop them from line 1 and keep exam type, round and room.
  const heading = subjects.reduce((t, x) => t.replace(`${x.code} ${x.name_th}`, ""), session.title).replace(/(^|\s)·(?=\s|$)/g, " ").replace(/\s+/g, " ").trim() || session.title;
  return createPortal(
    <div className="print-sheet">
      <div className="print-toolbar">
        <Button size="sm" variant="outline" onClick={onDone}>ปิด</Button>
        <Button size="sm" onClick={() => window.print()}><PrintIcon className="mr-1 h-4 w-4" />พิมพ์</Button>
      </div>
      <div className="paper">
      <h1 style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}>{heading}{withKey && " (ฉบับเฉลย)"}</h1>
      <p style={{ textAlign: "center" }}>วิชา {subjects.map((x) => `${x.code} ${x.name_th}`).join(", ") || "-"}</p>
      <p style={{ textAlign: "center" }}>
        {[`วันที่สอบ ${when}`, `เวลา ${session.duration_minutes ? `${session.duration_minutes} นาที` : "-"}`, `${questions.length} ข้อ`, `${questions.reduce((n, q) => n + q.points, 0)} คะแนน`].join("\u2003")}
      </p>
      {!withKey && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, margin: "10px 0", borderBottom: "1px solid #000", paddingBottom: 6 }}>
          {([["ชื่อ-สกุล", 5], ["เลขที่", 1], ["ห้อง", 1.5]] as const).map(([label, grow]) => (
            <span key={label} style={{ display: "flex", alignItems: "flex-end", gap: 4, flex: grow }}>
              {label}<span style={{ flex: 1, borderBottom: "1px dotted #000", height: "1em" }} />
            </span>
          ))}
        </div>
      )}
      <ol style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {questions.map((q, i) => (
          <li key={q.id} style={{ breakInside: "avoid", marginBottom: 12, display: "flex", gap: 6 }}>
            <span style={{ width: 22, flexShrink: 0 }}>{i + 1}.</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="print-prompt"><QuestionPromptView value={q.prompt_json} /></div>
              {q.question_type === "short_answer" ? (
                withKey ? <p className="key-correct" style={{ fontWeight: 700 }}>เฉลย: {q.correct_answer}</p> : <div style={{ borderBottom: "1px solid #000", height: 24 }} />
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
                  {q.choices.map((c, ci) => (
                    <li key={c.id} className={withKey && c.is_correct ? "key-correct" : undefined} style={{ display: "flex", gap: 6, fontWeight: withKey && c.is_correct ? 700 : 400 }}>
                      <span className="key-letter">{CHOICE_LETTERS[ci] ?? ci + 1}.</span>
                      <span style={{ flex: 1 }}><QuestionPromptView value={c.label_json} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
      </div>
    </div>,
    document.body,
  );
}

/** Collapsible card listing the questions already in the room. */
function SessionQuestionList({ session, sessionQuestions, practice }: { session: ExamSession; sessionQuestions: ExamSessionQuestionRow[]; practice?: boolean }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addedOnce, setAddedOnce] = useState(false); // mount the add form only after the first open, so its chunk loads on demand
  const [sheetWarm, setSheetWarm] = useState(false); // keeps the edit sheet mounted after its first use (close animation)
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
  const [printing, setPrinting] = useState<"student" | "key" | null>(null);
  const { data: printSubjects = [] } = useSubjectsByIds(printing ? subjectIds : []);
  // Every row is a stack of rich-text/math editors; mounting 20 at once stalls the opening animation. Mount a few
  // after the card starts opening, then the rest in small batches. Once mounted they stay, so reopening is instant.
  const [mounted, setMounted] = useState(0);
  useEffect(() => {
    if (!open || mounted >= chosen.length) return;
    const t = setTimeout(() => setMounted((n) => Math.min(chosen.length, n + (n === 0 ? 3 : 5))), mounted === 0 ? 150 : 40);
    return () => clearTimeout(t);
  }, [open, mounted, chosen.length]);
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow
        icon={DocumentTextIcon}
        tone="content"
        title={practice ? "แนวข้อสอบ" : "รายการข้อสอบ"}
        open={open}
        onPointerEnter={() => { setWarm(true); preloadQuestionPromptView(); }}
        onFocus={() => { setWarm(true); preloadQuestionPromptView(); }}
        onClick={() => setOpen((v) => !v)}
        summary={sessionQuestions.length === 0 ? (practice ? "ยังไม่มีแนวข้อสอบ" : "ยังไม่มีข้อสอบ") : `${sessionQuestions.length} ข้อ`}
        alert={sessionQuestions.length === 0 && !practice}
      />
      <Collapse open={open}>
        <div className="divide-y divide-border border-t border-border bg-card">
          {sessionQuestions.length === 0 && <p className="p-3 text-xs text-muted-foreground">{practice ? "ยังไม่มีแนวข้อสอบในห้องนี้" : "ยังไม่มีข้อสอบในห้องนี้"}</p>}
          {chosen.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3">
              <Button size="sm" variant="secondary" onClick={() => setPrinting("student")}><PrintIcon className="mr-1 h-4 w-4" />ดูตัวอย่าง/พิมพ์ฉบับนักเรียน</Button>
              <Button size="sm" variant="secondary" onClick={() => setPrinting("key")}><PrintIcon className="mr-1 h-4 w-4" />ดูตัวอย่าง/พิมพ์ฉบับเฉลย</Button>
            </div>
          )}
          {chosen.slice(0, mounted).map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 p-3 [contain-intrinsic-size:auto_260px] [content-visibility:auto]">
              <div className="min-w-0 flex-1"><QuestionBody q={q} i={i} /></div>
              <div className="flex shrink-0 items-center gap-1.5">
              <Button size="icon" variant="ghost" className={ICON_BTN} aria-label="แก้ไขข้อสอบ" title="แก้ไขข้อสอบ" onClick={() => { setSheetWarm(true); setEditingQ(q); }}>
                <PencilIcon className={ICON} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={ICON_BTN}
                aria-label="ลบข้อสอบออกจากห้อง"
                title="ลบข้อสอบออกจากห้อง"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(practice ? "ลบแนวข้อสอบข้อนี้ออกจากห้อง?" : "ลบข้อสอบข้อนี้ออกจากห้อง?")) remove.mutate({ sessionId: session.id, questionId: q.id, practice }, { onError: () => toast("ลบข้อสอบไม่สำเร็จ", "error") });
                }}
              >
                <TrashIcon className={ICON} />
              </Button>
              </div>
            </div>
          ))}
        </div>
      </Collapse>
      <DetailAddRow label={practice ? "เพิ่มแนวข้อสอบ" : "เพิ่มข้อสอบ"} open={adding} onClick={() => { setAddedOnce(true); setAdding((v) => !v); }} />
      {addedOnce && (
        <Suspense fallback={null}>
          <AddSessionQuestionPanel session={session} open={adding} practice={practice} />
        </Suspense>
      )}
      {printing && <PrintExamSheet session={session} questions={chosen} subjects={printSubjects} withKey={printing === "key"} onDone={() => setPrinting(null)} />}
      {/* Keyed so the form remounts with the picked question; its state is seeded once on mount. */}
      {(editingQ || sheetWarm) && (
        <Suspense fallback={null}>
          <QuestionSheet
            key={editingQ?.id ?? "new"}
            open={!!editingQ}
            onOpenChange={(v) => !v && setEditingQ(null)}
            subjectId={editingQ?.subject_id ?? null}
            planTopicId={editingQ?.plan_topic_id ?? null}
            teacherId={profile?.id ?? session.teacher_id}
            question={editingQ}
          />
        </Suspense>
      )}
    </div>
  );
}

/** แนวข้อสอบ: practice questions students can try from their exam card (not graded, not stored). */
function PracticeQuestionsCards({ session }: { session: ExamSession }) {
  const { data: practiceQuestions = [] } = usePracticeQuestions(session.id);
  return <SessionQuestionList session={session} sessionQuestions={practiceQuestions} practice />;
}

/** Anti-impersonation event trail for one room (migration 0132). */
/** Severity of each event: red = someone may be impersonating or the student is locked out, amber = a failed/blocked attempt, green = the teacher resolved it. */
const SECURITY_EVENT_TONE: Record<ExamSecurityEventType, { dot: string; text: string }> = {
  login_blocked: { dot: "bg-destructive", text: "text-destructive" },
  code_locked: { dot: "bg-destructive", text: "text-destructive" },
  code_failed: { dot: "bg-warning", text: "text-warning" },
  reset_blocked: { dot: "bg-warning", text: "text-warning" },
  strict_disabled: { dot: "bg-warning", text: "text-warning" },
  takeover_requested: { dot: "bg-accent", text: "text-accent" },
  takeover_approved: { dot: "bg-success", text: "text-success" },
  code_unlocked: { dot: "bg-success", text: "text-success" },
};

/** "Android · Chrome" from a user agent; calls from our own edge functions show as the system. */
function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  if (/SupabaseEdgeRuntime|^Deno\//.test(ua)) return "ระบบ (เซิร์ฟเวอร์)";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  return [os, browser].filter(Boolean).join(" · ") || "อุปกรณ์ไม่ทราบชนิด";
}

/** Event trail of a room, newest first: grouped by day, repeats of the same student + event folded into ×N, filterable by type. */
function SecurityEventsSheet({ sessionId, open, onOpenChange }: { sessionId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: events = [] } = useSecurityEvents(sessionId);
  const names = useStudentNames(events.flatMap((e) => (e.student_id ? [e.student_id] : []))).data;
  const [type, setType] = useState("");
  const typeCounts = new Map<string, number>();
  for (const e of events) typeCounts.set(e.event_type, (typeCounts.get(e.event_type) ?? 0) + 1);
  const shown = events.filter((e) => !type || e.event_type === type);
  // Fold consecutive identical (student, event) rows; `at` of the newest row is kept, the oldest gives the range start.
  const rows: { head: ExamSecurityEvent; count: number; first: string }[] = [];
  for (const e of shown) {
    const last = rows[rows.length - 1];
    if (last && last.head.student_id === e.student_id && last.head.event_type === e.event_type && last.head.device === e.device) {
      last.count++;
      last.first = e.at;
    } else rows.push({ head: e, count: 1, first: e.at });
  }
  const byDay = [...Map.groupBy(rows, (r) => new Date(r.head.at).toLocaleDateString("th-TH", { dateStyle: "long" }))];
  const hms = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="เหตุการณ์ผิดปกติ" description={`${events.length} รายการ`}>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีเหตุการณ์ผิดปกติ</p>
      ) : (
        <div className="space-y-5">
          <ChipRow
            label="ประเภท"
            value={type}
            onChange={setType}
            options={[...typeCounts].map(([t, n]) => [t, `${SECURITY_EVENT_LABEL[t as ExamSecurityEventType]} ${n}`])}
          />
          {byDay.map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">{day}</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {items.map(({ head: e, count, first }) => {
                  const tone = SECURITY_EVENT_TONE[e.event_type];
                  const full = e.student_id ? names?.get(e.student_id) : undefined;
                  const [code, ...rest] = (full ?? "").split(" ");
                  const device = deviceLabel(e.device);
                  const fromSystem = device === "ระบบ (เซิร์ฟเวอร์)";
                  return (
                    <li key={e.id} className="flex gap-3 px-3.5 py-3">
                      <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", tone.dot)} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-semibold">
                            {full ? (rest.length > 0 ? rest.join(" ") : full) : e.student_id ? "นักเรียน" : "—"}
                            {full && rest.length > 0 && <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{code}</span>}
                          </p>
                          <time dateTime={e.at} className="shrink-0 text-xs tabular-nums text-muted-foreground">{count > 1 ? `${hms(first)}–${hms(e.at)}` : hms(e.at)}</time>
                        </div>
                        <p className={cn("text-[13px] font-medium", tone.text)}>
                          {SECURITY_EVENT_LABEL[e.event_type]}
                          {count > 1 && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">×{count}</span>}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {device && <span title={e.device ?? undefined}>{device}</span>}
                          {e.ip && !fromSystem && <span className="font-mono tabular-nums">{e.ip}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {events.length >= 100 && <p className="px-1 text-center text-xs text-muted-foreground">แสดง 100 รายการล่าสุด</p>}
        </div>
      )}
    </Sheet>
  );
}

/** "เพิ่มข้อสอบ": a new question written here goes straight into the room. */
// ============================================================== student side

/** Same self/child picker shape as Assignments.tsx. */
function StudentExams() {
  useEffect(() => preloadQuestionPromptView(), []); // ready before the first question is drawn
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = options.find((s) => s.id === selectedId) ?? options[0] ?? null;
  const roomLabel = useRoomLabel(current?.id ?? null);
  const [activeSession, setActiveSession] = useState<AvailableExam | null>(null);
  const [rehearsing, setRehearsing] = useState<AvailableExam | null>(null);
  const [reviewing, setReviewing] = useState<AvailableExam | null>(null);

  if (options.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีข้อมูล" description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น" />
      </div>
    );
  }

  if (rehearsing) return <ExamRehearsal header={<ExamHeader session={rehearsing} roomLabel={roomLabel} />} onExit={() => setRehearsing(null)} />;

  if (current && reviewing) {
    return <ExamReview student={current} session={reviewing} roomLabel={roomLabel} onExit={() => setReviewing(null)} />;
  }

  if (current && activeSession) {
    return <TakeExam student={current} session={activeSession} onExit={() => setActiveSession(null)} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-xl lg:max-w-none flex-1 flex-col space-y-4">
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
      {current && <ExamList student={current} onOpen={setActiveSession} onRehearse={setRehearsing} onReview={setReviewing} />}
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

type ExamStatusFilter = "all" | "open" | "upcoming" | "done";
const EXAM_STATUS_FILTERS: readonly [ExamStatusFilter, string][] = [
  ["all", "ทั้งหมด"],
  ["open", "เข้าสอบได้"],
  ["upcoming", "ยังไม่ถึงเวลา"],
  ["done", "จบแล้ว"],
];
function examStatus(e: AvailableExam, now: Date): Exclude<ExamStatusFilter, "all"> {
  if (isExamOpen(e, now)) return "open";
  return now < new Date(e.opens_at) ? "upcoming" : "done";
}

function ExamList({ student, onOpen, onRehearse, onReview }: { student: Student; onOpen: (s: AvailableExam) => void; onRehearse: (s: AvailableExam) => void; onReview: (s: AvailableExam) => void }) {
  const { data: classroom } = useMyCurrentClassroom(student.id);
  const { data: allExams = [], isLoading } = useAvailableExams(
    student.id,
    classroom?.classroomId ?? null,
    classroom?.academicYear ?? null,
  );
  const [view, setView] = useState<"cards" | "table">(defaultView);
  const [params, setParams] = useSearchParams();
  const subjectCode = params.get("subject");
  const { data: subjects = [], isLoading: subjectsLoading } = useSubjectsByIds([...new Set(allExams.flatMap((e) => e.subject_ids))]);
  const colors = useSubjectColors([]);
  const { data: rooms = [], isLoading: roomsLoading } = useClassroomsByIds(classroom ? [classroom.classroomId] : []);
  const { data: roomGrades = [], isLoading: roomGradesLoading } = useGradeLevelsByIds(rooms.map((c) => c.grade_level_id));
  const roomGrade = roomGrades.find((g) => g.id === rooms[0]?.grade_level_id);
  const roomLabel = rooms[0] && roomGrade ? `${gradeShortLabel(roomGrade.code)}/${rooms[0].name}` : null;
  const subjectId = subjects.find((s) => s.code === subjectCode)?.id;
  const status = (params.get("status") ?? "all") as ExamStatusFilter;
  const nowF = new Date();
  const exams = allExams.filter(
    (e) =>
      (!subjectCode || (!!subjectId && e.subject_ids.includes(subjectId))) &&
      (status === "all" || examStatus(e, nowF) === status),
  );
  const setFilter = (key: "subject" | "status", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const chip = (active: boolean) =>
    cn("tappable shrink-0 rounded-full px-3 py-1.5 text-xs font-medium", active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted");
  const filters = allExams.length > 0 && (
    <div className="mb-2 space-y-2 px-1">
      {subjects.length > 1 && (
        <div className="scrollbar-hidden flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setFilter("subject", null)} className={chip(!subjectCode)}>ทุกวิชา</button>
          {subjects.map((sub) => (
            <button key={sub.id} type="button" onClick={() => setFilter("subject", sub.code)} className={chip(subjectCode === sub.code)}>
              {sub.name_th}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Select
          className="ui-control-compact mr-auto h-10 px-2.5 pr-7 text-[13px] sm:w-64 sm:pr-8"
          value={status}
          onChange={(e) => setFilter("status", e.target.value === "all" ? null : e.target.value)}
          aria-label="สถานะการสอบ"
        >
          {EXAM_STATUS_FILTERS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
        <ViewToggle value={view} onChange={setView} framed className="h-10" />
      </div>
    </div>
  );

  const { data: mySeats, isLoading: seatsLoading } = useMyExamSeats(student.id, exams.filter((e) => new Date(e.closes_at) >= new Date()).map((e) => e.id));
  const [topicFor, setTopicFor] = useState<AvailableExam | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: practiceCounts, isLoading: practiceLoading } = usePracticeCounts(exams.map((e) => e.id));

  // Wait for every piece the cards show (subject, room, seat, practice count) so they appear together.
  if (isLoading || subjectsLoading || roomsLoading || roomGradesLoading || seatsLoading || practiceLoading) return <PageSpinner />;
  if (exams.length === 0) {
    return (
      <>
        {filters}
        {allExams.length === 0 ? (
          <EmptyState title="ไม่มีข้อสอบ" description="ยังไม่มีการเปิดสอบสำหรับห้องนี้" />
        ) : (
          <EmptyState
            title="ไม่พบข้อสอบ"
            description="ลองเปลี่ยนตัวกรอง"
            action={<Button size="sm" variant="outline" onClick={() => setParams({}, { replace: true })}>ล้างตัวกรอง</Button>}
          />
        )}
      </>
    );
  }

  const now = new Date();
  return (
    <>
      {filters}
      {topicFor && <StudentTopicsSheet session={topicFor} onClose={() => setTopicFor(null)} />}
      {view === "table" ? (
        <div className="table-panel flex rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[48rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">รหัสวิชา</th>
                  <th className="px-4 py-3">ครั้งที่</th>
                  <th className="px-4 py-3">ชั้น</th>
                  <th className="px-4 py-3">วันที่และเวลา</th>
                  <th className="px-4 py-3">ห้องสอบ</th>
                  <th className="px-4 py-3">ที่นั่ง</th>
                  <th className="px-4 py-3">สอบแล้ว</th>
                  <th className="w-px px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => {
                  const seat = mySeats?.get(e.id);
                  const opens = new Date(e.opens_at);
                  const closes = new Date(e.closes_at);
                  const isOpen = now >= opens && now <= closes;
                  const usedUp = e.my_attempts >= e.max_attempts;
                  const subs = e.subject_ids.map((id) => subjects.find((x) => x.id === id)).filter((x) => !!x);
                  return (
                    <tr key={e.id} onClick={() => setTopicFor(e)} className="h-14 cursor-pointer border-t border-border first:border-t-0">
                      <td className="px-4 py-2 font-medium">{subs.map((x) => x.name_th).join(" / ") || e.title}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {subs.map((sub) => (
                            <span key={sub.id} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", colors.shade(sub.learning_area_id))}>{sub.code}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">{e.round ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", roundTone(e.round))}>{e.round}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-2">{roomLabel ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(roomLabel))}>{roomLabel}</span> : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div>{opens.toLocaleDateString("th-TH", { dateStyle: "medium" })}</div>
                        <div className="tabular-nums text-muted-foreground">
                          {opens.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}–{closes.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">{seat?.room ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-2">
                        {seat?.seat ? (
                          <span className={cn("inline-flex rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums", COL_TONES[(seat.seat.col - 1) % COL_TONES.length])}>{seatLabel(seat.seat.row, seat.seat.col)}</span>
                        ) : seat?.special ? (
                          <span className="inline-flex rounded-lg bg-warning/15 px-2.5 py-1 text-sm font-bold tabular-nums text-warning">พิเศษ {seat.special}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", e.my_attempts > 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>{e.my_attempts}/{e.max_attempts}</span>
                      </td>
                      <td className="px-4 py-2" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {(practiceCounts?.get(e.id) ?? 0) > 0 && (
                            <Button size="sm" variant="outline" onClick={() => navigate(`/exams/practice/${e.id}`, { state: { studentId: student.id, search: location.search } })}>
                              ฝึกทำ ({practiceCounts?.get(e.id)})
                            </Button>
                          )}
                          {seat && now <= closes && (
                            <Button size="sm" variant="ghost" onClick={() => onRehearse(e)}>
                              ทดลองเข้าห้อง
                            </Button>
                          )}
                          {e.has_manual_score && !usedUp && (
                            <Button size="sm" variant="outline" onClick={() => onReview(e)}>
                              ดูผลสอบ
                            </Button>
                          )}
                          {usedUp ? (
                            <Button size="sm" onClick={() => onReview(e)}>
                              ดูผลสอบ
                            </Button>
                          ) : (
                            <Button size="sm" disabled={!isOpen} onClick={() => onOpen(e)}>
                              เข้าสอบ
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <ul className="-m-2 grid gap-3 p-2 lg:grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]">
      {exams.map((e) => {
        const seat = mySeats?.get(e.id);
        const opens = new Date(e.opens_at);
        const closes = new Date(e.closes_at);
        const isOpen = now >= opens && now <= closes;
        const usedUp = e.my_attempts >= e.max_attempts;
        const subs = e.subject_ids.map((id) => subjects.find((x) => x.id === id)).filter((x) => !!x);
        const SubjectIcon = colors.icon(subs[0]?.learning_area_id);
        const hm = { hour: "2-digit", minute: "2-digit" } as const;
        return (
          <Card key={e.id} className="flex flex-col gap-0 overflow-hidden p-0 text-xs shadow-float md:p-0">
            <button type="button" onClick={() => setTopicFor(e)} className="min-w-0 flex-1 space-y-3 p-4 text-left">
              <div className="flex items-start gap-3">
                <GlyphTile icon={SubjectIcon} tone={colors.tile(subs[0]?.learning_area_id)} className="size-11" iconSize={26} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-[15px] font-semibold leading-tight">{subs.map((x) => x.name_th).join(" / ") || e.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {e.round && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", roundTone(e.round))}>ครั้งที่ {e.round}</span>}
                    {subs.map((sub) => (
                      <span key={sub.id} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", colors.shade(sub.learning_area_id))}>{sub.code}</span>
                    ))}
                    {roomLabel && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(roomLabel))}>{roomLabel}</span>}
                  </div>
                </div>
                {e.my_attempts > 0 || e.has_manual_score ? (
                  /* span, not <button>: this sits inside the card's topic button */
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="ดูผลสอบ"
                    onClick={(ev) => { ev.stopPropagation(); onReview(e); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); onReview(e); } }}
                    className="tappable shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {e.my_attempts > 0 ? `ทำแล้ว ${e.my_attempts}/${e.max_attempts}` : "ครูกรอกคะแนน"} ›
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    ทำแล้ว 0/{e.max_attempts}
                  </span>
                )}
              </div>
              {now >= opens && (
                <p className="flex items-center gap-1.5 font-medium">
                  <span className={cn("size-2 rounded-full", isOpen ? "animate-pulse bg-success" : "bg-muted-foreground/50")} />
                  {isOpen ? "กำลังเปิดสอบ" : "ปิดสอบแล้ว"}
                </p>
              )}
              {seat && now <= closes && (
                /* Ticket stub: schedule on the left, seat on the right, torn at a dashed edge. */
                <div className="grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl bg-muted/60">
                  <div className="min-w-0 space-y-2 p-3 font-medium">
                    <p className="flex items-center gap-2"><CalendarIcon className="size-4 shrink-0 text-muted-foreground" />{opens.toLocaleDateString("th-TH", { dateStyle: "medium" })}</p>
                    <p className="flex items-center gap-2"><TimeIcon className="size-4 shrink-0 text-muted-foreground" />{opens.toLocaleTimeString("th-TH", hm)}–{closes.toLocaleTimeString("th-TH", hm)} น.</p>
                    <p className="flex items-center gap-2"><LocationIcon className="size-4 shrink-0 text-muted-foreground" />{seat.room ? `ห้อง ${seat.room}` : "ยังไม่กำหนดห้อง"}</p>
                    {/* span, not <button>: the stub sits inside the card's topic button */}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => { ev.stopPropagation(); onRehearse(e); }}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); onRehearse(e); } }}
                      className="tappable inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      ทดลองเข้าห้อง
                    </span>
                  </div>
                  <div className="relative flex items-center border-l border-dashed border-border px-4">
                    <span aria-hidden className="absolute -top-2 left-0 size-4 -translate-x-1/2 rounded-full bg-card" />
                    <span aria-hidden className="absolute -bottom-2 left-0 size-4 -translate-x-1/2 rounded-full bg-card" />
                    {seat.seat ? (
                      <div className={cn("flex flex-col items-center justify-center rounded-xl px-4 py-2", COL_TONES[(seat.seat.col - 1) % COL_TONES.length])}>
                        <span className="text-[10px] font-medium opacity-80">ที่นั่ง</span>
                        <span className="text-2xl font-bold leading-none tabular-nums">{seatLabel(seat.seat.row, seat.seat.col)}</span>
                      </div>
                    ) : seat.special ? (
                      <div className="flex flex-col items-center justify-center rounded-xl bg-warning/15 px-4 py-2 text-warning">
                        <span className="text-[10px] font-medium opacity-80">ที่นั่งพิเศษ</span>
                        <span className="text-2xl font-bold leading-none tabular-nums">{seat.special}</span>
                      </div>
                    ) : (
                      <span className="w-16 text-center text-muted-foreground">ยังไม่กำหนดที่นั่ง</span>
                    )}
                  </div>
                </div>
              )}
            </button>
            <div className="flex gap-2 px-4 pb-4">
              {(practiceCounts?.get(e.id) ?? 0) > 0 && (
                <Button variant="outline" className="flex-1 border-border" onClick={() => navigate(`/exams/practice/${e.id}`, { state: { studentId: student.id, search: location.search } })}>
                  ฝึกทำแนวข้อสอบ ({practiceCounts?.get(e.id)} ข้อ)
                </Button>
              )}
              {usedUp ? (
                <Button className="flex-1" onClick={() => onReview(e)}>
                  ดูผลสอบ
                </Button>
              ) : (
                <Button className="flex-1" disabled={!isOpen} onClick={() => onOpen(e)}>
                  เข้าสอบ
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </ul>
      )}
    </>
  );
}

/** Practice mode: answer one question at a time, check it server-side (practice_check), retry freely. Nothing is stored. */
/** "ม.6/1" — the student's current room. */
function useRoomLabel(studentId: string | null) {
  const { data: classroom } = useMyCurrentClassroom(studentId);
  const { data: rooms = [] } = useClassroomsByIds(classroom ? [classroom.classroomId] : []);
  const { data: roomGrades = [] } = useGradeLevelsByIds(rooms.map((c) => c.grade_level_id));
  const roomGrade = roomGrades.find((g) => g.id === rooms[0]?.grade_level_id);
  return rooms[0] && roomGrade ? `${gradeShortLabel(roomGrade.code)}/${rooms[0].name}` : null;
}

/** Subject tile + title + round / code / room chips, on top of the practice and exam pages. */
export function ExamHeader({ session, roomLabel }: { session: AvailableExam; roomLabel: string | null }) {
  const { data: subjects = [] } = useSubjectsByIds(session.subject_ids);
  const colors = useSubjectColors([]);
  const SubjectIcon = colors.icon(subjects[0]?.learning_area_id);
  return (
    <div className="flex items-center gap-3 px-1">
      <GlyphTile icon={SubjectIcon} tone={colors.tile(subjects[0]?.learning_area_id)} className="size-12" iconSize={28} />
      <div className="min-w-0 space-y-1.5">
        <p className="text-base font-semibold">{subjects.map((x) => x.name_th).join(" / ") || session.title}</p>
        <div className="flex flex-wrap gap-1.5">
          {session.round && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", roundTone(session.round))}>ครั้งที่ {session.round}</span>}
          {subjects.map((sub) => (
            <span key={sub.id} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", colors.shade(sub.learning_area_id))}>{sub.code}</span>
          ))}
          {roomLabel && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(roomLabel))}>{roomLabel}</span>}
        </div>
      </div>
    </div>
  );
}

/** Practice runner route. Back navigation is handled by GameShell via location.state.search. */
export function ExamPractice() {
  const { sessionId } = useParams();
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const state = useLocation().state as { studentId?: string; search?: string } | null;
  const student = options.find((s) => s.id === state?.studentId) ?? options[0] ?? null;
  const { data: classroom } = useMyCurrentClassroom(student?.id ?? null);
  const { data: exams = [], isLoading } = useAvailableExams(student?.id ?? null, classroom?.classroomId ?? null, classroom?.academicYear ?? null);
  const roomLabel = useRoomLabel(student?.id ?? null);
  const session = exams.find((e) => e.id === sessionId);
  if (!student) return <Navigate to="/exams" replace />;
  if (isLoading) return <PageSpinner />;
  if (!session) return <Navigate to={{ pathname: "/exams", search: state?.search ?? "" }} replace />;
  return <PracticeRunner session={session} roomLabel={roomLabel} />;
}

const CHOICE_MARKS = ["ก", "ข", "ค", "ง", "จ", "ฉ"];

function PracticeRunner({ session, roomLabel }: { session: AvailableExam; roomLabel: string | null }) {
  const { data: rows = [], isLoading } = usePracticeQuestions(session.id);
  const { data } = useAttemptQuestions(rows.map((r) => r.question_id));
  const check = usePracticeCheck();
  const toast = useToast();
  const [picked, setPicked] = useState<Map<string, { choiceId: string | null; text: string }>>(new Map());
  const [results, setResults] = useState<Map<string, PracticeCheckResult>>(new Map());
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<"exam" | "overview">("exam");
  if (isLoading || !data) return <PageSpinner />;
  const questions = rows.map((r) => data.questions.find((q) => q.id === r.question_id)).filter((q): q is NonNullable<typeof q> => !!q);
  const pick = (id: string, v: { choiceId: string | null; text: string }) => {
    setPicked(new Map(picked).set(id, v));
    setResults((m) => { const n = new Map(m); n.delete(id); return n; });
  };
  const runCheck = (questionId: string, choiceId: string | null, text: string) =>
    check.mutate(
      { sessionId: session.id, questionId, choiceId, text: text || null },
      { onSuccess: (res) => setResults((m) => new Map(m).set(questionId, res)), onError: () => toast("ตรวจคำตอบไม่สำเร็จ", "error") },
    );
  const last = questions.length - 1;
  const q = questions[Math.min(idx, last)];
  const a = (q && picked.get(q.id)) ?? { choiceId: null, text: "" };
  const r = q ? results.get(q.id) : undefined;
  const choices = q ? (data.choicesByQuestion.get(q.id) ?? []) : [];

  const status = (id: string) => {
    const res = results.get(id);
    return res ? (res.correct ? "correct" : "wrong") : picked.has(id) ? "answered" : "todo";
  };
  const RAIL_TONE = {
    correct: "bg-success",
    wrong: "bg-destructive",
    answered: "bg-accent/45",
    todo: "bg-border",
  } as const;
  const STATUS_TONE = {
    correct: "border-success/40 bg-success/10 text-success",
    wrong: "border-destructive/40 bg-destructive/10 text-destructive",
    answered: "border-accent/40 bg-accent/10 text-accent",
    todo: "border-border bg-card text-muted-foreground",
  } as const;

  const overview = (
    <Card className="space-y-3">
      <p className="text-sm font-semibold">ภาพรวม</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => { setIdx(i); setTab("exam"); }}
            aria-label={`ข้อ ${i + 1}`}
            className={cn(
              "h-10 rounded-lg border text-sm font-medium",
              STATUS_TONE[status(x.id)],
              i === idx && "ring-2 ring-accent ring-offset-1",
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>ขาว = ยังไม่ตอบ</span>
        <span className="text-accent">ฟ้า = ตอบแล้ว</span>
        <span className="text-success">เขียว = ถูก</span>
        <span className="text-destructive">แดง = ผิด</span>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col lg:max-w-none">
      <div className="space-y-3 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-4 lg:space-y-0">
        <div className={cn("space-y-3", tab !== "exam" && "max-lg:hidden")}>
          <ExamHeader session={session} roomLabel={roomLabel} />
          {q && (
            <>
              {/* Progress rail = answer map: one tappable segment per question, coloured by status. */}
              <div className="space-y-2 px-1">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold tabular-nums">
                    ข้อ {idx + 1}
                    <span className="font-normal text-muted-foreground"> / {questions.length}</span>
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">ตอบแล้ว {picked.size}</p>
                </div>
                <div className="flex gap-0.5" role="group" aria-label="ความคืบหน้า">
                  {questions.map((x, i) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      aria-label={`ไปข้อ ${i + 1}`}
                      aria-current={i === idx}
                      className="flex h-6 min-w-0 flex-1 items-center"
                    >
                      <span
                        className={cn(
                          "w-full rounded-full transition-all",
                          i === idx ? "h-2.5" : "h-1.5",
                          RAIL_TONE[status(x.id)],
                          i === idx && status(x.id) === "todo" && "bg-accent",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <Card className="space-y-5 p-5">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="font-heading text-4xl font-semibold leading-[1.1] tabular-nums text-accent/25">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5 text-[17px] font-semibold leading-snug">
                    <QuestionPromptView value={q.prompt_json} />
                  </div>
                </div>
                {q.question_type === "short_answer" ? (
                  <Input
                    value={a.text}
                    onChange={(e) => pick(q.id, { choiceId: null, text: e.target.value })}
                    onBlur={() => a.text.trim() && !r && runCheck(q.id, null, a.text)}
                    onKeyDown={(e) => e.key === "Enter" && a.text.trim() && runCheck(q.id, null, a.text)}
                    placeholder="พิมพ์คำตอบแล้วกด Enter"
                  />
                ) : (
                  <div className="space-y-2.5" role="radiogroup">
                    {choices.map((c, ci) => {
                      const selected = a.choiceId === c.id;
                      const right = !!r?.correct_choice_ids.includes(c.id);
                      const wrong = !!r && selected && !right;
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-3 font-sarabun text-[15px] leading-snug transition-colors active:scale-[0.99] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                            selected && "border-accent bg-accent/5",
                            right && "border-success/60 bg-success/10",
                            wrong && "border-destructive/60 bg-destructive/10",
                          )}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={`p-${q.id}`}
                            checked={selected}
                            onChange={() => { pick(q.id, { choiceId: c.id, text: "" }); runCheck(q.id, c.id, ""); }}
                          />
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-lg border text-[13px] font-semibold",
                              "border-border bg-muted text-muted-foreground",
                              selected && "border-accent bg-accent text-accent-foreground",
                              right && "border-success bg-success text-white",
                              wrong && "border-destructive bg-destructive text-white",
                            )}
                          >
                            {right ? "✓" : wrong ? "✕" : (CHOICE_MARKS[ci] ?? ci + 1)}
                          </span>
                          <span className="min-w-0 flex-1 self-center">
                            <QuestionPromptView value={c.label_json} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {r && (
                  <div
                    role="status"
                    className={cn("flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm", r.correct ? "bg-success/10" : "bg-destructive/10")}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", r.correct ? "bg-success" : "bg-destructive")}
                    >
                      {r.correct ? "✓" : "✕"}
                    </span>
                    <div>
                      <p className="font-semibold">{r.correct ? "ถูกต้อง" : "ไม่ถูกต้อง"}</p>
                      {!r.correct && r.correct_answer && <p className="text-muted-foreground">เฉลย: {r.correct_answer}</p>}
                    </div>
                  </div>
                )}
              </Card>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 border-border" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
                  <ChevronBack className="h-4 w-4" /> ข้อก่อนหน้า
                </Button>
                <Button type="button" className="flex-[2]" disabled={idx >= last} onClick={() => setIdx(idx + 1)}>
                  ข้อถัดไป <ChevronForward className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
        <div className={cn("lg:sticky lg:top-0", tab !== "overview" && "max-lg:hidden")}>{overview}</div>
      </div>

      <nav aria-label="ส่วนของหน้า" className="sticky bottom-0 -mx-1 mt-auto grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1 shadow-float lg:hidden">
        {([["overview", "ภาพรวม", ListIcon], ["exam", "ข้อสอบ", DocumentTextIcon]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={cn("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium", tab === key ? "bg-accent/10 text-accent" : "text-muted-foreground")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Tap a student exam card → drawer with the approved topics this room covers, grouped by lesson. */
function StudentTopicsSheet({ session, onClose }: { session: AvailableExam; onClose: () => void }) {
  const { data: roomSets } = useSessionSets([session.id]);
  const { data: topicsBySet, isLoading } = useTopicSetsTopics((roomSets?.get(session.id) ?? []).map((x) => x.topic_set_id));
  const topics = [...new Map([...(topicsBySet?.values() ?? [])].flat().map((t) => [t.topic_id, t] as const)).values()];
  const lessons = [...Map.groupBy(topics, (t) => t.lesson)];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="หัวข้อการสอบ" description={session.title}>
      {isLoading ? (
        <PageSpinner />
      ) : lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีหัวข้อ</p>
      ) : (
        <div className="space-y-3">
          {lessons.map(([lesson, items]) => (
            <section key={lesson}>
              <h3 className="mb-2 flex items-center gap-2 px-1 text-base font-semibold">
                <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25"><BookIcon className="h-4 w-4" /></IconTile>
                {lesson}
              </h3>
              <ul className="overflow-hidden rounded-xl bg-muted [&>*+*]:border-t [&>*+*]:border-border">
                {items.map((t) => (
                  <li key={t.topic_id} className="px-4 py-3 text-base">
                    {t.topic}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function TakeExam({ student, session, onExit }: { student: Student; session: AvailableExam; onExit: () => void }) {
  const { data: sessionQuestions = [], isLoading: questionsLoading } = useExamSessionQuestions(session.id);
  const { data: mine, isLoading: mineLoading } = useMyAttempts(session.id, student.id);
  const startOrResume = useStartOrResumeAttempt();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [codeOk, setCodeOk] = useState(false);
  const roomLabel = useRoomLabel(student.id);
  const toast = useToast();

  // Resuming an unsubmitted attempt needs no code; starting a new one does (strict_mode, migration 0132).
  const needsCode = session.strict_mode && !mineLoading && !codeOk && !mine?.some((a) => a.status === "in_progress");

  function start() {
    startOrResume.mutate(
      {
        sessionId: session.id,
        studentId: student.id,
        questionIds: sessionQuestions.map((q) => q.question_id),
        shuffle: session.shuffle_questions,
      },
      { onSuccess: setAttempt, onError: () => toast("เข้าสอบไม่สำเร็จ", "error") },
    );
  }

  useEffect(() => {
    if (attempt || sessionQuestions.length === 0 || mineLoading || needsCode) return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQuestions.length, mineLoading, needsCode]);

  if (needsCode) return <ExamCodeForm sessionId={session.id} onPassed={() => setCodeOk(true)} onExit={onExit} />;

  if (!attempt && !questionsLoading && sessionQuestions.length === 0) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 text-sm" role="alert">
        <p>ข้อสอบนี้ยังไม่มีข้อสอบให้ทำ กรุณาแจ้งครู</p>
        <Button variant="ghost" onClick={onExit}>
          กลับ
        </Button>
      </Card>
    );
  }

  if (!attempt && startOrResume.isError) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 text-sm" role="alert">
        <p>เข้าสอบไม่สำเร็จ กรุณาลองใหม่</p>
        <div className="flex gap-2">
          <Button onClick={start}>ลองใหม่</Button>
          <Button variant="ghost" onClick={onExit}>
            กลับ
          </Button>
        </div>
      </Card>
    );
  }

  if (!attempt) return <PageSpinner />;

  if (attempt.status === "submitted") {
    return <ExamReview student={student} session={session} roomLabel={roomLabel} initialAttemptId={attempt.id} onExit={onExit} />;
  }

  return (
    <AttemptGuard attemptId={attempt.id} onExit={onExit}>
      <AttemptRunner attempt={attempt} session={session} roomLabel={roomLabel} onSubmitted={setAttempt} onExit={onExit} />
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
    return <PageSpinner />;
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
  roomLabel,
  onSubmitted,
  onExit,
}: {
  attempt: ExamAttempt;
  session: AvailableExam;
  roomLabel: string | null;
  onSubmitted: (a: ExamAttempt) => void;
  onExit: () => void;
}) {
  const { data } = useAttemptPaper(attempt.id, attempt.question_order);
  const { data: answers } = useAttemptAnswers(attempt.id);
  const saveAnswers = useSaveAnswers();
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

  // Shown to the student so they know it is recorded; one switch counts once (blur + hidden fire together).
  const [leaves, setLeaves] = useState(0);
  const lastLeave = useRef(0);
  const noteLeave = () => {
    const t = Date.now();
    if (t - lastLeave.current > LEAVE_WINDOW_MS) setLeaves((n) => n + 1);
    lastLeave.current = t;
  };
  useEffect(() => {
    function onBlur() {
      noteLeave();
      logEvent.mutate({ attemptId: attempt.id, eventType: "blur" });
    }
    function onVisibility() {
      if (document.hidden) {
        noteLeave();
        logEvent.mutate({ attemptId: attempt.id, eventType: "visibility_hidden" });
        void syncRef.current();
      }
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id]);

  // Answers live on this device and sync in batches (and with the final submit): one write per minute, not per tap.
  const backupKey = `helix-exam-answers:${attempt.id}`;
  const [local, setLocal] = useState<Record<string, AnswerDraft>>(() => {
    try {
      return JSON.parse(localStorage.getItem(backupKey) ?? "{}") as Record<string, AnswerDraft>;
    } catch {
      return {};
    }
  });
  const pending = useRef<Record<string, AnswerDraft>>({ ...local }); // a restored backup has not reached the server yet
  const syncing = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(backupKey, JSON.stringify(local));
    } catch {
      /* private mode / quota: the in-memory copy and the periodic sync still protect the answers */
    }
  }, [local, backupKey]);

  function setAnswer(d: AnswerDraft) {
    pending.current[d.question_id] = d;
    setLocal((prev) => ({ ...prev, [d.question_id]: d }));
  }

  async function sync() {
    const batch = Object.values(pending.current);
    if (batch.length === 0 || syncing.current) return;
    syncing.current = true;
    try {
      await saveAnswers.mutateAsync({ attemptId: attempt.id, answers: batch });
      for (const d of batch) if (pending.current[d.question_id] === d) delete pending.current[d.question_id];
    } catch {
      /* kept in pending: the next tick (or the final submit) sends it again */
    } finally {
      syncing.current = false;
    }
  }
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    const t = window.setInterval(() => void syncRef.current(), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const mergedAnswers = useMemo(() => {
    const m = new Map<string, AnswerDraft>();
    for (const [qid, a] of answers ?? []) m.set(qid, { question_id: qid, choice_id: a.choice_id, short_answer: a.short_answer });
    for (const d of Object.values(local)) m.set(d.question_id, d);
    return m;
  }, [answers, local]);

  function doSubmit() {
    submit.mutate({ attemptId: attempt.id, answers: [...mergedAnswers.values()] }, {
      onSuccess: () => {
        try {
          localStorage.removeItem(backupKey);
        } catch {
          /* ignore */
        }
        onSubmitted({ ...attempt, status: "submitted" });
      },
      onError: () => toast("ส่งคำตอบไม่สำเร็จ", "error"),
    });
  }

  useEffect(() => {
    if (remainingMs <= 0 && attempt.status === "in_progress" && !submit.isPending) doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs <= 0]);

  if (!data) return <PageSpinner />;

  const orderedQuestions = attempt.question_order
    .map((id) => data.questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const paperQuestions: PaperQuestion[] = orderedQuestions.map((q) => {
    const raw = data.choicesByQuestion.get(q.id) ?? [];
    return {
      id: q.id,
      prompt: <QuestionPromptView value={q.prompt_json} />,
      choices:
        q.question_type === "short_answer"
          ? undefined
          : (session.shuffle_choices ? stableShuffle(raw, attempt.id) : raw).map((c) => ({
              id: c.id,
              label: <QuestionPromptView value={c.label_json} />,
            })),
    };
  });
  const paperAnswers = Object.fromEntries(
    orderedQuestions.map((q) => {
      const a = mergedAnswers.get(q.id);
      return [q.id, { choiceId: a?.choice_id ?? null, text: a?.short_answer ?? "" }];
    }),
  );

  return (
    <ExamPaper
      header={
        <div className="space-y-2">
          <ExamHeader session={session} roomLabel={roomLabel} />
          <p role="status" className={cn("rounded-lg px-3 py-2 text-xs", leaves > 0 ? "bg-warning/15 font-medium text-warning" : "bg-muted text-muted-foreground")}>
            {leaves > 0 ? `ออกจากหน้าสอบแล้ว ${leaves} ครั้ง ครูจะเห็นรายการนี้` : "ระบบบันทึกเมื่อคุณออกจากหน้าสอบ (สลับแอปหรือหน้าจอ) และครูจะเห็นรายการนี้"}
          </p>
        </div>
      }
      questions={paperQuestions}
      answers={paperAnswers}
      onChoice={(qid, cid) => setAnswer({ question_id: qid, choice_id: cid, short_answer: null })}
      onText={(qid, text) => setAnswer({ question_id: qid, choice_id: null, short_answer: text })}
      remainingSec={session.duration_minutes ? Math.max(0, Math.ceil(remainingMs / 1000)) : null}
      totalSec={session.duration_minutes ? session.duration_minutes * 60 : null}
      onSubmit={doSubmit}
      submitting={submit.isPending}
      onLeave={() => {
        void sync();
        onExit();
      }}
      leaveLabel="ออกไปก่อน (ทำต่อได้ภายหลัง)"
    />
  );
}

/** Same order every render and on resume (sorting by a random number would reshuffle on each timer tick). */
function stableShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  const h = (s: string) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return [...items].sort((a, b) => h(seed + a.id) - h(seed + b.id));
}

/**
 * Read-only review of the student's own submitted attempts (a guardian sees their child's). The score is always
 * shown; the questions, answers and the key only once the teacher turns on review_released — the database does
 * not hand out question text before that (can_read_exam_question, 0047; the key comes from exam_review_key, 0216).
 */
function ExamReview({
  student,
  session,
  roomLabel,
  initialAttemptId,
  onExit,
}: {
  student: Student;
  session: AvailableExam;
  roomLabel: string | null;
  initialAttemptId?: string;
  onExit: () => void;
}) {
  const { data: mine, isLoading, isFetching } = useMyAttempts(session.id, student.id);
  const [pickedId, setPickedId] = useState<string | null>(initialAttemptId ?? null);
  const submitted = (mine ?? []).filter((x) => x.status === "submitted").sort((a, b) => attemptScoreTime(b) - attemptScoreTime(a)); // newest score first
  const attempt = submitted.find((x) => x.id === pickedId) ?? submitted[0] ?? null;
  const released = session.review_released;
  const { data: sessionQuestions = [] } = useExamSessionQuestions(session.id);
  const { data: answers } = useAttemptAnswers(attempt?.id ?? null);
  const { data: reviewData } = useAttemptQuestions(released && attempt ? attempt.question_order : []);
  const { data: key, isError: keyError } = useExamReviewKey(attempt?.id ?? null, released);
  const maxPoints = sessionQuestions.reduce((sum, x) => sum + x.points, 0);
  const pointsOf = new Map(sessionQuestions.map((x) => [x.question_id, x.points]));
  const header = <ExamHeader session={session} roomLabel={roomLabel} />;

  if (isLoading || (isFetching && !attempt)) return <PageSpinner />; // right after submitting, the list is refetching
  if (!attempt) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 pt-2">
        {header}
        <Card className="space-y-1 p-6 text-center shadow-float">
          <p className="font-heading text-lg font-bold">ยังไม่มีผลสอบ</p>
          <p className="text-xs text-muted-foreground">จะมีผลให้ดูเมื่อส่งคำตอบแล้ว</p>
        </Card>
        <Button className="w-full" onClick={onExit}>
          กลับหน้าสอบ
        </Button>
      </div>
    );
  }

  const switcher =
    submitted.length > 1 ? (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="เลือกครั้งที่ทำ">
        {[...submitted].reverse().map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setPickedId(x.id)}
            aria-pressed={x.id === attempt.id}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              x.id === attempt.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {x.is_scan ? "สแกนกระดาษ" : x.is_manual ? "ครูกรอก" : `ครั้งที่ ${x.attempt_no}`}
          </button>
        ))}
      </div>
    ) : null;
  const scoreLabel = `${attempt.score ?? "—"}/${maxPoints}`;

  // A teacher-entered score has no answers to review.
  if (attempt.is_manual) {
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 pt-2 sm:max-w-xl">
        {header}
        {switcher}
        <Card className="space-y-2 p-6 text-center shadow-float">
          <p className="text-xs text-muted-foreground">คะแนนที่ได้</p>
          <p className="font-heading text-4xl font-bold tabular-nums">{scoreLabel}</p>
          <p className="text-xs font-semibold text-warning">{attempt.is_scan ? "ตรวจจากกระดาษคำตอบ" : "ครูกรอกคะแนน"}</p>
          {attempt.manual_note && !attempt.is_scan && <p className="text-xs text-muted-foreground">เหตุผล: {attempt.manual_note}</p>}
        </Card>
        <Button className="w-full" onClick={onExit}>
          กลับหน้าสอบ
        </Button>
      </div>
    );
  }

  if (!released || !reviewData || !key) {
    const loading = released && !keyError && (!reviewData || !key);
    return (
      <div className="mx-auto w-full max-w-sm space-y-4 pt-2 sm:max-w-xl">
        {header}
        {switcher}
        <Card className="space-y-2 p-6 text-center shadow-float">
          <p className="text-xs text-muted-foreground">คะแนนที่ได้</p>
          <p className="font-heading text-4xl font-bold tabular-nums">{scoreLabel}</p>
          <p className="text-xs text-muted-foreground">{loading ? "กำลังโหลดเฉลย…" : released ? "โหลดเฉลยไม่สำเร็จ ลองใหม่อีกครั้ง" : "รอครูเปิดเฉลย — จะดูข้อสอบและคำตอบของตัวเองได้เมื่อครูเปิด"}</p>
        </Card>
        <Button className="w-full" onClick={onExit}>
          กลับหน้าสอบ
        </Button>
      </div>
    );
  }

  const ordered = attempt.question_order.map((id) => reviewData.questions.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const paperQuestions: PaperQuestion[] = ordered.map((q) => {
    const ans = answers?.get(q.id);
    const given = !!ans && (!!ans.choice_id || !!ans.short_answer?.trim());
    const k = key.get(q.id);
    const raw = reviewData.choicesByQuestion.get(q.id) ?? [];
    const max = pointsOf.get(q.id);
    return {
      id: q.id,
      prompt: <QuestionPromptView value={q.prompt_json} />,
      choices:
        q.question_type === "short_answer"
          ? undefined
          : (session.shuffle_choices ? stableShuffle(raw, attempt.id) : raw).map((c) => ({
              id: c.id,
              label: <QuestionPromptView value={c.label_json} />,
              correct: !!k?.correct_choice_ids.includes(c.id),
            })),
      verdict: !given ? "skipped" : ans?.is_correct ? "right" : "wrong",
      correctAnswer: k?.correct_answer ?? null,
      points: max != null ? `ได้ ${ans?.points_awarded ?? 0}/${max} คะแนน` : undefined,
    };
  });
  const paperAnswers = Object.fromEntries(
    ordered.map((q) => {
      const ans = answers?.get(q.id);
      return [q.id, { choiceId: ans?.choice_id ?? null, text: ans?.short_answer ?? "" }];
    }),
  );
  return (
    <ExamPaper
      key={attempt.id}
      header={header}
      questions={paperQuestions}
      answers={paperAnswers}
      notices={switcher}
      review={{ scoreLabel }}
      onLeave={onExit}
      leaveLabel="กลับหน้าสอบ"
    />
  );
}
