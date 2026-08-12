import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAcademicEvents } from "@/hooks/useAcademicTerms";
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
import { useClassrooms } from "@/hooks/useStatusManagement";
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

type ViewTab = "checkin" | "summary";

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
        </Select>
      </div>

      {!classroomId ? (
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
          classroomLabel={classroomLabel}
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

// ------------------------------------------------------------------ check-in

function CheckInPanel({
  classroomId,
  classroomLabel,
  academicYear,
  departmentId,
  recorderId,
}: {
  classroomId: string;
  classroomLabel: string;
  academicYear: number;
  departmentId: string;
  recorderId: string;
}) {
  const [date, setDate] = useState(todayIso());
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
        <span className="text-xs text-muted-foreground">{classroomLabel}</span>
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
}: {
  classroomId: string;
  date: string;
  roster: Student[];
  existing: AttendanceRecord[];
  recorderId: string;
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

  function setStatus(id: string, status: AttendanceStatus) {
    setMarks((prev) => {
      const next = new Map(prev);
      next.set(id, { status, note: prev.get(id)?.note ?? "" });
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
    setMarks(new Map(roster.map((s) => [s.id, { status: "present" as AttendanceStatus, note: "" }])));
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
      <div className="flex shrink-0 justify-end">
        <Button variant="outline" size="sm" onClick={markAllPresent}>
          เช็คมาทั้งหมด
        </Button>
      </div>
      <div className="table-panel">
        <div className="table-panel-scroll">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                <th className="px-3 py-2 font-medium">รายชื่อ</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const name = `${s.first_name} ${s.last_name}`;
                const mark = marks.get(s.id) ?? { status: null, note: "" };
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2">{s.student_code}</td>
                    <td className="px-3 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {STATUS_ORDER.map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setStatus(s.id, st)}
                            className={cn(
                              "tappable rounded-full px-2 py-0.5 text-[10px]",
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
                      {mark.status && mark.status !== "present" && (
                        <Input
                          value={mark.note}
                          onChange={(e) => setNote(s.id, e.target.value)}
                          placeholder="หมายเหตุ (ถ้ามี)"
                          className="h-7 text-[10px]"
                          aria-label={`หมายเหตุของ ${name}`}
                        />
                      )}
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
