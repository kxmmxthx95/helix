import { useMemo } from "react";
import { useLearningAreas } from "@/hooks/useCurriculum";
import type { GradeLevel } from "@/lib/database.types";
import { BookIcon, BriefcaseIcon, FlaskIcon, FormulaIcon, GlobeIcon, LanguageIcon, LibraryIcon, PaletteIcon, SportIcon } from "@/components/icons";
import { areaDot, areaHue, gradeStep, subjectGradient, subjectHex, subjectOutline, subjectShade, topArea, type GradeStep } from "@/lib/subjectColor";

const ICON_BY_AREA_CODE = {
  thai: BookIcon,
  math: FormulaIcon,
  science: FlaskIcon,
  social: GlobeIcon,
  health_pe: SportIcon,
  art: PaletteIcon,
  career: BriefcaseIcon,
  foreign_lang: LanguageIcon,
} as const;

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
      outline: (areaId: string | null | undefined) => subjectOutline(areaHue(areaId, areaById)),
      hex: (areaId: string | null | undefined, gradeLevelId?: string | null) =>
        subjectHex(areaHue(areaId, areaById), gradeLevelId ? gradeStep(gradeLevelId, gradeLevels) : 1),
      /** Icon of the subject's กลุ่มสาระ (sub-areas use the parent's). */
      icon: (areaId: string | null | undefined) =>
        ICON_BY_AREA_CODE[topArea(areaId, areaById)?.code as keyof typeof ICON_BY_AREA_CODE] ?? LibraryIcon,
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
