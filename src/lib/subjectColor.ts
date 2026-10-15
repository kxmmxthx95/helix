import type { GradeLevel, LearningArea, SubjectType } from "@/lib/database.types";

// Subject colours: hue = กลุ่มสาระ (fixed per area code, sub-areas inherit the parent's),
// shade = grade level (three steps over the department's grade ladder). The class
// strings are written out in full so Tailwind can see them.

export type AreaHue = "rose" | "blue" | "emerald" | "amber" | "orange" | "violet" | "cyan" | "pink" | "slate";

const HUE_BY_AREA_CODE: Record<string, AreaHue> = {
  thai: "rose",
  math: "blue",
  science: "emerald",
  social: "amber",
  health_pe: "orange",
  art: "violet",
  career: "cyan",
  foreign_lang: "pink",
  other: "slate",
};

/** Areas a school added itself get a stable colour from their id (never slate, which means "other"). */
const FALLBACK_HUES: AreaHue[] = ["rose", "blue", "emerald", "amber", "orange", "violet", "cyan", "pink"];

const SHADES: Record<AreaHue, [string, string, string]> = {
  rose: [
    "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100",
    "bg-rose-200 text-rose-950 dark:bg-rose-500/30 dark:text-rose-100",
    "bg-rose-300 text-rose-950 dark:bg-rose-500/45 dark:text-rose-50",
  ],
  blue: [
    "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100",
    "bg-blue-200 text-blue-950 dark:bg-blue-500/30 dark:text-blue-100",
    "bg-blue-300 text-blue-950 dark:bg-blue-500/45 dark:text-blue-50",
  ],
  emerald: [
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100",
    "bg-emerald-200 text-emerald-950 dark:bg-emerald-500/30 dark:text-emerald-100",
    "bg-emerald-300 text-emerald-950 dark:bg-emerald-500/45 dark:text-emerald-50",
  ],
  amber: [
    "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
    "bg-amber-200 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100",
    "bg-amber-300 text-amber-950 dark:bg-amber-500/45 dark:text-amber-50",
  ],
  orange: [
    "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-100",
    "bg-orange-200 text-orange-950 dark:bg-orange-500/30 dark:text-orange-100",
    "bg-orange-300 text-orange-950 dark:bg-orange-500/45 dark:text-orange-50",
  ],
  violet: [
    "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100",
    "bg-violet-200 text-violet-950 dark:bg-violet-500/30 dark:text-violet-100",
    "bg-violet-300 text-violet-950 dark:bg-violet-500/45 dark:text-violet-50",
  ],
  cyan: [
    "bg-cyan-100 text-cyan-900 dark:bg-cyan-500/15 dark:text-cyan-100",
    "bg-cyan-200 text-cyan-950 dark:bg-cyan-500/30 dark:text-cyan-100",
    "bg-cyan-300 text-cyan-950 dark:bg-cyan-500/45 dark:text-cyan-50",
  ],
  pink: [
    "bg-pink-100 text-pink-900 dark:bg-pink-500/15 dark:text-pink-100",
    "bg-pink-200 text-pink-950 dark:bg-pink-500/30 dark:text-pink-100",
    "bg-pink-300 text-pink-950 dark:bg-pink-500/45 dark:text-pink-50",
  ],
  slate: [
    "bg-slate-100 text-slate-900 dark:bg-slate-500/15 dark:text-slate-100",
    "bg-slate-200 text-slate-950 dark:bg-slate-500/30 dark:text-slate-100",
    "bg-slate-300 text-slate-950 dark:bg-slate-500/45 dark:text-slate-50",
  ],
};

