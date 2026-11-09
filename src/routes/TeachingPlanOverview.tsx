import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronForward, Users } from "@/components/icons";
import { PlanProgress } from "@/components/TeachingPlanParts";
import { Card, EmptyState, Select, Skeleton } from "@/components/ui";
import { useActiveAcademicYear, useCurrentTerm } from "@/hooks/useAcademicTerms";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { useDepartmentTeachingAssignments } from "@/hooks/useTeachingLoad";
import { useAssignmentProgress } from "@/hooks/useTeachingPlanSlots";
import { profileFullName, type TeachingAssignment } from "@/lib/database.types";
import { canManageAcademic, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TERM_LABEL: Record<number, string> = { 1: "ภาคเรียน 1", 2: "ภาคเรียน 2" };

export function TeachingPlanOverview() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const { data: currentTerm } = useCurrentTerm(departmentId || null);
  const [pickedTerm, setTerm] = useState<1 | 2 | null>(null);
  const term = pickedTerm ?? currentTerm?.term ?? 1;
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;

  if (!me || !canManageAcademic(me.roles)) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          <div className="flex w-full shrink-0 gap-0 border-b border-border" role="tablist">
            {([1, 2] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={term === t}
                onClick={() => setTerm(t)}
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
                  term === t
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {TERM_LABEL[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูภาพรวมแผนการสอน" icon={Users} />
        </div>
      ) : (
        <OverviewBoard departmentId={departmentId} academicYear={academicYear} term={splitsByTerm ? term : null} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

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

  const { progress } = useAssignmentProgress(assignments, departmentId);

  function label(a: TeachingAssignment) {
    const t = teachers.find((x) => x.id === a.teacher_id);
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id);
    return {
      teacher: t ? profileFullName(t) : a.teacher_id === null ? "ไม่มีครู" : "—",
      code: s?.code ?? "—",
      name: s?.name_th ?? "—",
      where: [g?.name, c?.name].filter(Boolean).join(" · ") || "—",
    };
  }

  const rows = assignments;
  const all = useMemo(() => {
    const ps = [...progress.values()].map((p) => p.stats);
    const total = ps.reduce((n, p) => n + p.total, 0);
    const completed = ps.reduce((n, p) => n + p.completed, 0);
    return {
      total,
      completed,
      offPlan: ps.reduce((n, p) => n + p.offPlan, 0),
      noPlan: ps.filter((p) => p.planned === 0).length,
      pct: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [progress]);

  if (!isLoading && rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีภาระงานสอน" description="ยังไม่มีภาระงานสอนในแผนกนี้" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="ความคืบหน้ารวม" value={`${all.pct}%`} />
        <Stat label="คาบที่สอนแล้ว" value={`${all.completed}/${all.total}`} />
        <Stat label="สอนไม่ตามแผน" value={String(all.offPlan)} tone={all.offPlan ? "text-warning" : undefined} />
        <Stat label="วิชาที่ยังไม่วางหัวข้อ" value={String(all.noPlan)} tone={all.noPlan ? "text-warning" : undefined} />
      </div>

      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i} role="status" aria-label="กำลังโหลด" className="space-y-2 p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-1.5 w-full" />
              </Card>
            ))
          : rows.map((a) => {
              const l = label(a);
              const st = progress.get(a.id)?.stats;
              return (
                <Link
                  key={a.id}
                  to={`/teaching-plan/${a.id}`}
                  className="block rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{l.teacher}</span>
                    <ChevronForward className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-snug">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.code} · {l.where}
                  </p>
                  {st && <PlanProgress stats={st} className="mt-2" />}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {st && st.planned === 0 && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">ยังไม่วางหัวข้อ</span>
                    )}
                    {st && st.offPlan > 0 && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                        ไม่ตามแผน {st.offPlan} ครั้ง
                      </span>
                    )}
                    {st && st.total > 0 && st.completed === st.total && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">สอนครบ</span>
                    )}
                  </div>
                </Link>
              );
            })}
      </div>

    </div>
  );
}
