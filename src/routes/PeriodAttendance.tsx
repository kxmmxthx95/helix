import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { AttendanceMonthView } from "@/routes/Dashboard";
import { Avatar, Card, EmptyState, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useAcademicEvents, useActiveAcademicYear, useActiveTerm } from "@/hooks/useAcademicTerms";
import { useAllDepartmentPeriods } from "@/hooks/usePeriodDefinitions";
import { periodTimes } from "@/lib/periods";
import { eventApplies, periodReplaced } from "@/lib/planSlots";
import { useClassroomRoster, summarizeAttendance } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import {
  usePeriodAttendanceByEntries,
  usePeriodAttendanceTakenSet,
} from "@/hooks/usePeriodAttendance";
import { useDepartmentSchedule, useTeacherSchedule, type ScheduleEntryRow } from "@/hooks/useSchedule";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import type { AttendanceStatus, Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManageAcademic } from "@/lib/roles";
import { SEGMENT_STYLE } from "@/routes/Attendance";
import { cn, todayIso } from "@/lib/utils";

// ----------------------------------------------------------- period check-in
// เช็คชื่อเข้าเรียน — keyed by (schedule_entry_id, date),
// taken by the subject teacher of that period. Not gated by a classroom
// picker — a subject teacher may not have a homeroom at all. See migration
// 0037: the daily attendance_records('leave') row syncs/un-syncs via a DB
// trigger whenever ALL of a student's periods that day are 'leave' — nothing
// to do here beyond saving each period's own marks. Split out of Attendance.tsx
// into its own menu/route — was a tab there, now standalone.

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "มา",
  late: "สาย",
  absent: "ขาด",
  leave: "ลา",
};
const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: "text-success",
  late: "text-warning",
  absent: "text-destructive",
  leave: "text-muted-foreground",
};

const currentAcademicYear = () => new Date().getFullYear() + 543;

export function PeriodAttendance() {
  const { profile: me } = useAuth();
  const isTeacher = me ? (me.roles.includes("teacher") as boolean) : false;
  // The academic group also checks in teacherless activities (migration 0084) of their own department.
  const academic = me ? canManageAcademic(me.roles) : false;

  if (!me || (!isTeacher && !academic)) {
    return <Card className="text-sm text-muted-foreground">เมนูนี้สำหรับครูผู้สอนเท่านั้น</Card>;
  }

  return (
    <div className="page-fill">
      <PeriodCheckInPanel
        teacherId={me.id}
        isTeacher={isTeacher}
        academic={academic}
        departmentId={me.department_id ?? ""}
      />
    </div>
  );
}

