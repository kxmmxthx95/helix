import { Fragment, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronForward } from "@/components/icons";
import { Card, Select, Skeleton } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useLearningAreas } from "@/hooks/useCurriculum";
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
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: learningAreas = [] } = useLearningAreas();
  const { data: departments = [] } = useDepartments();

  const assignmentIds = useMemo(() => assignments.map((a) => a.id), [assignments]);
  const { data: units = [] } = useTeachingPlanUnitsForAssignments(assignmentIds);

  const [selectedId, setSelectedId] = useState("");

  function label(a: TeachingAssignment) {
    const t = teachers.find((x) => x.id === a.teacher_id);
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id);
    const la = learningAreas.find((x) => x.id === s?.learning_area_id);
    const dept = departments.find((x) => x.id === s?.department_id);
    return {
      teacher: t ? profileFullName(t) : "—",
      code: s?.code ?? "—",
      learningArea: la?.name ?? "—",
      name: s?.name_th ?? "—",
      department: dept?.name ?? "—",
      gradeLevel: g?.name ?? "—",
      classroom: c?.name ?? "—",
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

  return (
    <Card className="space-y-3 p-0">
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด" className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">ครูผู้สอน</th>
                <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                <th className="px-3 py-2 font-medium">กลุ่มสาระ</th>
                <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                <th className="px-3 py-2 font-medium">แผนก</th>
                <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2 font-medium">ห้อง</th>
                <th className="px-3 py-2 font-medium">ความคืบหน้า</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => (
                <tr key={i} className="h-[40px] border-t border-border">
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-3" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-24" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-12" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-20" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-28" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-14" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-3 w-10" />
                  </td>
                  <td className="px-3 py-0">
                    <Skeleton className="h-4 w-20 rounded-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">ครูผู้สอน</th>
                  <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                  <th className="px-3 py-2 font-medium">กลุ่มสาระ</th>
                  <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                  <th className="px-3 py-2 font-medium">ห้อง</th>
                  <th className="px-3 py-2 font-medium">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const l = label(r.assignment);
                  const open = selectedId === r.assignment.id;
                  const rowUnits = units.filter((u) => u.teaching_assignment_id === r.assignment.id);
                  return (
                    <Fragment key={r.assignment.id}>
                      <tr
                        onClick={() => setSelectedId(open ? "" : r.assignment.id)}
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
                        <td className="px-3 py-0 font-medium">{l.teacher}</td>
                        <td className="px-3 py-0 text-xs">{l.code}</td>
                        <td className="px-3 py-0">{l.learningArea}</td>
                        <td className="px-3 py-0">{l.name}</td>
                        <td className="px-3 py-0">{l.department}</td>
                        <td className="px-3 py-0">{l.gradeLevel}</td>
                        <td className="px-3 py-0">{l.classroom}</td>
                        <td className="px-3 py-0">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {r.completed}/{r.total} หน่วย
                            </span>
                            {r.offPlan > 0 && (
                              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                                ไม่ตามแผน {r.offPlan} ครั้ง
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-t border-border">
                          <td colSpan={9} className="bg-muted/20 p-3">
                            <PlanDetail units={rowUnits} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">ยังไม่มีภาระงานสอนในแผนกนี้</p>
          )}
        </>
      )}
    </Card>
  );
}

/** Read-only — oversight view, no edit/mark actions (grill decision). */
function PlanDetail({ units }: { units: TeachingPlanUnit[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background text-sm">
      {units.map((u) => {
        const s = planUnitStatus(u);
        return (
          <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
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
      {units.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">ยังไม่มีการแบ่งหน่วยการสอน</li>}
    </ul>
  );
}
