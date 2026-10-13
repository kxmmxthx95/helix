import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, ChevronForward, DownloadIcon, Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import {
  useAcademicEvents,
  useDeleteAcademicEvent,
  useSaveAcademicEvent,
  useSyncHolidays,
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
  holiday: "bg-pink-500",
  suspended: "bg-orange-500",
  exam_period: "bg-blue-500",
  teacher_workday: "bg-violet-500",
  school_event: "bg-emerald-500",
};

// Tinted chip per type — same hue as the dot, used on the grids and event rows.
const EVENT_TYPE_CHIP: Record<AcademicEventType, string> = {
  holiday: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  suspended: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  exam_period: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  teacher_workday: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  school_event: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

const WEEKDAY_LABEL = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts a day in any
// timezone behind UTC — build from local Y/M/D components instead.
const fromISODate = (s: string) => {
  const parts = s.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 6 weeks × 7 days (Sun-start), enough to cover any month plus lead/trail days. */
function buildCalendarDays(monthStart: Date): Date[] {
  const leadingEmpty = monthStart.getDay(); // Sun=0..Sat=6
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

type CalView = "month" | "week" | "day" | "list";

const VIEW_LABEL: Record<CalView, string> = { month: "เดือน", week: "สัปดาห์", day: "วัน", list: "รายการ" };
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("th-TH", { month: "long" }),
);
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
/** Same day-of-month in another month/year, clamped (31 Jan -> 28 Feb, not 3 Mar). */
const withMonth = (d: Date, year: number, month: number) =>
  new Date(year, month, Math.min(d.getDate(), new Date(year, month + 1, 0).getDate()));
const shortDate = (iso: string) => fromISODate(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

export function AcademicEvents() {
  const { profile: me } = useAuth();
  const { data: events = [], isLoading } = useAcademicEvents();
  const del = useDeleteAcademicEvent();
  const syncHolidays = useSyncHolidays();
  const toast = useToast();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [focus, setFocus] = useState(() => new Date());
  const [view, setView] = useState<CalView>("month");
  const [editing, setEditing] = useState<AcademicEventRow | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // ISO date pre-fill, or "" for the blank top button
  const [hidden, setHidden] = useState<Set<AcademicEventType>>(new Set()); // types unticked in ตัวกรองกิจกรรม

  // A dept_head may only edit events linked to their own department — a
  // whole-school event (no links) is org-wide only. UI hides what the role
  // can't do; RLS is the real boundary (see migration 0018).
  function canEditRow(row: AcademicEventRow) {
    if (orgWide) return true;
    if (!mayEdit || !me?.department_id) return false;
    return row.departmentIds.includes(me.department_id);
  }

  const visibleEvents = useMemo(() => events.filter((ev) => !hidden.has(ev.event_type)), [events, hidden]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AcademicEventRow[]>();
    for (const ev of visibleEvents) {
      for (let d = fromISODate(ev.start_date); toISODate(d) <= ev.end_date; d = addDays(d, 1)) {
        const key = toISODate(d);
        map.set(key, [...(map.get(key) ?? []), ev]);
      }
    }
    return map;
  }, [visibleEvents]);

  const todayISO = toISODate(new Date());
  const focusISO = toISODate(focus);
  const monthStart = startOfMonth(focus);
  const monthDays = useMemo(() => buildCalendarDays(monthStart), [monthStart.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(focus), i));
  const monthEvents = useMemo(() => {
    const first = toISODate(monthStart);
    const last = toISODate(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
    return visibleEvents
      .filter((ev) => ev.start_date <= last && ev.end_date >= first)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [visibleEvents, monthStart.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const upcoming = useMemo(
    () =>
      visibleEvents
        .filter((ev) => ev.end_date >= todayISO)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
        .slice(0, 5),
    [visibleEvents, todayISO],
  );

  function go(dir: -1 | 1) {
    if (view === "week") setFocus(addDays(focus, 7 * dir));
    else if (view === "day") setFocus(addDays(focus, dir));
    else setFocus(withMonth(focus, focus.getFullYear(), focus.getMonth() + dir));
  }

  function chip(ev: AcademicEventRow) {
    return (
      <button
        key={ev.id}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (canEditRow(ev)) setEditing(ev);
        }}
        className={cn(
          "font-sarabun flex w-full items-center gap-1.5 truncate rounded-lg px-2 py-1 text-left text-xs font-medium hover:opacity-80",
          EVENT_TYPE_CHIP[ev.event_type],
          canEditRow(ev) ? "cursor-pointer" : "cursor-default",
        )}
        title={ev.name}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", EVENT_TYPE_DOT[ev.event_type])} />
        <span className="truncate">{ev.name}</span>
      </button>
    );
  }

  /** Date tile + name + type/range row, shared by the list view and "กิจกรรมที่ใกล้ถึง". */
  function eventRow(ev: AcademicEventRow) {
    const start = fromISODate(ev.start_date);
    return (
      <button
        key={ev.id}
        type="button"
        onClick={() => canEditRow(ev) && setEditing(ev)}
        className="flex w-full items-center gap-3 text-left text-xs"
      >
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-tight",
            EVENT_TYPE_CHIP[ev.event_type],
          )}
        >
          <span className="text-base font-bold">{start.getDate()}</span>
          <span className="text-[0.65rem]">{start.toLocaleDateString("th-TH", { month: "short" })}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{ev.name}</span>
          <span className="block text-muted-foreground">
            {EVENT_TYPE_LABEL[ev.event_type]}
            {ev.end_date !== ev.start_date && ` · ${shortDate(ev.start_date)} - ${shortDate(ev.end_date)}`}
          </span>
        </span>
      </button>
    );
  }

  const canCreateOn = (day: Date) => mayEdit && day.getDay() !== 0 && day.getDay() !== 6;
  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="ก่อนหน้า">
            <ChevronBack className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="ถัดไป">
            <ChevronForward className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFocus(new Date())}>
            วันนี้
          </Button>
          <Select
            className="w-32"
            value={String(focus.getMonth())}
            onChange={(e) => setFocus(withMonth(focus, focus.getFullYear(), Number(e.target.value)))}
            aria-label="เดือน"
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </Select>
          <Select
            className="w-24"
            value={String(focus.getFullYear())}
            onChange={(e) => setFocus(withMonth(focus, Number(e.target.value), focus.getMonth()))}
            aria-label="ปี"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </Select>
          {isLoading && (
            <span role="status" aria-label="กำลังโหลด">
              <Skeleton className="h-4 w-4 rounded-full" />
            </span>
          )}

          <div role="tablist" aria-label="มุมมอง" className="ml-auto flex rounded-xl border border-border bg-card p-0.5">
            {(Object.keys(VIEW_LABEL) as CalView[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium",
                  view === v ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          {orgWide && (
            <Button
              variant="outline"
              size="icon"
              disabled={syncHolidays.isPending}
              aria-label="ดึงวันหยุดราชการ"
              onClick={() =>
                syncHolidays.mutate(undefined, {
                  onSuccess: (data) => toast(`ดึงวันหยุดสำเร็จ ${data.upserted} รายการ`),
                  onError: () => toast("ดึงวันหยุดไม่สำเร็จ"),
                })
              }
            >
              {syncHolidays.isPending ? <Spinner className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
            </Button>
          )}
          {mayEdit && (
            <Button size="icon" aria-label="เพิ่มกิจกรรม" onClick={() => setCreating("")}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-4">
        {view === "month" && (
          <div className="font-sarabun grid grid-cols-7 overflow-hidden rounded-2xl border-l border-t border-border bg-card">
            {WEEKDAY_LABEL.map((w) => (
              <div key={w} className="border-b border-r border-border py-2.5 text-center text-xs font-semibold">
                {w}
              </div>
            ))}
            {monthDays.map((day) => {
              const iso = toISODate(day);
              const dayEvents = eventsByDay.get(iso) ?? [];
              const inMonth = day.getMonth() === focus.getMonth();
              const isToday = iso === todayISO;
              const canCreate = canCreateOn(day);
              return (
                <div
                  key={iso}
                  onClick={() => canCreate && setCreating(iso)}
                  className={cn(
                    "flex min-h-28 flex-col gap-1 border-b border-r border-border p-1.5 text-xs",
                    !inMonth && "text-muted-foreground/60",
                    isToday && "bg-muted/60",
                    canCreate && "cursor-pointer hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.slice(0, 2).map(chip)}
                  {dayEvents.length > 2 && (
                    <button
                      type="button"
                      className="px-1 text-left text-[0.7rem] text-muted-foreground hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocus(day);
                        setView("day");
                      }}
                    >
                      +{dayEvents.length - 2}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === "week" && (
          <div className="font-sarabun grid grid-cols-7 overflow-hidden rounded-2xl border-l border-t border-border bg-card">
            {weekDays.map((day) => {
              const iso = toISODate(day);
              const isToday = iso === todayISO;
              const canCreate = canCreateOn(day);
              return (
                <div key={iso} className="min-w-0">
                  <div className="border-b border-r border-border py-2 text-center text-xs">
                    <div className="font-semibold">{WEEKDAY_LABEL[day.getDay()]}</div>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full font-medium",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div
                    onClick={() => canCreate && setCreating(iso)}
                    className={cn(
                      "min-h-72 space-y-1 border-b border-r border-border p-1.5",
                      isToday && "bg-muted/60",
                      canCreate && "cursor-pointer hover:bg-muted/50",
                    )}
                  >
                    {(eventsByDay.get(iso) ?? []).map(chip)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "day" && (
          <Card className="space-y-3">
            <p className="text-sm font-semibold">
              {focus.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            {(eventsByDay.get(focusISO) ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">ไม่มีกิจกรรมในวันนี้</p>
            ) : (
              (eventsByDay.get(focusISO) ?? []).map(eventRow)
            )}
            {canCreateOn(focus) && (
              <Button variant="outline" size="sm" onClick={() => setCreating(focusISO)}>
                <Plus className="h-3.5 w-3.5" /> เพิ่มกิจกรรมวันนี้
              </Button>
            )}
          </Card>
        )}

        {view === "list" && (
          <Card className="space-y-3">
            {monthEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">ไม่มีกิจกรรมในเดือนนี้</p>
            ) : (
              monthEvents.map(eventRow)
            )}
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="space-y-2.5">
          <p className="text-sm font-semibold">ตัวกรองกิจกรรม</p>
          {(Object.keys(EVENT_TYPE_LABEL) as AcademicEventType[]).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={!hidden.has(t)}
                onChange={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (!next.delete(t)) next.add(t);
                    return next;
                  })
                }
              />
              <span className={cn("h-2 w-2 rounded-full", EVENT_TYPE_DOT[t])} />
              {EVENT_TYPE_LABEL[t]}
            </label>
          ))}
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">กิจกรรมที่ใกล้ถึง</p>
            <button
              type="button"
              className="text-xs font-medium hover:underline"
              onClick={() => {
                setFocus(new Date());
                setView("list");
              }}
            >
              ดูทั้งหมด
            </button>
          </div>
          {upcoming.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีกิจกรรม</p>}
          {upcoming.map(eventRow)}
        </Card>
      </aside>
      </div>

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
  const toast = useToast();
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
    save.mutate(
      { id: event?.id, ...draft },
      {
        onSuccess: () => {
          toast(mode === "create" ? "เพิ่ม Event สำเร็จ" : "บันทึกสำเร็จ");
          onClose();
        },
      },
    );
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
