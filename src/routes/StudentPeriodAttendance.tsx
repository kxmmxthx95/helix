import { useMemo, useState } from "react";
import { ChevronBack, ChevronForward } from "@/components/icons";
import { Skeleton } from "@/components/ui";
import {
  useAcademicEvents,
  useActiveAcademicYear,
  useActiveTerm,
  useCurrentTerm,
} from "@/hooks/useAcademicTerms";
import { summarizeAttendance, useMyClassroom } from "@/hooks/useAttendance";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useSubjectsByIds } from "@/hooks/useExamBank";
import { usePeriodAttendanceByStudent } from "@/hooks/usePeriodAttendance";
import { useAllDepartmentPeriods } from "@/hooks/usePeriodDefinitions";
import { useDepartments } from "@/hooks/useProfiles";
import { useClassroomSchedule } from "@/hooks/useSchedule";
import type { AttendanceStatus, Student } from "@/lib/database.types";
import { mergePeriods, periodTimes, teachingOrdinal } from "@/lib/periods";
import { addDays, closingEvent, eventApplies, isoDow, periodReplaced } from "@/lib/planSlots";
import { cn, todayIso } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";
import {
  AttendanceMonthView,
  LoadError,
  STATUS_CELL,
  currentAcademicYearRange,
} from "@/routes/Dashboard";

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
// One cell per day: the worst mark among that subject's periods that day.
const WORST: AttendanceStatus[] = ["absent", "late", "leave", "present"];
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