/** Same hue/step as SHADES, as a soft diagonal gradient (one shade deeper) — timetable cards. */
const GRADIENTS: Record<AreaHue, [string, string, string]> = {
  rose: [
    "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-900 dark:from-rose-500/15 dark:to-rose-500/30 dark:text-rose-100",
    "bg-gradient-to-br from-rose-200 to-rose-300 text-rose-950 dark:from-rose-500/30 dark:to-rose-500/45 dark:text-rose-100",
    "bg-gradient-to-br from-rose-300 to-rose-400 text-rose-950 dark:from-rose-500/45 dark:to-rose-500/60 dark:text-rose-50",
  ],
  blue: [
    "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-900 dark:from-blue-500/15 dark:to-blue-500/30 dark:text-blue-100",
    "bg-gradient-to-br from-blue-200 to-blue-300 text-blue-950 dark:from-blue-500/30 dark:to-blue-500/45 dark:text-blue-100",
    "bg-gradient-to-br from-blue-300 to-blue-400 text-blue-950 dark:from-blue-500/45 dark:to-blue-500/60 dark:text-blue-50",
  ],
  emerald: [
    "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-900 dark:from-emerald-500/15 dark:to-emerald-500/30 dark:text-emerald-100",
    "bg-gradient-to-br from-emerald-200 to-emerald-300 text-emerald-950 dark:from-emerald-500/30 dark:to-emerald-500/45 dark:text-emerald-100",
    "bg-gradient-to-br from-emerald-300 to-emerald-400 text-emerald-950 dark:from-emerald-500/45 dark:to-emerald-500/60 dark:text-emerald-50",
  ],
  amber: [
    "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900 dark:from-amber-500/15 dark:to-amber-500/30 dark:text-amber-100",
    "bg-gradient-to-br from-amber-200 to-amber-300 text-amber-950 dark:from-amber-500/30 dark:to-amber-500/45 dark:text-amber-100",
    "bg-gradient-to-br from-amber-300 to-amber-400 text-amber-950 dark:from-amber-500/45 dark:to-amber-500/60 dark:text-amber-50",
  ],
  orange: [
    "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-900 dark:from-orange-500/15 dark:to-orange-500/30 dark:text-orange-100",
    "bg-gradient-to-br from-orange-200 to-orange-300 text-orange-950 dark:from-orange-500/30 dark:to-orange-500/45 dark:text-orange-100",
    "bg-gradient-to-br from-orange-300 to-orange-400 text-orange-950 dark:from-orange-500/45 dark:to-orange-500/60 dark:text-orange-50",
  ],
  violet: [
    "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-900 dark:from-violet-500/15 dark:to-violet-500/30 dark:text-violet-100",
    "bg-gradient-to-br from-violet-200 to-violet-300 text-violet-950 dark:from-violet-500/30 dark:to-violet-500/45 dark:text-violet-100",
    "bg-gradient-to-br from-violet-300 to-violet-400 text-violet-950 dark:from-violet-500/45 dark:to-violet-500/60 dark:text-violet-50",
  ],
  cyan: [
    "bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-900 dark:from-cyan-500/15 dark:to-cyan-500/30 dark:text-cyan-100",
    "bg-gradient-to-br from-cyan-200 to-cyan-300 text-cyan-950 dark:from-cyan-500/30 dark:to-cyan-500/45 dark:text-cyan-100",
    "bg-gradient-to-br from-cyan-300 to-cyan-400 text-cyan-950 dark:from-cyan-500/45 dark:to-cyan-500/60 dark:text-cyan-50",
  ],
  pink: [
    "bg-gradient-to-br from-pink-100 to-pink-200 text-pink-900 dark:from-pink-500/15 dark:to-pink-500/30 dark:text-pink-100",
    "bg-gradient-to-br from-pink-200 to-pink-300 text-pink-950 dark:from-pink-500/30 dark:to-pink-500/45 dark:text-pink-100",
    "bg-gradient-to-br from-pink-300 to-pink-400 text-pink-950 dark:from-pink-500/45 dark:to-pink-500/60 dark:text-pink-50",
  ],
  slate: [
    "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-900 dark:from-slate-500/15 dark:to-slate-500/30 dark:text-slate-100",
    "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-950 dark:from-slate-500/30 dark:to-slate-500/45 dark:text-slate-100",
    "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-950 dark:from-slate-500/45 dark:to-slate-500/60 dark:text-slate-50",
  ],
};

