import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Card, Select, Spinner } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { useDepartmentTeachingAssignments } from "@/hooks/useTeachingLoad";
import { planUnitStatus, useTeachingPlanUnitsForAssignments } from "@/hooks/useTeachingPlan";
import { profileFullName, type TeachingAssignment, type TeachingPlanUnit } from "@/lib/database.types";
import { canManageAcademic, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TERM_LABEL: Record<number, string> = { 1: "ภาคเรียน 1", 2: "ภาคเรียน 2" };

export function TeachingPlanOverview() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [term, setTerm] = useState<1 | 2>(1);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;

  if (!me || !canManageAcademic(me.roles)) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="space-y-4">
      {orgWide && departments.length > 0 && (
        <Select
          className="w-auto min-w-[10rem]"
          value={pickedDept}
          onChange={(e) => setPickedDept(e.target.value)}
          aria-label="แผนก"
          placeholder="เลือกแผนก"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}

      {splitsByTerm && (
        <div className="inline-flex h-8 gap-1 rounded-lg border border-border p-0.5">
          {[1, 2].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t as 1 | 2)}
              className={cn(
                "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                term === t
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {TERM_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {departmentId && (
        <OverviewBoard departmentId={departmentId} academicYear={academicYear} term={splitsByTerm ? term : null} />
      )}
    </div>
  );
}

type Row = { assignment: TeachingAssignment; total: number; completed: number; offPlan: number };

function OverviewBoard({
  departmentId,
  academicYear,
  term,
}: {
  departmentId: string;
  academicYear: number;
  term: number | null;
}) {
  const { data: assignments = [], isLoading } = useDepartmentTeachingAssignments(departmentId, academicYear, term);
  const { data: teachers = [] } = useProfiles({ search: "", departmentId, role: "teacher", active: "true" });
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);

  const assignmentIds = useMemo(() => assignments.map((a) => a.id), [assignments]);
  const { data: units = [] } = useTeachingPlanUnitsForAssignments(assignmentIds);

  const [selectedId, setSelectedId] = useState("");

  function label(a: TeachingAssignment) {
    const t = teachers.find((x) => x.id === a.teacher_id);
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.name;
    return {
      title: `${t ? profileFullName(t) : "—"} · ${s ? s.code : "—"}`,
      subtitle: `${c ? `${g ?? "—"}/${c.name}` : "—"}${a.term ? ` · ${TERM_LABEL[a.term]}` : ""}`,
    };
  }

  const rows: Row[] = useMemo(
    () =>
      assignments.map((a) => {
        const rowUnits = units.filter((u) => u.teaching_assignment_id === a.id);
        return {
          assignment: a,
          total: rowUnits.length,
          completed: rowUnits.filter((u) => u.completed_at !== null).length,
          offPlan: rowUnits.filter((u) => u.completed_on_plan === false).length,
        };
      }),
    [assignments, units],
  );

  const selected = rows.find((r) => r.assignment.id === selectedId);
  const selectedUnits = units.filter((u) => u.teaching_assignment_id === selectedId);

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Card className="space-y-3 p-0">
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto text-sm">
          {rows.map((r) => {
            const l = label(r.assignment);
            return (
              <li key={r.assignment.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.assignment.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors",
                    selectedId === r.assignment.id ? "bg-foreground/10" : "hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.title}</span>
                    <span className="text-xs text-muted-foreground">{l.subtitle}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {r.completed}/{r.total} หน่วย
                    </span>
                    {r.offPlan > 0 && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                        ไม่ตามแผน {r.offPlan} ครั้ง
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {isLoading && (
            <li className="flex justify-center py-8">
              <Spinner className="h-5 w-5 text-muted-foreground" />
            </li>
          )}
          {!isLoading && rows.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">ยังไม่มีภาระงานสอนในแผนกนี้</li>
          )}
        </ul>
      </Card>

      {selected ? (
        <PlanDetail label={label(selected.assignment)} units={selectedUnits} />
      ) : (
        <Card className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          เลือกวิชาทางซ้ายเพื่อดูรายละเอียดแผนการสอน
        </Card>
      )}
    </div>
  );
}

/** Read-only — oversight view, no edit/mark actions (grill decision). */
function PlanDetail({ label, units }: { label: { title: string; subtitle: string }; units: TeachingPlanUnit[] }) {
  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{label.title}</h3>
        <p className="text-xs text-muted-foreground">{label.subtitle}</p>
      </div>

      <ul className="divide-y divide-border text-sm">
        {units.map((u) => {
          const s = planUnitStatus(u);
          return (
            <li key={u.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  หน่วยที่ {u.unit_no} · {u.title}
                </span>
                {u.description && <span className="text-xs text-muted-foreground">{u.description}</span>}
                {u.note && <span className="block text-xs text-muted-foreground">บันทึก: {u.note}</span>}
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", s.className)}>{s.text}</span>
            </li>
          );
        })}
        {units.length === 0 && <p className="py-2 text-sm text-muted-foreground">ยังไม่มีการแบ่งหน่วยการสอน</p>}
      </ul>
    </Card>
  );
}
