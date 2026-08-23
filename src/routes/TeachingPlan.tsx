import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import {
  currentPlanUnit,
  planUnitStatus,
  useCreatePlanUnit,
  useDeletePlanUnit,
  useMarkPlanUnitTaught,
  useMyTeachingAssignments,
  useReopenPlanUnit,
  useTeachingPlanUnits,
  useUpdatePlanUnit,
} from "@/hooks/useTeachingPlan";
import type { TeachingAssignment, TeachingPlanUnit } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const TERM_LABEL: Record<number, string> = { 1: "เทอม 1", 2: "เทอม 2" };

export function TeachingPlan() {
  const { profile: me } = useAuth();
  const departmentId = me?.department_id ?? null;
  const { data: assignments = [], isLoading } = useMyTeachingAssignments(me?.id ?? null);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId: departmentId ?? "",
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const [selectedId, setSelectedId] = useState("");

  if (!me) return null;

  function label(a: TeachingAssignment) {
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.name;
    return {
      title: s ? `${s.code} · ${s.name_th}` : "—",
      subtitle: `${c ? `${g ?? "—"}/${c.name}` : "—"}${a.term ? ` · ${TERM_LABEL[a.term]}` : ""}`,
    };
  }

  const selected = assignments.find((a) => a.id === selectedId);

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Card className="space-y-3 p-0">
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto text-sm">
          {assignments.map((a) => {
            const l = label(a);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
                    selectedId === a.id ? "bg-foreground/10" : "hover:bg-muted",
                  )}
                >
                  <span className="truncate">{l.title}</span>
                  <span className="text-xs text-muted-foreground">{l.subtitle}</span>
                </button>
              </li>
            );
          })}
          {isLoading && (
            <li className="flex justify-center py-8">
              <Spinner className="h-5 w-5 text-muted-foreground" />
            </li>
          )}
          {!isLoading && assignments.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">ยังไม่มีวิชาที่ได้รับมอบหมาย</li>
          )}
        </ul>
      </Card>

      {selected ? (
        <PlanBoard assignment={selected} label={label(selected)} />
      ) : (
        <Card className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          เลือกวิชาทางซ้ายเพื่อดู/แก้ไขแผนการสอน
        </Card>
      )}
    </div>
  );
}

function PlanBoard({
  assignment,
  label,
}: {
  assignment: TeachingAssignment;
  label: { title: string; subtitle: string };
}) {
  const { data: units = [], isLoading } = useTeachingPlanUnits(assignment.id);
  const current = currentPlanUnit(units);
  const mark = useMarkPlanUnitTaught();
  const del = useDeletePlanUnit();
  const reopen = useReopenPlanUnit();
  const [note, setNote] = useState("");

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{label.title}</h3>
        <p className="text-xs text-muted-foreground">{label.subtitle}</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {!isLoading && current && (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">แผนวันนี้ — หน่วยที่ {current.unit_no}</p>
          <p className="text-sm font-medium">{current.title}</p>
          {current.description && <p className="text-xs text-muted-foreground">{current.description}</p>}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="บันทึกหลังการสอน (ถ้ามี)"
            className="mt-2"
          />
          <div className="mt-2 flex gap-1.5">
            <Button
              size="sm"
              onClick={() => mark.mutate({ id: current.id, onPlan: true, note }, { onSuccess: () => setNote("") })}
              disabled={mark.isPending}
            >
              สอนตามแผน
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mark.mutate({ id: current.id, onPlan: false, note }, { onSuccess: () => setNote("") })}
              disabled={mark.isPending}
            >
              ไม่ตามแผน
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !current && units.length > 0 && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          สอนครบตามแผนแล้วทุกหน่วย
        </p>
      )}

      {units.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">หน่วย</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {units.map((u) => {
                const s = planUnitStatus(u);
                return (
                  <PlanUnitRow
                    key={u.id}
                    unit={u}
                    status={s}
                    onDelete={() => del.mutate(u.id)}
                    onReopen={u.completed_at ? () => reopen.mutate(u.id) : undefined}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !isLoading && <p className="py-2 text-sm text-muted-foreground">ยังไม่มีการแบ่งหน่วยการสอน</p>
      )}

      <NewPlanUnitForm teachingAssignmentId={assignment.id} nextUnitNo={(units.at(-1)?.unit_no ?? 0) + 1} />
    </Card>
  );
}

function PlanUnitRow({
  unit,
  status,
  onDelete,
  onReopen,
}: {
  unit: TeachingPlanUnit;
  status: { text: string; className: string };
  onDelete: () => void;
  onReopen?: () => void;
}) {
  const update = useUpdatePlanUnit();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(unit.title);
  const [description, setDescription] = useState(unit.description ?? "");

  if (editing) {
    return (
      <tr>
        <td className="space-y-1.5 px-3 py-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="หัวข้อ" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียด (ถ้ามี)" />
        </td>
        <td className="px-3 py-2 align-top">
          <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", status.className)}>{status.text}</span>
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={!title.trim() || update.isPending}
              onClick={() =>
                update.mutate(
                  { id: unit.id, title: title.trim(), description: description.trim() || null },
                  { onSuccess: () => setEditing(false) },
                )
              }
            >
              บันทึก
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              ยกเลิก
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="min-w-0 px-3 py-2">
        <span className="block truncate">หน่วยที่ {unit.unit_no} · {unit.title}</span>
        {unit.description && <span className="block text-xs text-muted-foreground">{unit.description}</span>}
        {unit.note && <span className="block text-xs text-muted-foreground">บันทึก: {unit.note}</span>}
      </td>
      <td className="px-3 py-2 align-top">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", status.className)}>{status.text}</span>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-1.5">
          {onReopen && (
            <Button variant="outline" size="sm" onClick={onReopen}>
              เปิดใหม่
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            แก้ไข
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            ลบ
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NewPlanUnitForm({
  teachingAssignmentId,
  nextUnitNo,
}: {
  teachingAssignmentId: string;
  nextUnitNo: number;
}) {
  const create = useCreatePlanUnit();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        teaching_assignment_id: teachingAssignmentId,
        unit_no: nextUnitNo,
        title: title.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-3">
      <Field label={`หน่วยที่ ${nextUnitNo}`}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="หัวข้อ" />
      </Field>
      <div className="flex gap-2">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="รายละเอียด (ถ้ามี)"
          className="flex-1"
        />
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? <Spinner className="h-3 w-3" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </form>
  );
}

