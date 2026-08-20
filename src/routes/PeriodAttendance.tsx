import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack } from "@/components/icons";
import { Button, Card, EmptyState, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useActiveAcademicYear, useActiveTerm } from "@/hooks/useAcademicTerms";
import { useClassroomRoster, summarizeAttendance } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import {
  type PeriodAttendanceDraft,
  useSavePeriodAttendance,
  usePeriodAttendance,
  usePeriodAttendanceRange,
  usePeriodAttendanceTakenSet,
} from "@/hooks/usePeriodAttendance";
import { useTeacherSchedule, type ScheduleEntryRow } from "@/hooks/useSchedule";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { useApprovedLeaveOnDate } from "@/hooks/useStudentLeave";
import type { AttendanceStatus, Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------- period check-in
// เช็คชื่อรายคาบ ("บันทึกการเข้าเรียน") — keyed by (schedule_entry_id, date),
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
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present:
    "bg-emerald-400 text-emerald-950 ring-1 ring-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800",
  late:
    "bg-amber-400 text-amber-950 ring-1 ring-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800",
  absent: "bg-red-400 text-red-950 ring-1 ring-red-700 dark:bg-red-950 dark:text-red-300 dark:ring-red-800",
  leave:
    "bg-slate-300 text-slate-800 ring-1 ring-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600",
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentAcademicYear = () => new Date().getFullYear() + 543;
const daysInMonth = (ceYear: number, month: number) => new Date(ceYear, month, 0).getDate();

export function PeriodAttendance() {
  const { profile: me } = useAuth();
  const isTeacher = me ? (me.roles.includes("teacher") as boolean) : false;

  if (!me || !isTeacher) {
    return <Card className="text-sm text-muted-foreground">เมนูนี้สำหรับครูผู้สอนเท่านั้น</Card>;
  }

  return (
    <div className="page-fill">
      <PeriodCheckInPanel
        teacherId={me.id}
        isTeacher={isTeacher}
        departmentId={me.department_id ?? ""}
        recorderId={me.id}
      />
    </div>
  );
}

function PeriodCheckInPanel({
  teacherId,
  isTeacher,
  departmentId,
  recorderId,
}: {
  teacherId: string;
  isTeacher: boolean;
  departmentId: string;
  recorderId: string;
}) {
  const [date, setDate] = useState(todayIso());
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const { data: departments = [] } = useDepartments();
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? currentAcademicYear();
  const { data: activeTerm } = useActiveTerm(departmentId || null);
  const term: 1 | 2 = activeTerm?.term_type === "term2" ? 2 : 1;
  const scheduleTerm = splitsByTerm ? term : null;

  const { data: allEntries = [], isLoading } = useTeacherSchedule(
    isTeacher ? teacherId : null,
    academicYear,
    scheduleTerm,
  );
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

  const openEntry = todaysEntries.find((e) => e.id === openEntryId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setOpenEntryId(null);
          }}
          className="w-40"
          aria-label="วันที่"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : todaysEntries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีคาบสอนของคุณในวันนี้" />
        </div>
      ) : openEntry ? (
        <PeriodCheckInGrid
          key={`${openEntry.id}-${date}`}
          entry={openEntry}
          subject={subjects.find((s) => s.id === openEntry.teaching_assignment.subject_id) ?? null}
          date={date}
          academicYear={academicYear}
          recorderId={recorderId}
          onBack={() => setOpenEntryId(null)}
        />
      ) : (
        <div className="table-panel">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[52rem] table-fixed text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-14 px-3 py-2 font-medium">คาบ</th>
                  <th className="w-24 px-3 py-2 font-medium">รหัสวิชา</th>
                  <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                  <th className="w-28 px-3 py-2 font-medium">แผนก</th>
                  <th className="w-24 px-3 py-2 font-medium">ระดับชั้น</th>
                  <th className="w-24 px-3 py-2 font-medium">ห้องเรียน</th>
                  <th className="w-28 px-3 py-2 text-center font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {todaysEntries.map((e) => {
                  const subject = subjects.find((s) => s.id === e.teaching_assignment.subject_id);
                  const classroom = classroomOf(e.teaching_assignment.classroom_id);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setOpenEntryId(e.id)}
                      className="cursor-pointer border-t border-border hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 text-muted-foreground">{e.period_no}</td>
                      <td className="truncate px-3 py-2">{subject?.code ?? "—"}</td>
                      <td className="truncate px-3 py-2">{subject?.name_th ?? "—"}</td>
                      <td className="truncate px-3 py-2">{department?.name ?? "—"}</td>
                      <td className="truncate px-3 py-2">{gradeLevelName(e.teaching_assignment.classroom_id)}</td>
                      <td className="truncate px-3 py-2">{classroom?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs",
                            takenSet.has(e.id) ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {takenSet.has(e.id) ? "เช็คแล้ว" : "ยังไม่เช็ค"}
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
  entry,
  subject,
  date,
  academicYear,
  recorderId,
  onBack,
}: {
  entry: ScheduleEntryRow;
  subject: Subject | null;
  date: string;
  academicYear: number;
  recorderId: string;
  onBack: () => void;
}) {
  const toast = useToast();
  const { data: roster = [], isLoading: rosterLoading } = useClassroomRoster(
    entry.teaching_assignment.classroom_id,
    academicYear,
  );
  const { data: existing = [], isLoading: recordsLoading } = usePeriodAttendance(entry.id, date);
  const studentIds = useMemo(() => roster.map((s) => s.id), [roster]);
  const { data: lockedSet = new Set<string>() } = useApprovedLeaveOnDate(studentIds, date);
  const save = useSavePeriodAttendance();

  const monthStart = `${date.slice(0, 7)}-01`;
  const monthEnd = `${date.slice(0, 7)}-${String(daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)))).padStart(2, "0")}`;
  const { data: monthRecords = [] } = usePeriodAttendanceRange(entry.id, monthStart, monthEnd);
  const monthCountsByStudent = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeAttendance>>();
    for (const s of roster) {
      map.set(
        s.id,
        summarizeAttendance(monthRecords.filter((r) => r.student_id === s.id)),
      );
    }
    return map;
  }, [roster, monthRecords]);

  const existingByStudent = useMemo(() => new Map(existing.map((r) => [r.student_id, r])), [existing]);
  const [marks, setMarks] = useState<Map<string, { status: AttendanceStatus | null; note: string }>>(
    () =>
      new Map(
        roster.map((s) => {
          if (lockedSet.has(s.id)) return [s.id, { status: "leave" as AttendanceStatus, note: "" }];
          const rec = existingByStudent.get(s.id);
          return [s.id, { status: rec?.status ?? null, note: rec?.note ?? "" }];
        }),
      ),
  );

  const remaining = roster.filter((s) => !marks.get(s.id)?.status).length;

  function setStatus(id: string, status: AttendanceStatus) {
    if (lockedSet.has(id)) return; // server also force-locks this to 'leave' — see migration 0037
    setMarks((prev) => {
      const next = new Map(prev);
      const current = prev.get(id)?.status ?? null;
      next.set(id, { status: current === status ? null : status, note: prev.get(id)?.note ?? "" });
      return next;
    });
  }

  function setNote(id: string, note: string) {
    setMarks((prev) => {
      const next = new Map(prev);
      next.set(id, { status: prev.get(id)?.status ?? null, note });
      return next;
    });
  }

  function markAllPresent() {
    setMarks((prev) => {
      const next = new Map(prev);
      for (const s of roster) {
        if (lockedSet.has(s.id)) continue;
        next.set(s.id, { status: "present", note: prev.get(s.id)?.note ?? "" });
      }
      return next;
    });
  }

  function submit() {
    const rows: PeriodAttendanceDraft[] = roster.map((s) => {
      const mark = marks.get(s.id)!;
      return {
        student_id: s.id,
        schedule_entry_id: entry.id,
        date,
        status: mark.status as AttendanceStatus,
        note: mark.note.trim() || null,
        recorded_by: recorderId,
      };
    });
    save.mutate(rows, {
      onSuccess: () => toast("บันทึกเช็คชื่อสำเร็จ"),
      onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
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
          คาบ {entry.period_no} · {subject?.code ?? "—"} {subject?.name_th ?? ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markAllPresent}>
            มาทั้งหมด
          </Button>
        </div>
      </div>
      {rosterLoading || recordsLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : roster.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
        </div>
      ) : (
        <>
          <div className="table-panel">
            <div className="table-panel-scroll">
              <table className="w-full min-w-[44rem] table-fixed text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-24 px-3 py-2 font-medium">รหัสนักเรียน</th>
                    <th className="w-48 px-3 py-2 font-medium">รายชื่อ</th>
                    <th className="w-36 px-3 py-2 text-center font-medium">สถานะ</th>
                    <th className="px-3 py-2 text-center font-medium">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => {
                    const name = `${s.first_name} ${s.last_name}`;
                    const mark = marks.get(s.id) ?? { status: null, note: "" };
                    const locked = lockedSet.has(s.id);
                    const noteOpen = Boolean(mark.status && mark.status !== "present" && !locked);
                    return (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-3 py-2">{s.student_code}</td>
                        <td className="truncate px-3 py-2 font-medium">{name}</td>
                        <td className="px-3 py-2">
                          {locked ? (
                            <div className="flex justify-center">
                              <span
                                className={cn(
                                  "inline-flex h-7 items-center justify-center rounded-full px-2 text-[10px] font-medium",
                                  STATUS_STYLE.leave,
                                )}
                              >
                                {STATUS_LABEL.leave}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-center gap-2">
                              {STATUS_ORDER.map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => setStatus(s.id, st)}
                                  className={cn(
                                    "tappable inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                                    mark.status === st
                                      ? STATUS_STYLE[st]
                                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                                  )}
                                >
                                  {STATUS_LABEL[st]}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                              {STATUS_ORDER.map((st) => `${STATUS_LABEL[st]} ${monthCountsByStudent.get(s.id)?.[st] ?? 0}`).join(" · ")}
                            </span>
                            <Input
                              value={mark.note}
                              onChange={(e) => setNote(s.id, e.target.value)}
                              placeholder="หมายเหตุ (ถ้ามี)"
                              disabled={!noteOpen}
                              className={cn("h-7 text-[10px]", !noteOpen && "invisible")}
                              aria-label={`หมายเหตุของ ${name}`}
                              tabIndex={noteOpen ? undefined : -1}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {remaining === 0 ? `ครบ ${roster.length} คน` : `เหลืออีก ${remaining} คน`}
            </span>
            <Button onClick={submit} disabled={remaining > 0 || save.isPending}>
              {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกเช็คชื่อ"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
