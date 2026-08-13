import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAcademicEvents, useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import {
  type AttendanceDraft,
  useAttendanceForDate,
  useAttendanceRange,
  useClassroomRoster,
  useHomeroomClassrooms,
  useSaveAttendance,
  summarizeAttendance,
} from "@/hooks/useAttendance";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import {
  type PeriodAttendanceDraft,
  useSavePeriodAttendance,
  usePeriodAttendance,
  usePeriodAttendanceTakenSet,
} from "@/hooks/usePeriodAttendance";
import { useTeacherSchedule, type ScheduleEntryRow } from "@/hooks/useSchedule";
import { useClassrooms } from "@/hooks/useStatusManagement";
import {
  usePendingStudentLeaveApprovals,
  useApprovedLeaveOnDate,
  useSetStudentLeaveStatus,
  type PendingStudentLeaveRequest,
} from "@/hooks/useStudentLeave";
import type { AttendanceRecord, AttendanceStatus, Student } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "มา",
  late: "สาย",
  absent: "ขาด",
  leave: "ลา",
};
const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  absent: "bg-destructive/15 text-destructive",
  leave: "bg-secondary text-secondary-foreground",
};

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "long" }).format(new Date(2000, i, 1)),
);

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentAcademicYear = () => new Date().getFullYear() + 543;
const daysInMonth = (ceYear: number, month: number) => new Date(ceYear, month, 0).getDate();

type ViewTab = "checkin" | "summary" | "leave_requests" | "period_checkin";