/** Student's own per-period attendance: day browser + whole-term overview. Read-only. */
export function StudentPeriodAttendanceSection({
  student,
}: {
  student: Student;
}) {
  const colors = useSubjectColors([]); // hue from กลุ่มสาระ only, like Dashboard
  const [date, setDate] = useState(todayIso);
  const [tab, setTab] = useState<"day" | "all">("day");
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const deptId = student.department_id;

  const { data: departments = [] } = useDepartments();
  const { data: year } = useActiveAcademicYear(deptId);
  const { data: curTerm } = useCurrentTerm(deptId);
  const { data: activeTerm } = useActiveTerm(deptId);
  const term =
    departments.find((d) => d.id === deptId)?.code === "SEC"
      ? (curTerm?.term ?? 1)
      : null;
  const academicYear = year ?? new Date().getFullYear() + 543;

  const { data: classroom } = useMyClassroom(student.id, academicYear);
  const { data: entries = [], isLoading: loadingEntries } =
    useClassroomSchedule(classroom?.id ?? null, academicYear, term);
  const { data: periods = [] } = useAllDepartmentPeriods(deptId);
  const { data: events = [] } = useAcademicEvents();
  const { data: subjects = [] } = useSubjectsByIds(
    [...new Set(entries.map((e) => e.teaching_assignment.subject_id))].sort(),
  );

  const term0 =
    activeTerm?.start_date && activeTerm.end_date ? activeTerm : null;
  const range = term0
    ? { start: term0.start_date!, end: term0.end_date! }
    : currentAcademicYearRange();
  const {
    data: records = [],
    isLoading,
    isError,
    refetch,
  } = usePeriodAttendanceByStudent(student.id, range.start, range.end);

  const myEvents = useMemo(
    () => events.filter((e) => eventApplies(e, deptId, student.grade_level_id)),
    [events, deptId, student.grade_level_id],
  );
  const gradePeriods = useMemo(
    () =>
      mergePeriods(
        periods.filter((p) => !p.grade_level_id),
        periods.filter(
          (p) =>
            p.grade_level_id && p.grade_level_id === student.grade_level_id,
        ),
      ),
    [periods, student.grade_level_id],
  );
  const timesOf = (day: number, no: number) =>
    periodTimes(periods, student.grade_level_id, day, no);
  const entryById = useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );

  const holiday = (iso: string) =>
    term0 && (iso < term0.start_date! || iso > term0.end_date!)
      ? "ปิดเทอม"
      : (closingEvent(iso, myEvents)?.name ?? null);
  const replaced = (iso: string, entryId: string) => {
    const e = entryById.get(entryId);
    return (
      !!e &&
      periodReplaced(iso, timesOf(e.day_of_week, e.period_no) ?? {}, myEvents)
    );
  };

  const counted = records.filter(
    (r) => !holiday(r.date) && !replaced(r.date, r.schedule_entry_id),
  );
  const bySubject = new Map<string, typeof counted>();
  for (const r of counted) {
    const sid = entryById.get(r.schedule_entry_id)?.teaching_assignment
      .subject_id;
    if (sid) bySubject.set(sid, [...(bySubject.get(sid) ?? []), r]);
  }
  const byKey = new Map(
    records
      .filter((r) => r.date === date)
      .map((r) => [r.schedule_entry_id, r.status]),
  );

  const off = holiday(date);
  const recorded = new Set(byKey.keys());
  // ponytail: entries in a group_id are parallel electives — shown only once marked, since we don't know which one the student takes.
  const rows = entries
    .filter(
      (e) =>
        e.day_of_week === isoDow(date) &&
        (!e.teaching_assignment.group_id || recorded.has(e.id)),
    )
    .sort((a, b) => a.period_no - b.period_no);

  const shift = (n: number) => setDate(addDays(date, n));
  const label = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  const openRecords = openSubject ? (bySubject.get(openSubject) ?? []) : [];
  const SubjectCalendar = () => {
    const sub = subjects.find((x) => x.id === openSubject);
    const worst = new Map<string, AttendanceStatus>();
    for (const r of openRecords) {
      const cur = worst.get(r.date);
      if (!cur || WORST.indexOf(r.status) < WORST.indexOf(cur))
        worst.set(r.date, r.status);
    }
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenSubject(null)}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronBack className="h-4 w-4" /> ภาพรวมทั้งหมด
        </button>
        <p className="text-sm font-medium">{sub?.name_th ?? "—"}</p>
        {codeBadge(sub)}
        <div className="mt-3">
          <AttendanceMonthView
            departmentId={deptId}
            useRecords={(a, b) => ({
              data: [...worst]
                .filter(([d]) => d >= a && d <= b)
                .map(([date, status]) => ({ date, status })),
              isLoading: false,
              isError: false,
              refetch: () => {},
            })}
            holiday={(iso) => holiday(iso)}
          />
        </div>
      </>
    );
  };

  const codeBadge = (sub?: { code: string; learning_area_id: string | null }) =>
    sub && (
      <span
        className={cn(
          "mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
          colors.shade(sub.learning_area_id),
        )}
      >
        {sub.code}
      </span>
    );

  return (
    <section>
      <div
        role="tablist"
        className="mb-4 grid grid-cols-2 border-b border-border"
      >
        {(
          [
            ["day", "รายวัน"],
            ["all", "ภาพรวมทั้งหมด"],
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
              tab === k
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "all" ? (
        isLoading || loadingEntries ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : isError ? (
          <LoadError onRetry={() => void refetch()} />
        ) : openSubject ? (
          SubjectCalendar()
        ) : (
          <>
            {bySubject.size === 0 ? (
              <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                ยังไม่มีผลเช็คชื่อ
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {[...bySubject].map(([sid, rs]) => {
                  const c = summarizeAttendance(rs);
                  const ratio = (c.present + c.late) / rs.length; // leave stays in the divisor
                  const pct = Math.floor(ratio * 100);
                  const tone =
                    ratio >= 0.8
                      ? "bg-green-500"
                      : ratio >= 0.7
                        ? "bg-yellow-400"
                        : "bg-red-500"; // 80% = มส line (0042)
                  return (
                    <li key={sid}>
                      <button
                        type="button"
                        onClick={() => setOpenSubject(sid)}
                        className="block w-full rounded-2xl bg-muted/60 px-3 py-3 text-left"
                      >
                        <span className="block truncate text-sm font-medium">
                          {subjects.find((x) => x.id === sid)?.name_th ?? "—"}
                        </span>
                        {codeBadge(subjects.find((x) => x.id === sid))}
                        <span className="mt-2 flex gap-1.5">
                          {STATUS_ORDER.map((st) => (
                            <span
                              key={st}
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                                STATUS_CELL[st],
                              )}
                            >
                              {STATUS_LABEL[st]} {c[st]}
                            </span>
                          ))}
                        </span>
                        <span className="mt-3 flex items-center gap-2">
                          <span
                            role="progressbar"
                            aria-label="เปอร์เซ็นต์เข้าเรียน"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className={cn("block h-full rounded-full", tone)}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="w-10 text-right text-xs font-semibold tabular-nums">
                            {pct}%
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="วันก่อนหน้า"
              disabled={!!term0 && date <= term0.start_date!}
              onClick={() => shift(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 disabled:opacity-30"
            >
              <ChevronBack className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{label}</span>
            <button
              type="button"
              aria-label="วันถัดไป"
              disabled={!!term0 && date >= term0.end_date!}
              onClick={() => shift(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 disabled:opacity-30"
            >
              <ChevronForward className="h-4 w-4" />
            </button>
          </div>

          {isLoading || loadingEntries ? (
            <div
              role="status"
              aria-label="กำลังโหลดการเข้าเรียน"
              className="mt-3 space-y-2"
            >
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-14 w-full rounded-2xl" />
            </div>
          ) : isError ? (
            <LoadError onRetry={() => void refetch()} />
          ) : (
            <>
              {off ? (
                <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  {off}
                </p>
              ) : rows.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  ไม่มีคาบเรียนในวันนี้
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {rows.map((e) => {
                    const t = timesOf(e.day_of_week, e.period_no);
                    const subject = subjects.find(
                      (s) => s.id === e.teaching_assignment.subject_id,
                    );
                    const st = byKey.get(e.id);
                    const skipped = replaced(date, e.id);
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-sm font-semibold tabular-nums">
                          {teachingOrdinal(
                            gradePeriods,
                            e.day_of_week,
                            e.period_no,
                          ) || e.period_no}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {subject?.name_th ?? "—"}
                          </span>
                          {codeBadge(subject)}
                          {t && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {hhmm(t.start_time)}–{hhmm(t.end_time)}
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                            skipped
                              ? "bg-muted text-muted-foreground"
                              : st
                                ? STATUS_CELL[st]
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {skipped
                            ? "งดเรียน"
                            : st
                              ? STATUS_LABEL[st]
                              : "รอเช็คชื่อ"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