function PeriodCheckInPanel({
  teacherId,
  isTeacher,
  academic,
  departmentId,
}: {
  teacherId: string;
  isTeacher: boolean;
  academic: boolean;
  departmentId: string;
}) {
  const date = todayIso();
  const [searchParams] = useSearchParams();
  const [openEntryId, setOpenEntryId] = useState<string | null>(searchParams.get("entry")); // deep link from the teacher home

  const { data: departments = [] } = useDepartments();
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null, { includeUpcoming: false });
  const academicYear = activeYear ?? currentAcademicYear();
  const { data: activeTerm } = useActiveTerm(departmentId || null);
  const term: 1 | 2 = activeTerm?.term_type === "term2" ? 2 : 1;
  const scheduleTerm = splitsByTerm ? term : null;

  const { data: ownEntries = [], isLoading: loadingOwn } = useTeacherSchedule(
    isTeacher ? teacherId : null,
    academicYear,
    scheduleTerm,
  );
  const { data: deptEntries = [], isLoading: loadingDept } = useDepartmentSchedule(
    departmentId || null,
    academicYear,
    scheduleTerm,
    academic && !!departmentId,
  );
  const allEntries = useMemo(
    () => [...ownEntries, ...deptEntries.filter((e) => e.teaching_assignment.teacher_id === null)],
    [ownEntries, deptEntries],
  );
  const isLoading = loadingOwn || (academic && !!departmentId && loadingDept);
  const weekday = new Date(`${date}T00:00:00`).getDay(); // Sun=0..Sat=6, matches day_of_week 1-6 (จันทร์-เสาร์) directly
  const todaysEntries = useMemo(
    () => allEntries.filter((e) => e.day_of_week === weekday).sort((a, b) => a.period_no - b.period_no),
    [allEntries, weekday],
  );
  const scheduleEntryIds = useMemo(() => todaysEntries.map((e) => e.id), [todaysEntries]);
  const { data: takenSet = new Set<string>() } = usePeriodAttendanceTakenSet(scheduleEntryIds, date);

  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId || null);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const classroomOf = (id: string) => classrooms.find((x) => x.id === id);
  const gradeLevelName = (classroomId: string) => {
    const code = gradeLevels.find((g) => g.id === classroomOf(classroomId)?.grade_level_id)?.code;
    return code ? gradeShortLabel(code) : "—";
  };

  // Periods replaced by an activity / closure on this date: shown read-only, never checked in (also enforced by DB trigger, 0166).
  const { data: events = [] } = useAcademicEvents();
  const { data: allPeriods = [] } = useAllDepartmentPeriods(departmentId || null);
  const replacedBy = (e: ScheduleEntryRow) => {
    const grade = classroomOf(e.teaching_assignment.classroom_id)?.grade_level_id ?? null;
    const times = periodTimes(allPeriods, grade, e.day_of_week, e.period_no);
    return events.find((ev) => eventApplies(ev, departmentId, grade) && periodReplaced(date, times ?? {}, [ev]))?.name ?? null;
  };

  // Back-to-back periods of the same assignment (no break between, none replaced by an activity) are checked once.
  const groups: ScheduleEntryRow[][] = [];
  for (const e of todaysEntries) {
    const g = replacedBy(e)
      ? undefined
      : groups.find((g) => {
          const last = g[g.length - 1]!;
          return last.teaching_assignment_id === e.teaching_assignment_id && last.period_no + 1 === e.period_no && !replacedBy(last);
        });
    if (g) g.push(e);
    else groups.push([e]);
  }
  const openGroup = groups.find((g) => g.some((e) => e.id === openEntryId) && !replacedBy(g[0]!)) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด" className="table-panel rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[52rem] table-fixed text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="w-24 px-4 py-3">รหัสวิชา</th>
                  <th className="px-4 py-3">ชื่อวิชา</th>
                  <th className="w-28 px-4 py-3">แผนก</th>
                  <th className="w-24 px-4 py-3">ระดับชั้น</th>
                  <th className="w-24 px-4 py-3">ห้องเรียน</th>
                  <th className="w-28 px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="h-14 border-t border-border first:border-t-0">
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-4" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-14" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-32" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-16" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-12" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-12" />
                    </td>
                    <td className="px-4 py-0 text-center">
                      <Skeleton className="mx-auto h-4 w-16 rounded-full" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : todaysEntries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีคาบสอนของคุณในวันนี้" />
        </div>
      ) : openGroup ? (
        <PeriodCheckInGrid
          key={`${openGroup[0]!.id}-${date}`}
          entries={openGroup}
          assignmentEntryIds={allEntries
            .filter((e) => e.teaching_assignment_id === openGroup[0]!.teaching_assignment_id)
            .map((e) => e.id)}
          subject={subjects.find((s) => s.id === openGroup[0]!.teaching_assignment.subject_id) ?? null}
          date={date}
          academicYear={academicYear}
          termStart={activeTerm?.start_date ?? null}
          termEnd={activeTerm?.end_date ?? null}
          onBack={() => setOpenEntryId(null)}
        />
      ) : (
        <div className="table-panel rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[52rem] table-fixed text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="w-24 px-4 py-3">รหัสวิชา</th>
                  <th className="px-4 py-3">ชื่อวิชา</th>
                  <th className="w-28 px-4 py-3">แผนก</th>
                  <th className="w-24 px-4 py-3">ระดับชั้น</th>
                  <th className="w-24 px-4 py-3">ห้องเรียน</th>
                  <th className="w-28 px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const e = g[0]!;
                  const subject = subjects.find((s) => s.id === e.teaching_assignment.subject_id);
                  const classroom = classroomOf(e.teaching_assignment.classroom_id);
                  const activity = replacedBy(e);
                  return (
                    <tr
                      key={e.id}
                      onClick={activity ? undefined : () => setOpenEntryId(e.id)}
                      className={cn("h-14 border-t border-border first:border-t-0", activity ? "text-muted-foreground" : "cursor-pointer")}
                    >
                      <td className="truncate px-4 py-0">{subject?.code ?? "—"}</td>
                      <td className="truncate px-4 py-0">{subject?.name_th ?? "—"}</td>
                      <td className="truncate px-4 py-0">{department?.name ?? "—"}</td>
                      <td className="truncate px-4 py-0">{gradeLevelName(e.teaching_assignment.classroom_id)}</td>
                      <td className="truncate px-4 py-0">{classroom?.name ?? "—"}</td>
                      <td className="px-4 py-0 text-center">
                        <span
                          title={activity ?? undefined}
                          className={cn(
                            "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs",
                            activity
                              ? "bg-accent-soft text-accent"
                              : takenSet.has(e.id)
                                ? "bg-success/15 text-success"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {activity ? `กิจกรรม: ${activity}` : takenSet.has(e.id) ? "เช็คแล้ว" : "ยังไม่เช็ค"}
                        </span>
                      </td>
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

function PeriodCheckInGrid({
  entries,
  assignmentEntryIds,
  subject,
  date,
  academicYear,
  termStart,
  termEnd,
  onBack,
}: {
  entries: ScheduleEntryRow[];
  assignmentEntryIds: string[];
  subject: Subject | null;
  date: string;
  academicYear: number;
  termStart: string | null;
  termEnd: string | null;
  onBack: () => void;
}) {
  const entry = entries[0]!;
  const { data: roster = [], isLoading: rosterLoading } = useClassroomRoster(
    entry.teaching_assignment.classroom_id,
    academicYear,
  );
  // No term dates set → fall back to the whole academic year (พ.ค. – เม.ย.).
  const ce = academicYear - 543;
  const start = termStart ?? `${ce}-05-01`;
  const end = termEnd ?? `${ce + 1}-04-30`;
  const { data: records = [], isLoading: recordsLoading } = usePeriodAttendanceByEntries(assignmentEntryIds, start, end);
  const [view, setView] = useState<"term" | "month" | "day">("term");
  const [month, setMonth] = useState(date.slice(0, 7));
  const [day, setDay] = useState(date);
  const byDay = view === "day";
  const [picked, setPicked] = useState<(typeof roster)[number] | null>(null);

  const byStudent = useMemo(() => {
    const map = new Map<string, typeof records>();
    // Back-to-back periods of one day are saved as one mark per period: count each student-day once.
    const seen = new Set<string>();
    for (const r of records) {
      if (view === "month" && !r.date.startsWith(month)) continue;
      const k = `${r.student_id}|${r.date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      map.set(r.student_id, [...(map.get(r.student_id) ?? []), r]);
    }
    return map;
  }, [records, view, month]);

  const loading = rosterLoading || recordsLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="toolbar shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="กลับ"
          title="กลับ"
          className="tappable inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-accent hover:bg-muted"
        >
          <ChevronBack className="h-4 w-4" />
        </button>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {subject?.code ?? "—"} {subject?.name_th ?? ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            className="w-32 min-w-0"
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
            aria-label="มุมมอง"
          >
            <option value="term">ทั้งเทอม</option>
            <option value="month">รายเดือน</option>
            <option value="day">รายวัน</option>
          </Select>
          {view === "month" && (
            <Input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="w-40"
              aria-label="เดือน"
            />
          )}
          {byDay && (
            <Input
              type="date"
              value={day}
              min={start}
              max={todayIso()}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="w-40"
              aria-label="วันที่"
            />
          )}
        </div>
      </div>
      {loading ? (
        <div role="status" aria-label="กำลังโหลด" className="flex flex-1 items-center justify-center">
          <Spinner className="h-4 w-4" />
        </div>
      ) : roster.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
        </div>
      ) : (
        <div className="table-panel rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[36rem] table-fixed text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="w-64 px-4 py-3">นักเรียน</th>
                  {!byDay ? (
                    STATUS_ORDER.map((st) => (
                      <th key={st} className={cn("px-4 py-3 text-right", STATUS_TEXT[st])}>
                        {STATUS_LABEL[st]}
                      </th>
                    ))
                  ) : (
                    <>
                      <th className="w-32 px-4 py-3 text-center">สถานะ</th>
                      <th className="px-4 py-3">หมายเหตุ</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const name = `${s.first_name} ${s.last_name}`;
                  const mine = byStudent.get(s.id) ?? [];
                  const counts = summarizeAttendance(mine);
                  const rec = !byDay ? null : mine.find((r) => r.date === day);
                  return (
                    <tr key={s.id} className="h-14 border-t border-border first:border-t-0">
                      <td className="px-4 py-0">
                        <button type="button" onClick={() => setPicked(s)} className="flex min-w-0 items-center gap-3 text-left">
                          <Avatar name={name} src={s.profile ? avatarUrl(s.profile) : null} className="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <p className="font-mono text-xs tabular-nums text-muted-foreground">{s.student_code}</p>
                          </div>
                        </button>
                      </td>
                      {!byDay ? (
                        STATUS_ORDER.map((st) => (
                          <td
                            key={st}
                            className={cn("px-4 py-0 text-right font-medium tabular-nums", counts[st] ? STATUS_TEXT[st] : "text-muted-foreground/50")}
                          >
                            {counts[st]}
                          </td>
                        ))
                      ) : (
                        <>
                          <td className="px-4 py-0 text-center">
                            {rec ? (
                              <span
                                className={cn(
                                  "inline-flex h-9 min-w-14 items-center justify-center rounded-md px-3 text-[13px] font-semibold",
                                  SEGMENT_STYLE[rec.status],
                                )}
                              >
                                {STATUS_LABEL[rec.status]}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="truncate px-4 py-0 text-muted-foreground">{rec?.note ?? ""}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Sheet open={!!picked} onOpenChange={(o) => !o && setPicked(null)} title={picked ? `${picked.first_name} ${picked.last_name}` : ""} closable bottomOnPhone>
        {picked && (
          <StudentAttendanceCalendar student={picked} assignmentEntryIds={assignmentEntryIds} />
        )}
      </Sheet>
    </div>
  );
}

function StudentAttendanceCalendar({
  student,
  assignmentEntryIds,
}: {
  student: { id: string; department_id: string };
  assignmentEntryIds: string[];
}) {
  const useMine = (start: string, end: string) => {
    const q = usePeriodAttendanceByEntries(assignmentEntryIds, start, end);
    const seen = new Set<string>();
    const data = q.data?.filter((r) => {
      if (r.student_id !== student.id || seen.has(r.date)) return false;
      seen.add(r.date);
      return true;
    });
    return { data, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
  };
  return (
    <AttendanceMonthView
      departmentId={student.department_id}
      useRecords={useMine}
      holiday={(iso, events) =>
        events.find((e) => !e.students_attend && (e.departmentIds.length === 0 || e.departmentIds.includes(student.department_id)) && iso >= e.start_date && iso <= e.end_date)?.name ?? null
      }
    />
  );
}
