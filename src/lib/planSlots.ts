import type { AcademicTerm, TeachingAssignment } from "@/lib/database.types";

// Slot grid of a teaching_assignment: weekly schedule_entries x term dates, minus
// days students don't attend (holiday/suspended — academic_events). Pure: dates
// are YYYY-MM-DD strings handled in UTC so the user's timezone never shifts a day.

export type SlotCell = { date: string; dayOfWeek: number; periodNo: number };
type Entry = { day_of_week: number; period_no: number; start_time?: string; end_time?: string };
export type PlanEvent = {
  start_date: string;
  end_date: string;
  students_attend: boolean;
  replaces_classes?: boolean;
  start_time?: string | null;
  end_time?: string | null;
};
type Event = PlanEvent;
type Scoped = { departmentIds: string[]; gradeLevelIds?: string[] };

/** Does the event apply to this department/grade? No links = everyone (mirrors period_replaced_by_event in 0166). */
export function eventApplies(e: Scoped, departmentId: string | null, gradeLevelId: string | null) {
  return (
    (e.departmentIds.length === 0 || (!!departmentId && e.departmentIds.includes(departmentId))) &&
    (!e.gradeLevelIds?.length || (!!gradeLevelId && e.gradeLevelIds.includes(gradeLevelId)))
  );
}

/**
 * Is this period replaced by an event on `date`? Same rule as the SQL function
 * period_replaced_by_event (0166): closed-all-day events replace every period;
 * replaces_classes events replace every period (no window) or those whose time
 * overlaps the window. Times are "HH:MM" or "HH:MM:SS" — compared as strings.
 */
export function periodReplaced(date: string, period: { start_time?: string; end_time?: string }, events: Event[]) {
  return events.some((e) => {
    if (e.start_date > date || date > e.end_date) return false;
    if (!e.students_attend) return true;
    if (!e.replaces_classes) return false;
    if (!e.start_time || !e.end_time || !period.start_time || !period.end_time) return true;
    return period.start_time.slice(0, 5) < e.end_time.slice(0, 5) && e.start_time.slice(0, 5) < period.end_time.slice(0, 5);
  });
}

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
    const dow = isoDow(d);
    for (const e of entries) if (e.day_of_week === dow && !periodReplaced(d, e, events)) out.push({ date: d, dayOfWeek: dow, periodNo: e.period_no });
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

type CopySlot = { slot_date: string; period_no: number; topic_ids: string[]; completed_at?: string | null };

/**
 * What "รวมแผน" would copy from a source plan into one target — the same skip rules as the
 * SQL function copy_plan_to_group (0167): no such period in the target's schedule, target slot
 * taught or already holding topics, or a topic outside the target's ผังการเรียน (`validTopicIds`).
 */
export function copyPreview(
  source: CopySlot[],
  target: CopySlot[],
  targetEntries: Entry[],
  validTopicIds: Set<string>,
) {
  let copied = 0;
  let skipped = 0;
  for (const s of source) {
    if (s.topic_ids.length === 0) continue;
    const t = target.find((x) => x.slot_date === s.slot_date && x.period_no === s.period_no);
    const hasPeriod = targetEntries.some((e) => e.day_of_week === isoDow(s.slot_date) && e.period_no === s.period_no);
    if (!hasPeriod || t?.completed_at || (t && t.topic_ids.length > 0)) {
      skipped += s.topic_ids.length;
      continue;
    }
    const ok = s.topic_ids.filter((id) => validTopicIds.has(id)).length;
    copied += ok;
    skipped += s.topic_ids.length - ok;
  }
  return { copied, skipped };
}
