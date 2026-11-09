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
