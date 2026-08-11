import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, ChevronForward, Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import {
  useAcademicEvents,
  useDeleteAcademicEvent,
  useSaveAcademicEvent,
  type AcademicEventDraft,
  type AcademicEventRow,
} from "@/hooks/useAcademicTerms";
import { useDepartments } from "@/hooks/useProfiles";
import type { AcademicEventType } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const EVENT_TYPE_LABEL: Record<AcademicEventType, string> = {
  holiday: "วันหยุด",
  school_event: "กิจกรรมโรงเรียน",
  exam_period: "ช่วงสอบ",
  teacher_workday: "วันครูทำงาน (เด็กหยุด)",
  suspended: "ปิดกรณีพิเศษ",
};

const EVENT_TYPE_DOT: Record<AcademicEventType, string> = {
  holiday: "bg-destructive",
  suspended: "bg-destructive",
  exam_period: "bg-warning",
  teacher_workday: "bg-primary",
  school_event: "bg-accent",
};

const WEEKDAY_LABEL = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts a day in any
// timezone behind UTC — build from local Y/M/D components instead.
const fromISODate = (s: string) => {
  const parts = s.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 6 weeks × 7 days (Mon-start), enough to cover any month plus lead/trail days. */
function buildCalendarDays(monthStart: Date): Date[] {
  const leadingEmpty = (monthStart.getDay() + 6) % 7; // Mon=0..Sun=6
  const gridStart = addDays(monthStart, -leadingEmpty);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

// Pre-fills students_attend/staff_attend when the event type changes — still
// editable, not enforced by the DB (a school might have a real exception).
const ATTEND_DEFAULTS: Record<AcademicEventType, { students_attend: boolean; staff_attend: boolean }> = {
  holiday: { students_attend: false, staff_attend: false },
  suspended: { students_attend: false, staff_attend: false },
  teacher_workday: { students_attend: false, staff_attend: true },
  school_event: { students_attend: true, staff_attend: true },
  exam_period: { students_attend: true, staff_attend: true },
};

export function AcademicEvents() {
  const { profile: me } = useAuth();
  const { data: events = [], isLoading } = useAcademicEvents();
  const del = useDeleteAcademicEvent();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState<AcademicEventRow | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // ISO date pre-fill, or "" for the blank top button

  // A dept_head may only edit events linked to their own department — a
  // whole-school event (no links) is org-wide only. UI hides what the role
  // can't do; RLS is the real boundary (see migration 0018).
  function canEditRow(row: AcademicEventRow) {
    if (orgWide) return true;
    if (!mayEdit || !me?.department_id) return false;
    return row.departmentIds.includes(me.department_id);
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AcademicEventRow[]>();
    for (const ev of events) {
      for (let d = fromISODate(ev.start_date); toISODate(d) <= ev.end_date; d = addDays(d, 1)) {
        const key = toISODate(d);
        map.set(key, [...(map.get(key) ?? []), ev]);
      }
    }
    return map;
  }, [events]);

  const days = useMemo(() => buildCalendarDays(cursor), [cursor]);
  const todayISO = toISODate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ปฏิทินกิจกรรม/วันหยุด</h2>
        {mayEdit && (
          <Button size="sm" onClick={() => setCreating("")}>
            <Plus className="h-3.5 w-3.5" />
            เพิ่ม Event
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="เดือนก่อนหน้า">
            <ChevronBack className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            วันนี้
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="เดือนถัดไป">
            <ChevronForward className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium">
          {cursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
        </span>
        {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      </div>

      <Card className="space-y-1 p-2">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABEL.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-l border-t border-border">
          {days.map((day) => {
            const iso = toISODate(day);
            const dayEvents = eventsByDay.get(iso) ?? [];
            const inMonth = day.getMonth() === cursor.getMonth();
            return (
              <div
                key={iso}
                onClick={() => mayEdit && setCreating(iso)}
                className={cn(
                  "flex min-h-20 flex-col gap-0.5 border-b border-r border-border p-1 text-xs",
                  inMonth ? "bg-background/40" : "opacity-40",
                  mayEdit && "cursor-pointer hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "self-start rounded-full px-1.5 text-[0.7rem]",
                    iso === todayISO && "bg-accent text-accent-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canEditRow(ev)) setEditing(ev);
                    }}
                    className={cn(
                      "flex items-center gap-1 truncate rounded px-1 py-0.5 text-left hover:bg-muted",
                      canEditRow(ev) ? "cursor-pointer" : "cursor-default",
                    )}
                    title={ev.name}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", EVENT_TYPE_DOT[ev.event_type])} />
                    <span className="truncate">{ev.name}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[0.7rem] text-muted-foreground">+{dayEvents.length - 3} อื่นๆ</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <EventSheet
        mode="edit"
        event={editing}
        open={editing !== null}
        orgWide={orgWide}
        myDepartmentId={me?.department_id ?? null}
        onClose={() => setEditing(null)}
        onDelete={editing && orgWide ? () => del.mutate(editing.id, { onSuccess: () => setEditing(null) }) : undefined}
      />
      <EventSheet
        mode="create"
        event={null}
        initialDate={creating || undefined}
        open={creating !== null}
        orgWide={orgWide}
        myDepartmentId={me?.department_id ?? null}
        onClose={() => setCreating(null)}
      />
    </div>
  );
}

function EventSheet({
  mode,
  event,
  initialDate,
  open,
  orgWide,
  myDepartmentId,
  onClose,
  onDelete,
}: {
  mode: "create" | "edit";
  event: AcademicEventRow | null;
  initialDate?: string;
  open: boolean;
  orgWide: boolean;
  myDepartmentId: string | null;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { data: departments = [] } = useDepartments();
  const save = useSaveAcademicEvent();

  const blank = (): AcademicEventDraft & { departmentIds: string[] } => ({
    name: "",
    event_type: "holiday",
    start_date: initialDate ?? "",
    end_date: initialDate ?? "",
    ...ATTEND_DEFAULTS.holiday,
    // A dept_head's event is always scoped to their own department — the
    // "whole school" (empty) option is org-wide only, so it's never offered here.
    departmentIds: orgWide ? [] : myDepartmentId ? [myDepartmentId] : [],
  });

  const [draft, setDraft] = useState(blank);

  useEffect(() => {
    if (!open) return;
    setDraft(
      event
        ? {
            name: event.name,
            event_type: event.event_type,
            start_date: event.start_date,
            end_date: event.end_date,
            students_attend: event.students_attend,
            staff_attend: event.staff_attend,
            departmentIds: event.departmentIds,
          }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event]);

  function setEventType(event_type: AcademicEventType) {
    setDraft((d) => ({ ...d, event_type, ...ATTEND_DEFAULTS[event_type] }));
  }

  function toggleDepartment(id: string, checked: boolean) {
    setDraft((d) => ({
      ...d,
      departmentIds: checked ? [...d.departmentIds, id] : d.departmentIds.filter((x) => x !== id),
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.start_date || !draft.end_date) return;
    save.mutate({ id: event?.id, ...draft }, { onSuccess: onClose });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "create" ? "เพิ่ม Event" : "แก้ไข Event"}
      footer={
        onDelete ? (
          <Button variant="outline" className="w-full text-destructive" onClick={onDelete}>
            ลบ Event
          </Button>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ชื่อ Event">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        </Field>

        <Field label="ประเภท">
          <Select value={draft.event_type} onChange={(e) => setEventType(e.target.value as AcademicEventType)}>
            {(Object.keys(EVENT_TYPE_LABEL) as AcademicEventType[]).map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="วันเริ่ม">
            <Input
              type="date"
              value={draft.start_date}
              onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              required
            />
          </Field>
          <Field label="วันสิ้นสุด">
            <Input
              type="date"
              value={draft.end_date}
              onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
              required
            />
          </Field>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.students_attend}
              onChange={(e) => setDraft({ ...draft, students_attend: e.target.checked })}
              className="h-5 w-5 accent-[hsl(var(--accent))]"
            />
            นักเรียนมาเรียน
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.staff_attend}
              onChange={(e) => setDraft({ ...draft, staff_attend: e.target.checked })}
              className="h-5 w-5 accent-[hsl(var(--accent))]"
            />
            ครูทำงาน
          </label>
        </div>

        {orgWide && (
          <Field label="แผนกที่เกี่ยวข้อง (ไม่ติ๊ก = ทั้งโรงเรียน)">
            <div className="space-y-1.5">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.departmentIds.includes(d.id)}
                    onChange={(e) => toggleDepartment(d.id, e.target.checked)}
                    className="h-5 w-5 accent-[hsl(var(--accent))]"
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </Field>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={!draft.name.trim() || !draft.start_date || !draft.end_date || save.isPending}
        >
          {save.isPending ? <Spinner className="h-3 w-3" /> : mode === "create" ? "เพิ่ม" : "บันทึก"}
        </Button>
      </form>
    </Sheet>
  );
}
