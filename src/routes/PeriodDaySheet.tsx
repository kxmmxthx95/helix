import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, EmptyState, Skeleton, Spinner } from "@/components/ui";
import { CheckmarkCircleIcon, ChevronBack, ChevronForward } from "@/components/icons";
import { useClassroomRoster } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { useSavePeriodAttendance, usePeriodAttendance, usePeriodAttendanceTakenSet } from "@/hooks/usePeriodAttendance";
import { useApprovedLeaveOnDate } from "@/hooks/useStudentLeave";
import type { AttendanceStatus } from "@/lib/database.types";
import { levelTone } from "@/lib/gradeLevels";
import { bangkokMinutes } from "@/hooks/useTimeClock";
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
  hex: string;
};

export type SheetDay = { date: string; label: string; periods: DayPeriod[] };

const thaiDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("th-TH", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

// Thai weekday colours, Sunday first.
const DAY_TONE = [
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
];

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** One day's period cards. Today's open once their start time arrives; later days are tappable for a view-only roster. */
function DayList({ day, open, onPick }: { day: SheetDay; open: boolean; onPick: (entryId: string) => void }) {
  const { data: taken = new Set<string>() } = usePeriodAttendanceTakenSet(open ? day.periods.map((p) => p.entryId) : [], day.date);
  const isToday = day.date === todayIso();
  const nowMin = bangkokMinutes(new Date());
  const takenCount = day.periods.filter((p) => taken.has(p.entryId)).length;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h3 className="min-w-0 text-[15px] font-semibold text-foreground">
          {day.label}
          <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[13px] font-medium", DAY_TONE[new Date(`${day.date}T00:00:00Z`).getUTCDay()])}>
            {thaiDate(day.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
        </h3>
        <span className={cn("shrink-0 text-xs", !isToday ? "text-muted-foreground" : takenCount === day.periods.length ? "text-success" : "text-destructive")}>
          {isToday ? `เช็คแล้ว ${takenCount}/${day.periods.length} คาบ` : `${day.periods.length} คาบ`}
        </span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card">
        {day.periods.map((p) => {
          const [from = "", to = ""] = p.time.split("–");
          const started = !isToday || nowMin >= minutesOf(from);
          const current = isToday && started && nowMin < minutesOf(to);
          const done = taken.has(p.entryId);
          const status = done ? null : !started ? "ยังไม่ถึงเวลา" : isToday ? (current ? "กำลังสอน · รอเช็คชื่อ" : "รอเช็คชื่อ") : null;
          return (
            <li key={p.entryId}>
              <button
                type="button"
                disabled={!started}
                onClick={() => onPick(p.entryId)}
                className="relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:hover:bg-card"
              >
                <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ backgroundColor: p.hex }} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-medium leading-snug text-foreground">{p.subjectName}</span>
                  <span className="mt-1.5 flex flex-col items-start gap-1">
                    <span
                      style={{ "--tint": p.hex } as React.CSSProperties}
                      className="rounded-md border border-[var(--tint)] bg-card px-2 py-0.5 text-xs font-medium text-[color-mix(in_srgb,var(--tint)_55%,hsl(var(--foreground)))]"
                    >
                      {p.subjectCode}
                    </span>
                    <span className={cn("rounded-md border border-current bg-card px-2 py-0.5 text-xs font-medium", levelTone(p.room).replace(/bg-\S+/g, ""))}>{p.room}</span>
                    <span className="rounded-md border border-accent bg-card px-2 py-0.5 text-xs font-medium text-accent">
                      คาบ {p.ordinal} · {p.time}
                    </span>
                  </span>
                  {status && <span className={cn("mt-1.5 block text-[13px]", current ? "text-accent" : "text-muted-foreground")}>{status}</span>}
                </span>
                {done ? (
                  <span role="img" aria-label="เช็คแล้ว" className="shrink-0 text-success">
                    <CheckmarkCircleIcon className="h-5 w-5" />
                  </span>
                ) : (
                  <ChevronForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Today's and the next teaching day's periods; tap one to mark its students (same table as the period-attendance page). Roster view mirrors the assembly sheet. */
export function PeriodDaySheet({
  open,
  onOpenChange,
  days,
  academicYear,
  recorderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: SheetDay[];
  academicYear: number;
  recorderId: string;
}) {
  const toast = useToast();
  const save = useSavePeriodAttendance();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedDay = days.find((d) => d.periods.some((p) => p.entryId === pickedId));
  const picked = pickedDay?.periods.find((p) => p.entryId === pickedId);
  const date = pickedDay?.date ?? todayIso();
  const entryId = picked?.entryId ?? null;

  const { data: roster = [], isLoading: loadingRoster } = useClassroomRoster(picked ? picked.classroomId : null, academicYear);
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
        // Reset after the close animation so the content doesn't jump back to the list mid-slide.
        if (!o) setTimeout(() => setPickedId(null), 500);
      }}
      title={picked ? thaiDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "เช็คชื่อเข้าเรียน"}
      closable
      bottomOnPhone
      iconClassName="-ml-2 bg-transparent text-foreground"
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
      bodyClassName={picked ? undefined : "bg-muted"}
      footerClassName="pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      footer={
        canSave ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {remaining > 0 ? `ยังไม่เช็ค ${remaining} คน` : counts.map(([st, n]) => `${STATUS_LABEL[st]} ${n}`).join(" · ")}
            </p>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setMarks(new Map(roster.map((s) => [s.id, onLeave?.has(s.id) ? "leave" : "present"])))}>
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
        days.length === 0 ? (
          <EmptyState title="ไม่มีคาบสอน" />
        ) : (
          <div className="space-y-5">
            {days.map((d) => (
              <DayList key={d.date} day={d} open={open} onPick={setPickedId} />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-1">
          <p className="truncate pb-2 text-sm font-semibold">
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
            <ul className="divide-y divide-border">
              {roster.map((s) => {
                const name = `${s.first_name} ${s.last_name}`;
                const status = marks.get(s.id);
                const locked = !!onLeave?.has(s.id); // server force-locks approved leave to 'leave' (migration 0037)
                return (
                  <li key={s.id} className="py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={name} src={s.profile ? avatarUrl(s.profile) : null} className="h-10 w-10 border border-border text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                        <p className="truncate font-mono text-xs text-foreground/70">{s.student_code}</p>
                      </div>
                    </div>
                    <div role="group" aria-label={`สถานะของ ${name}`} className="mt-2 grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5">
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
