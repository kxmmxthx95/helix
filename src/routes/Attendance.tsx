import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "@/components/icons";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useMobileHeaderEnd } from "@/components/MobileHeaderSlot";
import { Avatar, Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { useActiveTerm } from "@/hooks/useAcademicTerms";
import {
  useAttendanceRange,
  useClassroomRoster,
  useHomeroomClassrooms,
  useMyClassroom,
  summarizeAttendance,
} from "@/hooks/useAttendance";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useClassrooms } from "@/hooks/useStatusManagement";
import { AttendanceMonthView } from "@/routes/Dashboard";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/database.types";
import { avatarUrl } from "@/hooks/useAvatar";
import type { StudentListItem } from "@/hooks/useStudents";
import { canManage, isOrgWide, isSelfScoped } from "@/lib/roles";
import { cn, todayIso } from "@/lib/utils";
import { closingEvent } from "@/lib/planSlots";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "มา",
  late: "สาย",
  absent: "ขาด",
  leave: "ลา",
};
/** Soft tint of the status colour — the segmented check-in buttons in the dashboard drawers and the read-only badge. */
export const SEGMENT_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  absent: "bg-destructive/15 text-destructive",
  leave: "bg-fill-strong text-foreground",
};
const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
/** Selected check-in buttons + summary badges — light: saturated fill; dark: deep fill + mint text. */
export const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present:
    "bg-emerald-400 text-emerald-950 ring-1 ring-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800",
  late:
    "bg-amber-400 text-amber-950 ring-1 ring-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800",
  absent: "bg-red-400 text-red-950 ring-1 ring-red-700 dark:bg-red-950 dark:text-red-300 dark:ring-red-800",
  leave:
    "bg-slate-300 text-slate-800 ring-1 ring-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600",
};

const currentAcademicYear = () => new Date().getFullYear() + 543;

export function Attendance() {
  const { profile: me, myStudent } = useAuth();
  const manager = me ? canManage(me.roles) : false;
  const orgWide = me ? isOrgWide(me.roles) : false;
  const isTeacher = me ? (me.roles.includes("teacher") as boolean) : false;
  const isStudent = me ? isSelfScoped(me.roles) : false;
  const academicYear = currentAcademicYear();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeMin, setRangeMin] = useState<string | undefined>();
  const [range, setRange] = useState<Range>(() => ({ view: "term", month: todayIso().slice(0, 7), day: todayIso() }));

  // student path: read-only summary of their own classroom, no picker.
  const { data: myClassroom } = useMyClassroom(isStudent ? (myStudent?.id ?? null) : null, academicYear);

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

  const allowed = !!me && (manager || isTeacher || isStudent);
  const activeDeptRooms = deptClassrooms.filter((c) => c.is_active);

  const activeFilterCount = manager
    ? [pickedDept, pickedGrade, pickedRoomId].filter(Boolean).length
    : [pickedHomeroomId].filter(Boolean).length;

  const headerFilterButton = useMemo(
    () =>
      allowed && !isStudent ? (
        <Button
          variant="outline"
          size="icon"
          className="relative shrink-0"
          onClick={() => setFiltersOpen(true)}
          aria-label="ตัวกรอง"
        >
          <SlidersHorizontal className="h-3 w-3" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      ) : null,
    [allowed, isStudent, activeFilterCount],
  );

  useMobileHeaderEnd(headerFilterButton);

  if (!allowed) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  if (isStudent) {
    return (
      <div className="page-fill">
        {myClassroom ? (
          <SummaryPanel classroomId={myClassroom.id} academicYear={academicYear} departmentId={myStudent?.department_id ?? null} canOpen={false} range={range} onRangeChange={setRange} onMin={setRangeMin} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีห้องเรียนในปีการศึกษานี้" />
          </div>
        )}
      </div>
    );
  }

  const classroomId = manager ? pickedRoomId : pickedHomeroomId;
  const homeroom = homerooms.find((h) => h.id === pickedHomeroomId);
  const departmentId = manager ? pickedDept : (homeroom?.department_id ?? "");

  const scopeFilters = manager ? (
    <>
      <Field label="แผนก">
        <Select
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
      </Field>
      <Field label="ชั้น">
        <Select
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
      </Field>
      <Field label="ห้อง">
        <Select
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
      </Field>
    </>
  ) : (
    <Field label="ห้อง">
      <Select
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
    </Field>
  );

  return (
    <div className="page-fill">
      <div className="hidden shrink-0 gap-2 lg:flex">
        {manager ? (
          <>
            <Select
              className="min-w-0 flex-1"
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
              className="min-w-0 flex-1"
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
              className="min-w-0 flex-1"
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
            className="min-w-0 flex-[3]"
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
        {classroomId && <RangeControls range={range} onChange={setRange} min={rangeMin} />}
      </div>

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="ตัวกรอง"
        footer={
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            ดูผลลัพธ์
          </Button>
        }
      >
        <div className="space-y-4">
          {scopeFilters}
        </div>
      </Sheet>

      {!classroomId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="เลือกห้องเรียน"
            description={
              !manager && homerooms.length === 0
                ? "ยังไม่ได้รับมอบหมายเป็นครูประจำชั้นปีนี้"
                : "เลือกห้องด้านบนเพื่อดูสรุปการเข้าเรียน"
            }
          />
        </div>
      ) : (
        <SummaryPanel classroomId={classroomId} academicYear={academicYear} departmentId={departmentId || null} canOpen range={range} onRangeChange={setRange} onMin={setRangeMin} />
      )}
    </div>
  );
}

