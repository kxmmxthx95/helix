import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Field, FormSection, Input, Select, SheetFormContext, Spinner } from "@/components/ui";
import { useHandoverAssignments } from "@/hooks/useTeachingLoad";
import { profileFullName, type TeachingAssignment } from "@/lib/database.types";
import type { ProfileRow } from "@/hooks/useProfiles";

export type HandoverRow = { assignment: TeachingAssignment; title: string; code: string; room: string; periods: number };

const today = () => new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd, local

/**
 * ส่งต่อภาระงานของครูที่ย้ายออก (migration 0210). Each row picks its own receiver; the shortcut fills them all.
 * A receiver who already teaches the same subject × room is disabled (the DB rejects it too).
 */
export function TeacherHandoverSheet({
  open,
  onClose,
  fromName,
  rows,
  allAssignments,
  receivers,
}: {
  open: boolean;
  onClose: () => void;
  fromName: string;
  rows: HandoverRow[];
  /** Every assignment of the department in view — to spot receivers who already teach the same subject × room. */
  allAssignments: TeachingAssignment[];
  receivers: ProfileRow[];
}) {
  const toast = useToast();
  const handover = useHandoverAssignments();
  const [pick, setPick] = useState<Record<string, string>>({});
  const [effective, setEffective] = useState(today);

  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const a of allAssignments)
      if (a.teacher_id) s.add(`${a.teacher_id}|${a.subject_id}|${a.classroom_id}`);
    return s;
  }, [allAssignments]);
  const blocked = (a: TeachingAssignment, teacherId: string) =>
    taken.has(`${teacherId}|${a.subject_id}|${a.classroom_id}`);

  function fillAll(teacherId: string) {
    setPick(
      Object.fromEntries(
        rows.filter((r) => teacherId && !blocked(r.assignment, teacherId)).map((r) => [r.assignment.id, teacherId]),
      ),
    );
  }

  const items = rows.flatMap((r) => {
    const to = pick[r.assignment.id];
    return to ? [{ assignment_id: r.assignment.id, to_teacher: to }] : [];
  });

  function submit() {
    handover.mutate(
      { items, effective },
      {
        onSuccess: (r) => {
          const extra = [
            r.sessions_moved ? `รอบสอบ ${r.sessions_moved} รอบย้ายตาม` : "",
            r.sessions_left ? `รอบสอบ ${r.sessions_left} รอบต้องตรวจเอง (ห้องแยกครูคนละคน)` : "",
            r.plans_unlinked ? `ยกเลิกรวมแผน ${r.plans_unlinked} รายการ` : "",
          ].filter(Boolean);
          toast(`ส่งต่อ ${r.moved} รายวิชาแล้ว${extra.length ? " · " + extra.join(" · ") : ""}`, "success");
          setPick({});
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งต่อไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="ส่งต่อภาระงาน"
      description={`ย้ายภาระงานของ ${fromName} ให้ครูผู้รับ — แผนการสอน ตารางสอน และคะแนนจะตามไปกับรายวิชา`}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={submit}
            disabled={items.length === 0 || !effective || handover.isPending}
          >
            {handover.isPending ? <Spinner className="h-3 w-3" /> : `ยืนยันส่งต่อ${items.length ? ` (${items.length})` : ""}`}
          </Button>
        </div>
      }
    >
      <SheetFormContext.Provider value>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormSection title="ผู้รับและวันที่มีผล">
              <Field label="ส่งทั้งหมดให้">
                <Select value="" onChange={(e) => fillAll(e.target.value)} placeholder="เลือกครูผู้รับ">
                  {receivers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {profileFullName(t)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="วันที่มีผล">
                <Input type="date" value={effective} max={today()} onChange={(e) => setEffective(e.target.value)} />
              </Field>
            </FormSection>
            <p className="px-0.5 text-xs text-muted-foreground">ใช้บันทึกประวัติผู้สอนเท่านั้น ย้อนหลังได้ ห้ามเกินวันนี้</p>
          </div>

          <FormSection title={`รายวิชาที่ส่งต่อ (${rows.length})`}>
            {rows.map(({ assignment: a, title, code, room, periods }) => (
              <Field
                key={a.id}
                label={
                  <>
                    <span className="block font-medium text-foreground">{title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-accent">{code}</span>
                      <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-success">{room}</span>
                    </span>
                    <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">{periods} คาบ/สัปดาห์</span>
                  </>
                }
              >
                <Select
                  value={pick[a.id] ?? ""}
                  aria-label={`ครูผู้รับ ${title} ${code} ${room}`}
                  onChange={(e) => setPick((p) => ({ ...p, [a.id]: e.target.value }))}
                  placeholder="ยังไม่ส่งต่อ"
                >
                  {receivers.map((t) => (
                    <option key={t.id} value={t.id} disabled={blocked(a, t.id)}>
                      {profileFullName(t)}
                      {blocked(a, t.id) ? " (สอนวิชา/ห้องนี้อยู่แล้ว)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </FormSection>
        </div>
      </SheetFormContext.Provider>
    </Sheet>
  );
}
