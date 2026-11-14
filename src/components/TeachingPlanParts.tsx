import { useLearningAreas, useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import type { slotStats } from "@/hooks/useTeachingPlanSlots";
import type { TeachingAssignment } from "@/lib/database.types";
import { cn } from "@/lib/utils";

/** Thin progress bar with an "n/N คาบ" label. */
export function PlanProgress({ stats, className }: { stats: ReturnType<typeof slotStats>; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fill"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stats.pct}
        aria-label="ความคืบหน้า"
      >
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${stats.pct}%` }} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {stats.completed}/{stats.total} คาบ
      </span>
    </div>
  );
}

/** code / learning area / name / "ชั้น · ห้อง" of an assignment, resolved from the department's lists. */
export function useAssignmentLabel(departmentId: string | null) {
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
  return (a: TeachingAssignment) => {
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id);
    return {
      code: s?.code ?? "—",
      learningArea: learningAreas.find((x) => x.id === s?.learning_area_id)?.name ?? "",
      name: s?.name_th ?? "—",
      grade: g?.name ?? "—",
      room: c?.name ?? "—",
      where: [g?.name, c?.name].filter(Boolean).join(" · ") || "—",
    };
  };
}
