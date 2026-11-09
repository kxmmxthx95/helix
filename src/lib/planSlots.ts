import type { AcademicTerm, TeachingAssignment } from "@/lib/database.types";

// Slot grid of a teaching_assignment: weekly schedule_entries x term dates, minus
// days students don't attend (holiday/suspended — academic_events). Pure: dates
// are YYYY-MM-DD strings handled in UTC so the user's timezone never shifts a day.

export type SlotCell = { date: string; dayOfWeek: number; periodNo: number };
type Entry = { day_of_week: number; period_no: number };
type Event = { start_date: string; end_date: string; students_attend: boolean };

const DAY_MS = 86_400_000;

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function isoDow(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoDow(date));
}

export function computeSlots(range: { start: string; end: string }, entries: Entry[], events: Event[]): SlotCell[] {
  const out: SlotCell[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    if (events.some((e) => !e.students_attend && e.start_date <= d && d <= e.end_date)) continue;
    const dow = isoDow(d);
    for (const e of entries) if (e.day_of_week === dow) out.push({ date: d, dayOfWeek: dow, periodNo: e.period_no });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.periodNo - b.periodNo);
}

/** Term dates for the assignment: its term, or the whole year (min start .. max end) when term is null. */
export function termRange(terms: AcademicTerm[], a: TeachingAssignment, departmentId: string | null) {
  const rows = terms.filter(
    (t) =>
      t.department_id === departmentId &&
      t.academic_year === a.academic_year &&
      t.start_date &&
      t.end_date &&
      (a.term === null ? t.term_type !== "summer" : t.term_type === (a.term === 1 ? "term1" : "term2")),
  );
  if (rows.length === 0) return null;
  return {
    start: rows.map((t) => t.start_date as string).sort()[0] as string,
    end: rows.map((t) => t.end_date as string).sort().reverse()[0] as string,
  };
}
