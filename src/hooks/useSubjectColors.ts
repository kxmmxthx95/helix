import { useMemo } from "react";
import { useLearningAreas } from "@/hooks/useCurriculum";
import type { GradeLevel } from "@/lib/database.types";
import { areaDot, areaHue, gradeStep, subjectGradient, subjectHex, subjectShade, topArea, type GradeStep } from "@/lib/subjectColor";

/**
 * Colours for subjects: hue from the กลุ่มสาระ, shade from the grade level (when a grade is known).
 * `gradeLevels` is the ladder the grade is looked up in; pass [] where no grade applies.
 */
export function useSubjectColors(gradeLevels: GradeLevel[]) {
  const { data: areas = [] } = useLearningAreas();
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  return useMemo(
    () => ({
      shade: (areaId: string | null | undefined, gradeLevelId?: string | null) =>
        subjectShade(areaHue(areaId, areaById), gradeLevelId ? gradeStep(gradeLevelId, gradeLevels) : 1),
      gradient: (areaId: string | null | undefined, gradeLevelId?: string | null) =>
        subjectGradient(areaHue(areaId, areaById), gradeLevelId ? gradeStep(gradeLevelId, gradeLevels) : 1),
      hex: (areaId: string | null | undefined, gradeLevelId?: string | null) =>
        subjectHex(areaHue(areaId, areaById), gradeLevelId ? gradeStep(gradeLevelId, gradeLevels) : 1),
      /** Shade of an area's hue at an explicit grade step (legend ramp). */
      shadeAt: (areaId: string, step: GradeStep) => subjectShade(areaHue(areaId, areaById), step),
      /** One chip per distinct top-level area among `areaIds` — the legend. */
      legend: (areaIds: (string | null | undefined)[]) => {
        const seen = new Map<string, { id: string; name: string; dot: string }>();
        for (const id of areaIds) {
          const top = topArea(id, areaById);
          if (top && !seen.has(top.id)) seen.set(top.id, { id: top.id, name: top.name, dot: areaDot(areaHue(top.id, areaById)) });
        }
        return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
      },
    }),
    [areaById, gradeLevels],
  );
}
