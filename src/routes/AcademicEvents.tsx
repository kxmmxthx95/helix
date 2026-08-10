import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
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
  const { data: departments = [] } = useDepartments();
  const { data: events = [], isLoading } = useAcademicEvents();
  const del = useDeleteAcademicEvent();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [editing, setEditing] = useState<AcademicEventRow | null>(null);
  const [creating, setCreating] = useState(false);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  // A dept_head may only edit events linked to their own department — a
  // whole-school event (no links) is org-wide only. UI hides what the role
  // can't do; RLS is the real boundary (see migration 0018).
  function canEditRow(row: AcademicEventRow) {
    if (orgWide) return true;
    if (!mayEdit || !me?.department_id) return false;
    return row.departmentIds.includes(me.department_id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ปฏิทินกิจกรรม/วันหยุด</h2>
        {mayEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            เพิ่ม Event
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มี Event ในระบบ" />
      )}

      {!isLoading && events.length > 0 && (
        <Card className="divide-y divide-border p-0">
          {events.map((ev) => (
            <div
              key={ev.id}
              onClick={() => canEditRow(ev) && setEditing(ev)}
              className={cn(
                "flex flex-wrap items-center gap-2 p-3 text-sm",
                canEditRow(ev) && "cursor-pointer active:bg-muted",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{ev.name}</div>
                <div className="text-xs text-muted-foreground">
                  {EVENT_TYPE_LABEL[ev.event_type]} · {ev.start_date}
                  {ev.end_date !== ev.start_date ? ` – ${ev.end_date}` : ""} ·{" "}
                  {ev.departmentIds.length === 0
                    ? "ทั้งโรงเรียน"
                    : ev.departmentIds.map((id) => deptName.get(id) ?? "—").join(", ")}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  ev.students_attend ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning",
                )}
              >
                นักเรียน{ev.students_attend ? "มาเรียน" : "หยุด"}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  ev.staff_attend ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning",
                )}
              >
                ครู{ev.staff_attend ? "ทำงาน" : "หยุด"}
              </span>
            </div>
          ))}
        </Card>
      )}

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
        open={creating}
        orgWide={orgWide}
        myDepartmentId={me?.department_id ?? null}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

function EventSheet({
  mode,
  event,
  open,
  orgWide,
  myDepartmentId,
  onClose,
  onDelete,
}: {
  mode: "create" | "edit";
  event: AcademicEventRow | null;
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
    start_date: "",
    end_date: "",
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
