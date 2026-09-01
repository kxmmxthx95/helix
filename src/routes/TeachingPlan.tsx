import { Fragment, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronForward, Plus } from "@/components/icons";
import { Button, Card, EmptyState, Field, Input, Skeleton, Spinner } from "@/components/ui";
import { useLearningAreas, useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
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
  const { data: learningAreas = [] } = useLearningAreas();
  const { data: departments = [] } = useDepartments();
  const [expandedId, setExpandedId] = useState("");

  if (!me) return null;

  function label(a: TeachingAssignment) {
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id);
    const la = learningAreas.find((x) => x.id === s?.learning_area_id);
    const dept = departments.find((x) => x.id === s?.department_id);
    return {
      code: s?.code ?? "—",
      learningArea: la?.name ?? "—",
      name: s?.name_th ?? "—",
      department: dept?.name ?? "—",
      gradeLevel: g?.name ?? "—",
      classroom: c?.name ?? "—",
    };
  }

  if (!isLoading && assignments.length === 0) {
    return (
      <div className="page-fill">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีวิชาที่ได้รับมอบหมาย" description="ติดต่อผู้ดูแลเพื่อมอบหมายภาระงานสอน" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-fill">
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                <th className="px-3 py-2 font-medium">กลุ่มสาระ</th>
                <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                <th className="px-3 py-2 font-medium">แผนก</th>
                <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2 font-medium">ห้อง</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [0, 1, 2].map((i) => (
                    <tr key={i} className="h-[40px] border-t border-border" role="status" aria-label="กำลังโหลด">
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-3 shrink-0" />
                      </td>
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-12" />
                      </td>
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-16" />
                      </td>
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-24" />
                      </td>
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-16" />
                      </td>
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-10" />
                      </td>
                      <td className="px-3 py-0">
                        <Skeleton className="h-3 w-10" />
                      </td>
                    </tr>
                  ))
                : assignments.map((a) => {
              const l = label(a);
              const open = expandedId === a.id;
              return (
                <Fragment key={a.id}>
                  <tr
                    onClick={() => setExpandedId(open ? "" : a.id)}
                    className={cn(
                      "h-[40px] cursor-pointer border-t border-border transition-colors",
                      open ? "bg-foreground/10" : "hover:bg-muted",
                    )}
                  >
                    <td className="px-3 py-0">
                      <ChevronForward
                        className={cn("h-3 w-3 shrink-0 rotate-90 text-muted-foreground transition-transform", open && "-rotate-90")}
                      />
                    </td>
                    <td className="px-3 py-0 text-xs">{l.code}</td>
                    <td className="px-3 py-0">{l.learningArea}</td>
                    <td className="px-3 py-0 font-medium">{l.name}</td>
                    <td className="px-3 py-0">{l.department}</td>
                    <td className="px-3 py-0">{l.gradeLevel}</td>
                    <td className="px-3 py-0">{l.classroom}</td>
                  </tr>
                  {open && (
                    <tr className="border-t border-border">
                      <td colSpan={7} className="bg-muted/20 p-3">
                        <PlanBoard assignment={a} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PlanBoard({ assignment }: { assignment: TeachingAssignment }) {
  const { data: units = [], isLoading } = useTeachingPlanUnits(assignment.id);
  const current = currentPlanUnit(units);
  const mark = useMarkPlanUnitTaught();
  const del = useDeletePlanUnit();
  const reopen = useReopenPlanUnit();
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      {isLoading && (
        <div role="status" aria-label="กำลังโหลด" className="space-y-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-1.5 h-4 w-40" />
            <div className="mt-2 flex gap-1.5">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">หน่วย</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {[0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <Skeleton className="h-3 w-32" />
                    </td>
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </td>
                    <td className="px-3 py-2">
                      <Skeleton className="h-3 w-20" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && current && (
        <div className="rounded-lg border border-border bg-background p-3">
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
        <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
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
            <tbody className="divide-y divide-border bg-background">
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
    </div>
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
