import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Field, FormSection, Select, Spinner } from "@/components/ui";
import {
  useAttendanceDuties,
  useLeaveCovers,
  useProposeCovers,
  useSetCoverStatus,
  type ProposeCover,
} from "@/hooks/useAttendanceCovers";
import { useMyLeaveRequests } from "@/hooks/useLeave";
import { useProfiles } from "@/hooks/useProfiles";
import { profileFullName, type AttendanceCover, type CoverStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { isEmployeeRole } from "@/lib/roles";
import { cn, todayIso } from "@/lib/utils";

export type CoverLeave = { id: string; profile_id: string; start_date: string; end_date: string };

const STATUS_LABEL: Record<CoverStatus, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  declined: "ปฏิเสธ",
  cancelled: "ยกเลิก",
};
const STATUS_STYLE: Record<CoverStatus, string> = {
  pending: "bg-warning/15 text-warning",
  confirmed: "bg-success/15 text-success",
  declined: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const MAX_DAYS = 31;

/** Weekdays inside the leave range (weekends have no attendance), capped so a long leave can't render hundreds of blocks. */
function leaveDates(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last && out.length < MAX_DAYS) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Another teacher's lesson in the same period → warn before assigning (grill: warn, don't block). */
async function busyAt(teacherId: string, date: string, periodNo: number): Promise<boolean> {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 1..5 (Mon..Fri) matches schedule_entries.day_of_week
  const { data } = await supabase
    .from("schedule_entries")
    .select("id, teaching_assignment:teaching_assignments!inner(teacher_id)")
    .eq("day_of_week", dow)
    .eq("period_no", periodNo)
    .eq("teaching_assignment.teacher_id", teacherId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** มอบงานเช็คชื่อ (เข้าแถว/รายคาบ) ให้ครูแทนระหว่างลา — shared by the owner and managers. */
export function CoverSheet({
  leave,
  actorId,
  open,
  onOpenChange,
}: {
  leave: CoverLeave;
  actorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: covers = [], isLoading } = useLeaveCovers(open ? leave.id : null);
  const { data: profiles = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "true" });
  // Only employees can cover (the list also holds students/parents of the department).
  const teachers = useMemo(() => profiles.filter((p) => p.id !== leave.profile_id && isEmployeeRole(p.roles)), [profiles, leave.profile_id]);
  const dates = useMemo(() => leaveDates(leave.start_date, leave.end_date), [leave.start_date, leave.end_date]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="มอบงานเช็คชื่อให้ครูแทน"
      description="ครูแทนต้องกดยืนยัน และจะเช็คชื่อได้เฉพาะวัน/คาบที่ยืนยัน หลังใบลาได้รับอนุมัติ"
      bottomOnPhone
      footer={
        <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          ปิด
        </Button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {dates.map((date) => (
            <DayBlock
              key={date}
              date={date}
              leave={leave}
              actorId={actorId}
              covers={covers.filter((c) => c.date === date)}
              teachers={teachers}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

type Teacher = { id: string; first_name: string; last_name: string; prefix: string | null };

function DayBlock({
  date,
  leave,
  actorId,
  covers,
  teachers,
}: {
  date: string;
  leave: CoverLeave;
  actorId: string;
  covers: AttendanceCover[];
  teachers: Teacher[];
}) {
  const toast = useToast();
  const { data: duties = [] } = useAttendanceDuties(leave.profile_id, date);
  const propose = useProposeCovers();
  const setStatus = useSetCoverStatus();
  const name = (id: string) => {
    const t = teachers.find((x) => x.id === id);
    return t ? profileFullName(t as Parameters<typeof profileFullName>[0]) : "—";
  };
  const activeOf = (d: (typeof duties)[number]) =>
    covers.find(
      (c) =>
        (c.status === "pending" || c.status === "confirmed") &&
        c.classroom_id === d.classroom_id &&
        c.schedule_entry_id === d.schedule_entry_id,
    );
  const declinedOf = (d: (typeof duties)[number]) =>
    covers.find(
      (c) => c.status === "declined" && c.classroom_id === d.classroom_id && c.schedule_entry_id === d.schedule_entry_id,
    );

  async function assign(items: typeof duties, teacherId: string) {
    if (!teacherId || items.length === 0) return;
    const busy: string[] = [];
    for (const d of items) {
      if (d.period_no != null && (await busyAt(teacherId, date, d.period_no))) busy.push(d.label);
    }
    if (busy.length > 0 && !window.confirm(`${name(teacherId)} มีสอนในช่วงเดียวกัน (${busy.join(", ")})\nมอบต่อไหม?`)) return;
    const rows: ProposeCover[] = items.map((d) => ({
      leave_request_id: leave.id,
      date,
      classroom_id: d.classroom_id,
      schedule_entry_id: d.schedule_entry_id,
      cover_staff_id: teacherId,
      proposed_by: actorId,
    }));
    propose.mutate(rows, {
      onSuccess: () => toast("ส่งคำขอให้ครูแทนแล้ว"),
      onError: (e) => toast(e instanceof Error ? e.message : "มอบงานไม่สำเร็จ", "error"),
    });
  }

  if (duties.length === 0) return null;
  const free = duties.filter((d) => !activeOf(d));

  const teacherOptions = teachers.map((t) => (
    <option key={t.id} value={t.id}>
      {name(t.id)}
    </option>
  ));

  // Same look as NewLeaveSheet: one grouped card per day, label left / value right, borderless controls.
  return (
    <FormSection title={date}>
      {free.length > 1 && (
        <Field label="มอบทั้งวันให้">
          <Select value="" placeholder="เลือกครูแทน" onChange={(e) => void assign(free, e.target.value)} disabled={propose.isPending}>
            {teacherOptions}
          </Select>
        </Field>
      )}
      {duties.map((d) => {
        const active = activeOf(d);
        const declined = declinedOf(d);
        const key = `${d.classroom_id}-${d.schedule_entry_id}`;
        if (!active) {
          return (
            <div key={key}>
              {declined && (
                <p className="pb-1 text-xs text-destructive">{name(declined.cover_staff_id)} ปฏิเสธ</p>
              )}
              <Field label={d.label}>
                <Select value="" placeholder="เลือกครูแทน" onChange={(e) => void assign([d], e.target.value)} disabled={propose.isPending}>
                  {teacherOptions}
                </Select>
              </Field>
            </div>
          );
        }
        return (
          <div key={key} className="flex min-h-10 items-center gap-4 text-sm leading-5 md:min-h-7">
            <span className="w-[42%] shrink-0">{d.label}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1">
              <span className="truncate text-muted-foreground">{name(active.cover_staff_id)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_STYLE[active.status])}>{STATUS_LABEL[active.status]}</span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: active.id, status: "cancelled" })}
              >
                ยกเลิก
              </button>
            </span>
          </div>
        );
      })}
    </FormSection>
  );
}

/**
 * Home-screen entry: picks which of my live leave requests to assign cover for.
 * One live request → straight into CoverSheet; none → nudge to file a leave first.
 */
export function CoverLeavePicker({
  profileId,
  open,
  onOpenChange,
  onNewLeave,
}: {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewLeave: () => void;
}) {
  const { data: requests = [], isLoading } = useMyLeaveRequests(open ? profileId : null);
  const [picked, setPicked] = useState<CoverLeave | null>(null);
  const live = requests.filter((r) => (r.status === "pending" || r.status === "approved") && r.end_date >= todayIso());

  if (!open) return null;
  const leave = picked ?? (live.length === 1 ? live[0]! : null);
  if (leave) {
    return <CoverSheet leave={leave} actorId={profileId} open onOpenChange={(o) => { if (!o) { setPicked(null); onOpenChange(false); } }} />;
  }
  return (
    <Sheet open onOpenChange={onOpenChange} title="มอบงานแทน" description="เลือกใบลาที่ต้องการมอบงานเช็คชื่อ" bottomOnPhone>
      {isLoading ? (
        <Spinner />
      ) : live.length === 0 ? (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>ยังไม่มีใบลาที่มอบงานได้ ยื่นคำลาก่อน</p>
          <Button onClick={() => { onOpenChange(false); onNewLeave(); }}>ยื่นคำลา</Button>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {live.map((r) => (
            <li key={r.id}>
              <button type="button" className="flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left text-sm" onClick={() => setPicked(r)}>
                <span className="font-medium">
                  {r.start_date} – {r.end_date}
                </span>
                <span className="text-xs text-muted-foreground">{r.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
