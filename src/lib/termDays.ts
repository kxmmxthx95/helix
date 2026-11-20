const DAY_MS = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/**
 * Days students attend within [start, end] (inclusive): weekdays the department has teaching
 * periods on (1=Mon..6=Sat; none configured -> Mon-Fri), minus whole-day closures. Overlapping
 * closures and closures on non-school days are never double-counted.
 */
export function countSchoolDays(
  start: string,
  end: string,
  teachingWeekdays: number[],
  closures: { start_date: string; end_date: string }[],
): number {
  const weekdays = new Set(teachingWeekdays.length > 0 ? teachingWeekdays : [1, 2, 3, 4, 5]);
  const ranges = closures.map((c) => [utc(c.start_date), utc(c.end_date)] as const);
  let count = 0;
  for (let t = utc(start); t <= utc(end); t += DAY_MS) {
    const dow = new Date(t).getUTCDay() || 7; // Sunday -> 7, never a school day
    if (weekdays.has(dow) && !ranges.some(([from, to]) => t >= from && t <= to)) count++;
  }
  return count;
}
