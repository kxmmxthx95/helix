import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, EmptyState, Skeleton, Spinner } from "@/components/ui";
import { useAcademicEvents } from "@/hooks/useAcademicTerms";
import {
  type HomeroomClassroomOption,
  useAttendanceForDate,
  useClassroomRoster,
  useSaveAttendance,
} from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { useApprovedLeaveOnDate } from "@/hooks/useStudentLeave";
import type { AttendanceStatus } from "@/lib/database.types";
import { levelTone } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";

export const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
export const SEGMENT_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-success/15 text-success ring-1 ring-inset ring-success/40",
  late: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/40",
  absent: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/40",
  leave: "bg-fill-strong text-foreground ring-1 ring-inset ring-border",
};

/** Morning-assembly (เข้าแถว) check-in for the teacher's homeroom(s), today only. Same table the daily page writes. */
export function AssemblyAttendanceSheet({
  open,
  onOpenChange,
  homerooms,
  academicYear,
  departmentId,
  recorderId,
  date,
  roomLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homerooms: HomeroomClassroomOption[];
  academicYear: number;
  departmentId: string;
  recorderId: string;
  date: string;
  /** Short room name (ม.4/1) for a classroom id. */
  roomLabel: (classroomId: string) => string;
}) {
  const toast = useToast();
  const save = useSaveAttendance();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const classroom = homerooms.find((h) => h.id === pickedId) ?? homerooms[0];
  const classroomId = open ? (classroom?.id ?? null) : null;

  const { data: roster = [], isLoading: loadingRoster } = useClassroomRoster(classroomId, academicYear);
  const { data: records, isLoading: loadingRecords } = useAttendanceForDate(classroomId, date);
  const { data: onLeave, isLoading: loadingLeave } = useApprovedLeaveOnDate(roster.map((s) => s.id), date);
  const { data: events = [] } = useAcademicEvents();
  const blockedEvent = events.find(
    (e) =>
      !e.students_attend &&
      date >= e.start_date &&
      date <= e.end_date &&
      (e.departmentIds.length === 0 || e.departmentIds.includes(departmentId)),
  );

  // Marks start from what's saved, else approved leave, else unmarked; seeded once per room each time the sheet opens.
  const [marks, setMarks] = useState<Map<string, AttendanceStatus | null>>(new Map());
  const seededFor = useRef<string | null>(null);
  const ready = !loadingRoster && !loadingRecords && !loadingLeave && roster.length > 0;
  useEffect(() => {
    if (!open) seededFor.current = null;
  }, [open]);
  useEffect(() => {
    if (!classroomId || !ready || !records || seededFor.current === classroomId) return;
    const saved = new Map(records.map((r) => [r.student_id, r.status]));
    setMarks(new Map(roster.map((s) => [s.id, saved.get(s.id) ?? (onLeave?.has(s.id) ? "leave" : null)])));
    seededFor.current = classroomId;
  }, [classroomId, ready, records, roster, onLeave]);

  const counts = useMemo(
    () => STATUS_ORDER.map((st) => [st, roster.filter((s) => marks.get(s.id) === st).length] as const),
    [roster, marks],
  );

  const remaining = roster.filter((s) => !marks.get(s.id)).length;

  function submit() {
    if (!classroom || remaining > 0) return;
    save.mutate(
      roster.map((s) => ({
        student_id: s.id,
        classroom_id: classroom.id,
        date,
        status: marks.get(s.id)!,
        note: null,
        recorded_by: recorderId,
      })),
      {
        onSuccess: () => {
          toast(`บันทึกเช็คชื่อหน้าเสาธง ${roomLabel(classroom.id)} เรียบร้อย`);
          onOpenChange(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  const canSave = !!classroom && !blockedEvent && roster.length > 0 && seededFor.current === classroom.id;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
      headerEnd={
        classroom && (
          <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", levelTone(roomLabel(classroom.id)))}>
            {roomLabel(classroom.id)}
          </span>
        )
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
      {homerooms.length === 0 ? (
        <EmptyState title="ไม่ได้เป็นครูที่ปรึกษา" description="บัญชีนี้ไม่มีห้องที่ปรึกษาในปีการศึกษานี้" />
      ) : (
        <div className="space-y-3">
          {homerooms.length > 1 && (
            <div role="tablist" aria-label="ห้องที่ปรึกษา" className="flex gap-1 rounded-xl bg-secondary p-0.5">
              {homerooms.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  role="tab"
                  aria-selected={classroom?.id === h.id}
                  onClick={() => setPickedId(h.id)}
                  className={cn(
                    "h-8 flex-1 rounded-lg text-[13px] font-medium",
                    classroom?.id === h.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
                  )}
                >
                  {roomLabel(h.id)}
                </button>
              ))}
            </div>
          )}
          {blockedEvent ? (
            <EmptyState title="ไม่ต้องเช็คชื่อวันนี้" description={blockedEvent.name} />
          ) : loadingRoster || loadingRecords ? (
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
                          aria-pressed={status === st}
                          onClick={() => setMarks((prev) => new Map(prev).set(s.id, prev.get(s.id) === st ? null : st))}
                          className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md text-[13px] font-semibold transition-colors",
                            status === st ? SEGMENT_STYLE[st] : "text-foreground/80 hover:text-foreground",
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