const DOTS: Record<AreaHue, string> = {
  rose: "bg-rose-400",
  blue: "bg-blue-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  orange: "bg-orange-400",
  violet: "bg-violet-400",
  cyan: "bg-cyan-400",
  pink: "bg-pink-400",
  slate: "bg-slate-400",
};

export type GradeStep = 0 | 1 | 2;

export const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  basic: "พื้นฐาน",
  additional: "เพิ่มเติม",
  activity: "กิจกรรม",
};

/** Solid pills so they stand out from the pastel area hue behind them; colours chosen to avoid the area hues. */
export const SUBJECT_TYPE_BADGE: Record<SubjectType, string> = {
  basic: "bg-slate-700 text-white dark:bg-slate-500",
  additional: "bg-indigo-600 text-white dark:bg-indigo-500",
  activity: "bg-lime-600 text-white dark:bg-lime-600",
};

export function areaHue(areaId: string | null | undefined, areaById: Map<string, LearningArea>): AreaHue {
  const area = areaId ? areaById.get(areaId) : undefined;
  if (!area) return "slate";
  const top = area.parent_id ? (areaById.get(area.parent_id) ?? area) : area;
  const known = HUE_BY_AREA_CODE[top.code];
  if (known) return known;
  let h = 0;
  for (const ch of top.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_HUES[h % FALLBACK_HUES.length]!;
}

/** Name and id of the top-level area a subject belongs to — for the legend. */
export function topArea(areaId: string | null | undefined, areaById: Map<string, LearningArea>) {
  const area = areaId ? areaById.get(areaId) : undefined;
  return area?.parent_id ? (areaById.get(area.parent_id) ?? area) : area;
}

/** Grade → 0/1/2 by position in its department's ladder, split into thirds (ม.1-2 / ม.3-4 / ม.5-6). Unknown grade = middle. */
export function gradeStep(gradeLevelId: string | null | undefined, gradeLevels: GradeLevel[]): GradeStep {
  const grade = gradeLevels.find((g) => g.id === gradeLevelId);
  if (!grade) return 1;
  const ladder = gradeLevels.filter((g) => g.department_id === grade.department_id).sort((a, b) => a.sort_order - b.sort_order);
  if (ladder.length < 2) return 1;
  const idx = ladder.findIndex((g) => g.id === grade.id);
  return Math.min(2, Math.floor((idx * 3) / ladder.length)) as GradeStep;
}

/** Tailwind 100/200/300 of each hue as hex — for PDF cells, where class strings don't apply. */
const SHADE_HEX: Record<AreaHue, [string, string, string]> = {
  rose: ["#ffe4e6", "#fecdd3", "#fda4af"],
  blue: ["#dbeafe", "#bfdbfe", "#93c5fd"],
  emerald: ["#d1fae5", "#a7f3d0", "#6ee7b7"],
  amber: ["#fef3c7", "#fde68a", "#fcd34d"],
  orange: ["#ffedd5", "#fed7aa", "#fdba74"],
  violet: ["#ede9fe", "#ddd6fe", "#c4b5fd"],
  cyan: ["#cffafe", "#a5f3fc", "#67e8f9"],
  pink: ["#fce7f3", "#fbcfe8", "#f9a8d4"],
  slate: ["#f1f5f9", "#e2e8f0", "#cbd5e1"],
};

export const subjectHex = (hue: AreaHue, step: GradeStep = 1) => SHADE_HEX[hue][step];
export const subjectShade = (hue: AreaHue, step: GradeStep = 1) => SHADES[hue][step];
export const subjectGradient = (hue: AreaHue, step: GradeStep = 1) => GRADIENTS[hue][step];
export const areaDot = (hue: AreaHue) => DOTS[hue];