export function Attendance() {
  const { profile: me } = useAuth();
  const manager = me ? canManage(me.roles) : false;
  const orgWide = me ? isOrgWide(me.roles) : false;
  const isTeacher = me ? (me.roles.includes("teacher") as boolean) : false;
  const academicYear = currentAcademicYear();

  const [view, setView] = useState<ViewTab>("checkin");

  // manager path: department → grade level → classroom.
  const [pickedDept, setPickedDept] = useState(!orgWide && me?.department_id ? me.department_id : "");
  const [pickedGrade, setPickedGrade] = useState("");
  const [pickedRoomId, setPickedRoomId] = useState("");
  const { data: departments = [] } = useDepartments();
  const { data: gradeLevels = [] } = useGradeLevels(pickedDept || null);
  const { data: deptClassrooms = [] } = useClassrooms(pickedGrade || null);

  // teacher path: their own homeroom room(s) for the year.
  const { data: homerooms = [] } = useHomeroomClassrooms(isTeacher && !manager ? me!.id : null, academicYear);
  const [pickedHomeroomId, setPickedHomeroomId] = useState("");

  useEffect(() => setPickedGrade(""), [pickedDept]);
  useEffect(() => setPickedRoomId(""), [pickedGrade]);
  useEffect(() => {
    if (homerooms.length === 1) setPickedHomeroomId(homerooms[0]!.id);
  }, [homerooms]);

  if (!me || (!manager && !isTeacher)) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  const activeDeptRooms = deptClassrooms.filter((c) => c.is_active);
  const classroomId = manager ? pickedRoomId : pickedHomeroomId;
  const gradeLevel = gradeLevels.find((g) => g.id === pickedGrade);
  const homeroom = homerooms.find((h) => h.id === pickedHomeroomId);
  const classroomLabel = manager
    ? gradeLevel && pickedRoomId
      ? `${gradeLevel.name}/${activeDeptRooms.find((c) => c.id === pickedRoomId)?.name ?? deptClassrooms.find((c) => c.id === pickedRoomId)?.name ?? ""}`
      : ""
    : (homeroom?.label ?? "");
  const departmentId = manager ? pickedDept : (homeroom?.department_id ?? "");

  return (
    <div className="page-fill">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        {manager ? (
          <>
            <Select
              className="min-w-0"
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
            <Select
              className="min-w-0"
              value={pickedGrade}
              onChange={(e) => setPickedGrade(e.target.value)}
              aria-label="ชั้น"
              placeholder="เลือกชั้น"
              disabled={!pickedDept}
            >
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Select
              className="min-w-0"
              value={pickedRoomId}
              onChange={(e) => setPickedRoomId(e.target.value)}
              aria-label="ห้อง"
              placeholder="เลือกห้อง"
              disabled={!pickedGrade}
            >
              {activeDeptRooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <Select
            className="col-span-3 min-w-0"
            value={pickedHomeroomId}
            onChange={(e) => setPickedHomeroomId(e.target.value)}
            aria-label="ห้อง"
            placeholder="เลือกห้อง"
          >
            {homerooms.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </Select>
        )}
        <Select
          className="min-w-0"
          value={view}
          onChange={(e) => setView(e.target.value as ViewTab)}
          aria-label="มุมมอง"
        >
          <option value="checkin">เช็คชื่อ</option>
          <option value="summary">สรุปรายเดือน</option>
          <option value="leave_requests">คำขอลา</option>
          <option value="period_checkin">เช็คชื่อรายคาบ</option>
        </Select>
      </div>

      {view === "leave_requests" ? (
        <LeaveRequestsPanel approverId={me.id} />
      ) : view === "period_checkin" ? (
        <PeriodCheckInPanel
          teacherId={me.id}
          isTeacher={isTeacher}
          departmentId={me.department_id ?? ""}
          recorderId={me.id}
        />
      ) : !classroomId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="เลือกห้องเรียน"
            description={
              !manager && homerooms.length === 0
                ? "ยังไม่ได้รับมอบหมายเป็นครูประจำชั้นปีนี้"
                : "เลือกห้องด้านบนเพื่อเช็คชื่อ"
            }
          />
        </div>
      ) : view === "checkin" ? (
        <CheckInPanel
          classroomId={classroomId}
          academicYear={academicYear}
          departmentId={departmentId}
          recorderId={me.id}
        />
      ) : (
        <SummaryPanel classroomId={classroomId} classroomLabel={classroomLabel} academicYear={academicYear} />
      )}
    </div>
  );
}

// -------------------------------------------------------- student leave requests
// Not gated by the classroom picker above — RLS already scopes the pending
// list to whatever this teacher/manager may approve (current homeroom, or
// can_manage() in department), same shape as the staff ApprovalsCard in
// src/routes/Leave.tsx. Approval auto-fills attendance_records via a DB
// trigger (migration 0035) — nothing to do here beyond flipping the status.

function LeaveRequestsPanel({ approverId }: { approverId: string }) {
  const { data: pending = [], isLoading } = usePendingStudentLeaveApprovals();
  const setStatus = useSetStudentLeaveStatus();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีคำขอลารออนุมัติ" />
      </div>
    );
  }

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">คำขอลารออนุมัติ ({pending.length})</p>
      <ul className="divide-y divide-border text-sm">
        {pending.map((r: PendingStudentLeaveRequest) => (
          <li key={r.id} className="space-y-1.5 py-2">
            <p className="font-medium">
              {r.student ? `${r.student.student_code} · ${r.student.first_name} ${r.student.last_name}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.start_date} – {r.end_date} ({r.days} วัน) · {r.reason}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: r.id, status: "approved", approvedBy: approverId })}
              >
                อนุมัติ
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: r.id, status: "rejected", approvedBy: approverId })}
              >
                ไม่อนุมัติ
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ----------------------------------------------------------- period check-in
// เช็คชื่อรายคาบ — separate from the homeroom CheckInPanel below: keyed by
// (schedule_entry_id, date) instead of (classroom_id, date), taken by the
// subject teacher of that period. Not gated by the classroom picker — a
// subject teacher may not have a homeroom at all. See migration 0037: the
// daily attendance_records('leave') row syncs/un-syncs via a DB trigger
// whenever ALL of a student's periods that day are 'leave' — nothing to do
// here beyond saving each period's own marks.

const TERM_LABEL: Record<number, string> = { 1: "ภาคเรียน 1", 2: "ภาคเรียน 2" };

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
  const [term, setTerm] = useState<1 | 2>(1);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const { data: departments = [] } = useDepartments();
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? currentAcademicYear();
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

  const openEntry = todaysEntries.find((e) => e.id === openEntryId) ?? null;

  if (!isTeacher) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีสิทธิ์เข้าถึง" description="เมนูนี้สำหรับครูผู้สอนเท่านั้น" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
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
        {splitsByTerm && (
          <div className="inline-flex h-8 gap-1 rounded-lg border border-border p-0.5">
            {[1, 2].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTerm(t as 1 | 2)}
                className={cn(
                  "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                  term === t
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {TERM_LABEL[t]}
              </button>
            ))}
          </div>
        )}
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
          date={date}
          academicYear={academicYear}
          recorderId={recorderId}
          onBack={() => setOpenEntryId(null)}
        />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {todaysEntries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpenEntryId(e.id)}
                className="tappable flex w-full items-center justify-between py-2"
              >
                <span>คาบ {e.period_no}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    takenSet.has(e.id) ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {takenSet.has(e.id) ? "เช็คแล้ว" : "ยังไม่เช็ค"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PeriodCheckInGrid({
  entry,
  date,
  academicYear,
  recorderId,
  onBack,
}: {
  entry: ScheduleEntryRow;
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
        <button type="button" onClick={onBack} className="tappable text-xs text-accent underline">
          ← กลับ
        </button>
        <span className="text-xs text-muted-foreground">คาบ {entry.period_no}</span>
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
              <table className="w-full min-w-[36rem] table-fixed text-xs">
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
                          <Input
                            value={mark.note}
                            onChange={(e) => setNote(s.id, e.target.value)}
                            placeholder="หมายเหตุ (ถ้ามี)"
                            disabled={!noteOpen}
                            className={cn("h-7 text-[10px]", !noteOpen && "invisible")}
                            aria-label={`หมายเหตุของ ${name}`}
                            tabIndex={noteOpen ? undefined : -1}
                          />
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

// ------------------------------------------------------------------ check-in

function CheckInPanel({
  classroomId,
  academicYear,
  departmentId,
  recorderId,
}: {
  classroomId: string;
  academicYear: number;
  departmentId: string;
  recorderId: string;
}) {
  const [date, setDate] = useState(todayIso());
  const markAllRef = useRef<(() => void) | null>(null);
  const { data: roster = [], isLoading: rosterLoading } = useClassroomRoster(classroomId, academicYear);
  const { data: records, isLoading: recordsLoading } = useAttendanceForDate(classroomId, date);
  const { data: events = [] } = useAcademicEvents();

  const blockedEvent = useMemo(
    () =>
      events.find(
        (e) =>
          !e.students_attend &&
          date >= e.start_date &&
          date <= e.end_date &&
          (e.departmentIds.length === 0 || e.departmentIds.includes(departmentId)),
      ),
    [events, date, departmentId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
          aria-label="วันที่"
        />
        {!blockedEvent && !rosterLoading && !recordsLoading && roster.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => markAllRef.current?.()}
          >
            มาทั้งหมด
          </Button>
        )}
      </div>

      {blockedEvent ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่ต้องเช็คชื่อวันนี้" description={blockedEvent.name} />
        </div>
      ) : rosterLoading || recordsLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : roster.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
        </div>
      ) : (
        <CheckInGrid
          key={`${classroomId}-${date}`}
          classroomId={classroomId}
          date={date}
          roster={roster}
          existing={records ?? []}
          recorderId={recorderId}
          markAllRef={markAllRef}
        />
      )}
    </div>
  );
}

function CheckInGrid({
  classroomId,
  date,
  roster,
  existing,
  recorderId,
  markAllRef,
}: {
  classroomId: string;
  date: string;
  roster: Student[];
  existing: AttendanceRecord[];
  recorderId: string;
  markAllRef: MutableRefObject<(() => void) | null>;
}) {
  const toast = useToast();
  const save = useSaveAttendance();
  const existingByStudent = useMemo(() => new Map(existing.map((r) => [r.student_id, r])), [existing]);
  const [marks, setMarks] = useState<Map<string, { status: AttendanceStatus | null; note: string }>>(
    () =>
      new Map(
        roster.map((s) => {
          const rec = existingByStudent.get(s.id);
          return [s.id, { status: rec?.status ?? null, note: rec?.note ?? "" }];
        }),
      ),
  );

  const remaining = roster.filter((s) => !marks.get(s.id)?.status).length;

  markAllRef.current = () => {
    setMarks(new Map(roster.map((s) => [s.id, { status: "present" as AttendanceStatus, note: "" }])));
  };
  useEffect(() => () => {
    markAllRef.current = null;
  }, [markAllRef]);

  function setStatus(id: string, status: AttendanceStatus) {
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

  function submit() {
    const rows: AttendanceDraft[] = roster.map((s) => {
      const mark = marks.get(s.id)!;
      return {
        student_id: s.id,
        classroom_id: classroomId,
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
      <div className="table-panel">
        <div className="table-panel-scroll">
          <table className="w-full min-w-[36rem] table-fixed text-xs">
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
                const noteOpen = Boolean(mark.status && mark.status !== "present");
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2">{s.student_code}</td>
                    <td className="truncate px-3 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2">
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
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={mark.note}
                        onChange={(e) => setNote(s.id, e.target.value)}
                        placeholder="หมายเหตุ (ถ้ามี)"
                        disabled={!noteOpen}
                        className={cn("h-7 text-[10px]", !noteOpen && "invisible")}
                        aria-label={`หมายเหตุของ ${name}`}
                        tabIndex={noteOpen ? undefined : -1}
                      />
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
    </div>
  );
}

// -------------------------------------------------------------- monthly summary

function SummaryPanel({
  classroomId,
  classroomLabel,
  academicYear,
}: {
  classroomId: string;
  classroomLabel: string;
  academicYear: number;
}) {
  const [year, setYear] = useState(academicYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const ceYear = year - 543;
  const startDate = `${ceYear}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${ceYear}-${String(month).padStart(2, "0")}-${String(daysInMonth(ceYear, month)).padStart(2, "0")}`;
  const years = Array.from({ length: 4 }, (_, i) => academicYear - i);

  const { data: roster = [] } = useClassroomRoster(classroomId, year);
  const { data: records = [], isLoading } = useAttendanceRange({ classroomId, startDate, endDate });

  const byStudent = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      const arr = map.get(r.student_id) ?? [];
      arr.push(r);
      map.set(r.student_id, arr);
    }
    return map;
  }, [records]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Select
          className="w-32 min-w-0"
          value={String(month)}
          onChange={(e) => setMonth(Number(e.target.value))}
          aria-label="เดือน"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          className="w-24 min-w-0"
          value={String(year)}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="ปีการศึกษา"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">{classroomLabel}</span>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : roster.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
        </div>
      ) : (
        <div className="table-panel">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                  <th className="px-3 py-2 font-medium">รายชื่อ</th>
                  {STATUS_ORDER.map((st) => (
                    <th key={st} className="px-3 py-2 text-right font-medium">
                      {STATUS_LABEL[st]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const counts = summarizeAttendance(byStudent.get(s.id) ?? []);
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2">{s.student_code}</td>
                      <td className="px-3 py-2 font-medium">
                        {s.first_name} {s.last_name}
                      </td>
                      {STATUS_ORDER.map((st) => (
                        <td key={st} className="px-3 py-2 text-right">
                          {counts[st]}
                        </td>
                      ))}
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
