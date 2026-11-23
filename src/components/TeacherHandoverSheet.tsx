import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Field, Input, Select, Spinner } from "@/components/ui";
import { useHandoverAssignments } from "@/hooks/useTeachingLoad";
import { profileFullName, type TeachingAssignment } from "@/lib/database.types";
import type { ProfileRow } from "@/hooks/useProfiles";

export type HandoverRow = { assignment: TeachingAssignment; label: string };

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
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">เลือกผู้รับแล้ว {items.length}/{rows.length} รายวิชา</p>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={items.length === 0 || !effective || handover.isPending}>
              {handover.isPending ? <Spinner className="h-3 w-3" /> : "ยืนยันส่งต่อ"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ส่งทั้งหมดให้">
            <Select value="" onChange={(e) => fillAll(e.target.value)} aria-label="ส่งทั้งหมดให้" placeholder="เลือกครูผู้รับ">
              {receivers.map((t) => (
                <option key={t.id} value={t.id}>
                  {profileFullName(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="วันที่มีผล">
            <Input type="date" value={effective} max={today()} onChange={(e) => setEffective(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">ใช้บันทึกประวัติผู้สอนเท่านั้น ย้อนหลังได้ ห้ามเกินวันนี้</p>
          </Field>
        </div>

        <ul className="space-y-2">
          {rows.map(({ assignment: a, label }) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
              <Select
                className="w-auto min-w-[10rem]"
                value={pick[a.id] ?? ""}
                aria-label={`ครูผู้รับ ${label}`}
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
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
