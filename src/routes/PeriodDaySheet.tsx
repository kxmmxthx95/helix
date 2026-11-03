import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, EmptyState, Skeleton, Spinner } from "@/components/ui";
import { ChevronBack, ChevronForward } from "@/components/icons";
import { useClassroomRoster } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { useSavePeriodAttendance, usePeriodAttendance, usePeriodAttendanceTakenSet } from "@/hooks/usePeriodAttendance";
import { useApprovedLeaveOnDate } from "@/hooks/useStudentLeave";
import type { AttendanceStatus } from "@/lib/database.types";
import { levelTone } from "@/lib/gradeLevels";
import { cn, todayIso } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";
import { SEGMENT_STYLE, STATUS_ORDER } from "@/routes/AssemblyAttendanceSheet";

export type DayPeriod = {
  entryId: string;
  classroomId: string;
  ordinal: number;
  time: string;
  subjectCode: string;
  subjectName: string;
  room: string;
  gradient: string;
};

/** One teaching day's periods; tap one to mark its students (same table as the period-attendance page). Roster view mirrors the assembly sheet. */
export function PeriodDaySheet({
  open,
  onOpenChange,
  date,
  periods,
  academicYear,
  recorderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  periods: DayPeriod[];
  academicYear: number;
  recorderId: string;
}) {
  const toast = useToast();
  const save = useSavePeriodAttendance();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = periods.find((p) => p.entryId === pickedId);
  const entryId = open ? (picked?.entryId ?? null) : null;
  const { data: taken = new Set<string>() } = usePeriodAttendanceTakenSet(open ? periods.map((p) => p.entryId) : [], date);

  const { data: roster = [], isLoading: loadingRoster } = useClassroomRoster(picked && open ? picked.classroomId : null, academicYear);
  const { data: records, isLoading: loadingRecords } = usePeriodAttendance(entryId, date);
  const { data: onLeave, isLoading: loadingLeave } = useApprovedLeaveOnDate(roster.map((s) => s.id), date);

  // Marks start from what's saved, else approved leave, else unmarked; seeded once per period each time it's opened.
  const [marks, setMarks] = useState<Map<string, AttendanceStatus | null>>(new Map());
  const seededFor = useRef<string | null>(null);
  const ready = !loadingRoster && !loadingRecords && !loadingLeave && roster.length > 0;
  useEffect(() => {
    if (!entryId) seededFor.current = null;
  }, [entryId]);
  useEffect(() => {
    if (!entryId || !ready || !records || seededFor.current === entryId) return;
    const saved = new Map(records.map((r) => [r.student_id, r.status]));
    setMarks(new Map(roster.map((s) => [s.id, onLeave?.has(s.id) ? "leave" : (saved.get(s.id) ?? null)])));
    seededFor.current = entryId;
  }, [entryId, ready, records, roster, onLeave]);

  const counts = useMemo(
    () => STATUS_ORDER.map((st) => [st, roster.filter((s) => marks.get(s.id) === st).length] as const),
    [roster, marks],
  );
  const remaining = roster.filter((s) => !marks.get(s.id)).length;
  const notes = new Map((records ?? []).map((r) => [r.student_id, r.note]));

  function submit() {
    if (!picked || remaining > 0) return;
    save.mutate(
      roster.map((s) => ({
        student_id: s.id,
        schedule_entry_id: picked.entryId,
        date,
        status: marks.get(s.id)!,
        note: notes.get(s.id) ?? null,
        recorded_by: recorderId,
      })),
      {
        onSuccess: () => {
          toast(`บันทึกเช็คชื่อ ${picked.subjectName} ${picked.room} เรียบร้อย`);
          setPickedId(null);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  const future = date > todayIso(); // future days are view-only (DB trigger 0114 backs this up)
  const canSave = !future && !!picked && roster.length > 0 && seededFor.current === picked.entryId;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPickedId(null);
      }}
      title={new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
      closable
      icon={
        picked && (
          <button type="button" aria-label="กลับ" onClick={() => setPickedId(null)} className="flex h-full w-full items-center justify-center">
            <ChevronBack className="h-4 w-4" />
          </button>
        )
      }
      headerEnd={
        picked && <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", levelTone(picked.room))}>{picked.room}</span>
      }
      // Header and footer share one 64px band (12px padding + 40px row).
      headerClassName="[&>div]:min-h-10"
      footerClassName="pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      footer={
        canSave ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {remaining > 0 ? `ยังไม่เช็ค ${remaining} คน` : counts.map(([st, n]) => `${STATUS_LABEL[st]} ${n}`).join(" · ")}
            </p>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setMarks(new Map(roster.map((s) => [s.id, "present"])))}>
              มาทั้งหมด
            </Button>
            <Button size="sm" className="h-10" disabled={save.isPending || remaining > 0} onClick={submit}>
              {save.isPending ? <Spinner className="h-4 w-4" /> : "บันทึก"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!picked ? (
        periods.length === 0 ? (
          <EmptyState title="ไม่มีคาบสอน" />
        ) : (
          <ul className="space-y-2">
            {periods.map((p) => (
              <li key={p.entryId}>
                <button
                  type="button"
                  onClick={() => setPickedId(p.entryId)}
                  className={cn("flex w-full items-center gap-3 rounded-2xl p-4 text-left", p.gradient)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium opacity-70">
                      คาบ {p.ordinal} · {p.time}
                      {taken.has(p.entryId) && " · เช็คแล้ว"}
                    </span>
                    <span className="block truncate text-[15px] font-semibold">{p.subjectName}</span>
                    <span className="block truncate text-sm opacity-80">
                      {p.subjectCode} · {p.room}
                    </span>
                  </span>
                  <ChevronForward className="h-4 w-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-3">
          <p className="truncate text-sm font-semibold">
            {picked.subjectCode} {picked.subjectName}
          </p>
          {future && <p className="text-xs text-muted-foreground">ยังไม่ถึงวันนี้ — ดูรายชื่อได้ แต่เช็คชื่อล่วงหน้าไม่ได้</p>}
          {loadingRoster || loadingRecords ? (
            <div role="status" aria-label="กำลังโหลด" className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : roster.length === 0 ? (
            <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
          ) : (
            <ul className="space-y-2">
              {roster.map((s) => {
                const name = `${s.first_name} ${s.last_name}`;
                const status = marks.get(s.id);
                const locked = !!onLeave?.has(s.id); // server force-locks approved leave to 'leave' (migration 0037)
                return (
                  <li key={s.id} className="rounded-xl bg-secondary p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={name} src={s.profile ? avatarUrl(s.profile) : null} className="h-10 w-10 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                        <p className="truncate font-mono text-xs text-foreground/70">{s.student_code}</p>
                      </div>
                    </div>
                    <div role="group" aria-label={`สถานะของ ${name}`} className="mt-2 grid grid-cols-4 gap-0.5 rounded-lg bg-card p-0.5 shadow-card">
                      {STATUS_ORDER.map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={locked || future}
                          aria-pressed={status === st}
                          onClick={() => setMarks((prev) => new Map(prev).set(s.id, prev.get(s.id) === st ? null : st))}
                          className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md text-[13px] font-semibold transition-colors",
                            status === st ? SEGMENT_STYLE[st] : "text-foreground/80 hover:text-foreground",
                            locked && status !== st && "opacity-40",
                          )}
                        >
                          {STATUS_LABEL[st]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
