import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { AttendanceMonthView } from "@/routes/Dashboard";
import { Avatar, Card, EmptyState, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useActiveAcademicYear, useActiveTerm } from "@/hooks/useAcademicTerms";
import { useClassroomRoster, summarizeAttendance } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { usePeriodAttendanceByEntries } from "@/hooks/usePeriodAttendance";
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
  const isLoading = loadingOwn || (academic && !!departmentId && loadingDept);

  // Teachers see their own assignments. The academic group adds an overview of the whole department (incl. teacherless activities).
  const [tab, setTab] = useState<"mine" | "all">(isTeacher ? "mine" : "all");
  const [gradeId, setGradeId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const overview = academic && tab === "all";
  const entries = overview ? deptEntries : ownEntries;
  const groupByAssignment = (list: ScheduleEntryRow[]) => {
    const m = new Map<string, ScheduleEntryRow[]>();
    for (const e of list) m.set(e.teaching_assignment_id, [...(m.get(e.teaching_assignment_id) ?? []), e]);
    return [...m.values()];
  };
  const assignments = useMemo(() => groupByAssignment(entries), [entries]);

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
  const { data: profiles = [] } = useProfiles({ search: "", departmentId, role: "", active: "" });
  const teacherName = (id: string | null) => {
    if (!id) return "ไม่มีครูประจำ";
    const t = profiles.find((x) => x.id === id);
    return t ? `${t.first_name} ${t.last_name}` : "—";
  };
  const classroomOf = (id: string) => classrooms.find((x) => x.id === id);
  const gradeLevelName = (classroomId: string) => {
    const code = gradeLevels.find((g) => g.id === classroomOf(classroomId)?.grade_level_id)?.code;
    return code ? gradeShortLabel(code) : "—";
  };

  // Deep link may point at either list.
  const openGroup =
    [...groupByAssignment(ownEntries), ...groupByAssignment(deptEntries)].find((g) => g.some((e) => e.id === openEntryId)) ?? null;
  const cards = useMemo(
    () =>
      assignments
        .map((g) => ({ g, subject: subjects.find((s) => s.id === g[0]!.teaching_assignment.subject_id) }))
        .filter(({ g }) => {
          if (!overview) return true;
          const ta = g[0]!.teaching_assignment;
          const room = classroomOf(ta.classroom_id);
          return (
            (!gradeId || room?.grade_level_id === gradeId) &&
            (!classroomId || ta.classroom_id === classroomId) &&
            (!filterTeacher || (filterTeacher === "none" ? ta.teacher_id === null : ta.teacher_id === filterTeacher))
          );
        })
        .sort(
          (x, y) =>
            (x.subject?.code ?? "").localeCompare(y.subject?.code ?? "") ||
            (classroomOf(x.g[0]!.teaching_assignment.classroom_id)?.name ?? "").localeCompare(
              classroomOf(y.g[0]!.teaching_assignment.classroom_id)?.name ?? "",
            ),
        ),
    [assignments, subjects, classrooms, overview, gradeId, classroomId, filterTeacher],
  );
  const teacherOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const g of assignments) ids.add(g[0]!.teaching_assignment.teacher_id ?? "none");
    return [...ids];
  }, [assignments]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {academic && !openGroup && (
        <div role="tablist" className={cn("grid border-b border-border", isTeacher ? "grid-cols-2" : "grid-cols-1")}>
          {(
            [
              ...(isTeacher ? ([["mine", "ของฉัน"]] as const) : []),
              ["all", "ภาพรวม"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "-mb-px h-11 border-b-2 text-sm font-medium",
                tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {overview && !openGroup && (
        <div className="toolbar shrink-0 flex-wrap">
          <Select
            className="min-w-0 flex-1"
            value={gradeId}
            onChange={(e) => {
              setGradeId(e.target.value);
              setClassroomId("");
            }}
            aria-label="ระดับชั้น"
          >
            <option value="">ทุกระดับชั้น</option>
            {gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {gradeShortLabel(g.code)}
              </option>
            ))}
          </Select>
          <Select className="min-w-0 flex-1" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} aria-label="ห้องเรียน">
            <option value="">ทุกห้อง</option>
            {classrooms
              .filter((c) => !gradeId || c.grade_level_id === gradeId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
          <Select className="min-w-0 flex-1" value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)} aria-label="ครูผู้สอน">
            <option value="">ครูทั้งหมด</option>
            {teacherOptions.map((id) => (
              <option key={id} value={id}>
                {teacherName(id === "none" ? null : id)}
              </option>
            ))}
          </Select>
        </div>
      )}
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description={overview ? "ไม่พบรายวิชาตามเงื่อนไข" : "ไม่มีรายวิชาที่คุณสอน"} />
        </div>
      ) : openGroup ? (
        <PeriodCheckInGrid
          key={openGroup[0]!.teaching_assignment_id}
          entry={openGroup[0]!}
          assignmentEntryIds={openGroup.map((e) => e.id)}
          subject={subjects.find((s) => s.id === openGroup[0]!.teaching_assignment.subject_id) ?? null}
          date={date}
          academicYear={academicYear}
          termStart={activeTerm?.start_date ?? null}
          termEnd={activeTerm?.end_date ?? null}
          onBack={() => setOpenEntryId(null)}
        />
      ) : (
        <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ g, subject }) => {
            const e = g[0]!;
            const classroom = classroomOf(e.teaching_assignment.classroom_id);
            return (
              <button key={e.teaching_assignment_id} type="button" onClick={() => setOpenEntryId(e.id)} className="text-left">
                <Card className="flex h-full flex-col gap-1 transition-colors hover:bg-muted/50">
                  <span className="text-xs text-muted-foreground">{subject?.code ?? "—"}</span>
                  <span className="truncate text-base font-semibold">{subject?.name_th ?? "—"}</span>
                  <span className="text-sm text-muted-foreground">
                    {gradeLevelName(e.teaching_assignment.classroom_id)} · {classroom?.name ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {overview ? teacherName(e.teaching_assignment.teacher_id) : (department?.name ?? "—")}
                  </span>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeriodCheckInGrid({
  entry,
  assignmentEntryIds,
  subject,
  date,
  academicYear,
  termStart,
  termEnd,
  onBack,
}: {
  entry: ScheduleEntryRow;
  assignmentEntryIds: string[];
  subject: Subject | null;
  date: string;
  academicYear: number;
  termStart: string | null;
  termEnd: string | null;
  onBack: () => void;
}) {
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
      <Sheet open={!!picked} onOpenChange={(o) => !o && setPicked(null)} title={picked ? `${picked.first_name} ${picked.last_name}` : ""} closable>
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