// -------------------------------------------------------------- attendance summary

const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: "text-success",
  late: "text-warning",
  absent: "text-destructive",
  leave: "text-muted-foreground",
};

/** Read-only summary of a room: whole term / one month / one day. Marking happens from the dashboard sheet. */
type Range = { view: "term" | "month" | "day"; month: string; day: string };

function RangeControls({ range, onChange, min, className }: { range: Range; onChange: (r: Range) => void; min?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select className="w-32 min-w-0" value={range.view} onChange={(e) => onChange({ ...range, view: e.target.value as Range["view"] })} aria-label="มุมมอง">
        <option value="term">ทั้งเทอม</option>
        <option value="month">รายเดือน</option>
        <option value="day">รายวัน</option>
      </Select>
      {range.view === "month" && (
        <Input type="month" value={range.month} onChange={(e) => e.target.value && onChange({ ...range, month: e.target.value })} className="w-40" aria-label="เดือน" />
      )}
      {range.view === "day" && (
        <Input type="date" value={range.day} min={min} max={todayIso()} onChange={(e) => e.target.value && onChange({ ...range, day: e.target.value })} className="w-40" aria-label="วันที่" />
      )}
    </div>
  );
}

/** Read-only summary of a room: whole term / one month / one day. Marking happens from the dashboard sheet. */
function SummaryPanel({
  classroomId,
  academicYear,
  departmentId,
  canOpen,
  range,
  onRangeChange,
  onMin,
}: {
  classroomId: string;
  academicYear: number;
  departmentId: string | null;
  canOpen: boolean;
  range: Range;
  onRangeChange: (r: Range) => void;
  onMin: (min: string) => void;
}) {
  const { view, month, day } = range;
  const [picked, setPicked] = useState<StudentListItem | null>(null);
  const byDay = view === "day";

  // No term dates set → whole academic year (พ.ค. – เม.ย.).
  const { data: term } = useActiveTerm(departmentId);
  const ce = academicYear - 543;
  const start = term?.start_date ?? `${ce}-05-01`;
  const end = term?.end_date ?? `${ce + 1}-04-30`;
  useEffect(() => onMin(start), [start, onMin]);

  const { data: roster = [], isLoading: rosterLoading } = useClassroomRoster(classroomId, academicYear);
  const { data: records = [], isLoading: recordsLoading } = useAttendanceRange({ classroomId, startDate: start, endDate: end });

  const byStudent = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      if (view === "month" && !r.date.startsWith(month)) continue;
      map.set(r.student_id, [...(map.get(r.student_id) ?? []), r]);
    }
    return map;
  }, [records, view, month]);

  const loading = rosterLoading || recordsLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <RangeControls range={range} onChange={onRangeChange} min={start} className={cn("shrink-0 justify-end", canOpen && "lg:hidden")} />

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
                  const rec = byDay ? mine.find((r) => r.date === day && r.status) : null;
                  const who = (
                    <>
                      <Avatar name={name} src={s.profile ? avatarUrl(s.profile) : null} className="h-9 w-9 text-xs" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">{s.student_code}</p>
                      </div>
                    </>
                  );
                  return (
                    <tr key={s.id} className="h-14 border-t border-border first:border-t-0">
                      <td className="px-4 py-0">
                        {canOpen ? (
                          <button type="button" onClick={() => setPicked(s)} className="flex min-w-0 items-center gap-3 text-left">
                            {who}
                          </button>
                        ) : (
                          <div className="flex min-w-0 items-center gap-3">{who}</div>
                        )}
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
                            {rec?.status ? (
                              <span className={cn("inline-flex h-9 min-w-14 items-center justify-center rounded-md px-3 text-[13px] font-semibold", SEGMENT_STYLE[rec.status])}>
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
          <AttendanceMonthView
            departmentId={picked.department_id}
            useRecords={(startDate, endDate) => useAttendanceRange({ studentId: picked.id, startDate, endDate })}
            holiday={(iso, events) =>
              closingEvent(iso, events.filter((e) => e.departmentIds.length === 0 || e.departmentIds.includes(picked.department_id)))?.name ?? null
            }
          />
        )}
      </Sheet>
    </div>
  );
}
