import type { PeriodDefinition, PeriodType } from "@/lib/database.types";

export const hhmm = (t: string) => t.slice(0, 5);

/** Grade-specific rows (0031) override the department default at the same day+period_no. */
export function mergePeriods(defaults: PeriodDefinition[], grade: PeriodDefinition[]) {
  const map = new Map(defaults.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));
  for (const p of grade) map.set(`${p.day_of_week}-${p.period_no}`, p);
  return [...map.values()];
}

/** Breaks share period_no's sequence in the DB but aren't "คาบ" — this is the number users see (teaching periods only). */
export function teachingOrdinal(periods: { day_of_week: number; period_no: number; period_type: PeriodType }[], day: number, periodNo: number) {
  return periods.filter((p) => p.day_of_week === day && p.period_type === "teaching" && p.period_no <= periodNo).length;
}

/** The period's time row for a grade: its own override if any, else the department default. */
export function periodTimes(periods: PeriodDefinition[], gradeLevelId: string | null, day: number, periodNo: number) {
  const rows = periods.filter((p) => p.day_of_week === day && p.period_no === periodNo);
  return (gradeLevelId ? rows.find((p) => p.grade_level_id === gradeLevelId) : undefined) ?? rows.find((p) => !p.grade_level_id);
}

/** Entries plus their start/end time, so planSlots can test them against event windows. */
export function withTimes<T extends { day_of_week: number; period_no: number }>(
  entries: T[],
  periods: PeriodDefinition[],
  gradeLevelId: string | null,
) {
  return entries.map((e) => {
    const p = periodTimes(periods, gradeLevelId, e.day_of_week, e.period_no);
    return p ? { ...e, start_time: p.start_time, end_time: p.end_time } : e;
  });
}
