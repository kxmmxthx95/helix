// Student portal EXP / level / rank / badges. Everything is derived from existing
// data; all tunables are the constants below. See docs/design/student-portal-maple.md.

export const EXP_RULES = {
  onTime: 50,
  late: 20,
  present: 10,
  lateArrival: 5,
  behaviorPerPoint: 1, // per remaining behavior point (score starts at 100)
  examPerPercent: 1, // per exam score %, summed over exams (not wired yet: needs a student-readable total)
} as const;
export const EXP_PER_LEVEL = 100; // cumulative EXP to finish level n = EXP_PER_LEVEL * n * (n + 1) / 2

/** Lifetime rank by total EXP, highest first. */
export const RANKS = [
  { id: "diamond", label: "เพชร", min: 25000 },
  { id: "platinum", label: "แพลตินัม", min: 15000 },
  { id: "gold", label: "ทอง", min: 7500 },
  { id: "silver", label: "เงิน", min: 2500 },
  { id: "bronze", label: "ทองแดง", min: 0 },
] as const;

export type ExpCounts = {
  onTime: number;
  late: number;
  present: number;
  lateArrival: number;
  behaviorRemaining: number;
  examPercentSum?: number;
};

export function expFromCounts(c: ExpCounts): number {
  return (
    c.onTime * EXP_RULES.onTime +
    c.late * EXP_RULES.late +
    c.present * EXP_RULES.present +
    c.lateArrival * EXP_RULES.lateArrival +
    Math.max(0, c.behaviorRemaining) * EXP_RULES.behaviorPerPoint +
    (c.examPercentSum ?? 0) * EXP_RULES.examPerPercent
  );
}

const cumulative = (n: number) => (EXP_PER_LEVEL * n * (n + 1)) / 2;

/** Level 1 starts at 0 EXP; level n+1 starts at cumulative(n). `next` = EXP still needed for the next level. */
export function levelFromExp(exp: number): { level: number; into: number; span: number; next: number } {
  let n = 0;
  while (cumulative(n + 1) <= exp) n++;
  const into = exp - cumulative(n);
  const span = cumulative(n + 1) - cumulative(n);
  return { level: n + 1, into, span, next: span - into };
}

export const rankFromExp = (exp: number) => RANKS.find((r) => exp >= r.min) ?? RANKS[RANKS.length - 1]!;

export type BadgeInput = {
  submissions: number; // lifetime
  level: number; // best of term / lifetime
  monthAttendance: { present: number; late: number; absent: number; leave: number };
  behaviorRemaining: number;
  behaviorStart: number;
};

export type Badge = { id: string; label: string; hint: string; unlocked: boolean; progress?: { now: number; goal: number } };

export function deriveBadges(i: BadgeInput): Badge[] {
  const count = (id: string, label: string, goal: number, now: number): Badge => ({
    id,
    label,
    hint: `ส่งงานครบ ${goal} ชิ้น`,
    unlocked: now >= goal,
    progress: { now: Math.min(now, goal), goal },
  });
  const days = i.monthAttendance.present + i.monthAttendance.late + i.monthAttendance.absent + i.monthAttendance.leave;
  return [
    { ...count("first-submission", "ส่งงานครั้งแรก", 1, i.submissions), hint: "ส่งงานชิ้นแรก" },
    count("submissions-10", "นักส่งงาน 10", 10, i.submissions),
    count("submissions-50", "นักส่งงาน 50", 50, i.submissions),
    { id: "perfect-month", label: "เข้าเรียนครบเดือน", hint: "ไม่ขาด ไม่ลา ทั้งเดือน", unlocked: days > 0 && i.monthAttendance.absent + i.monthAttendance.leave === 0 },
    { id: "full-behavior", label: "ความประพฤติเต็ม", hint: `คะแนนพฤติกรรมเต็ม ${i.behaviorStart}`, unlocked: i.behaviorRemaining >= i.behaviorStart },
    ...[5, 10, 20].map((n) => ({
      id: `level-${n}`,
      label: `เลเวล ${n}`,
      hint: `ถึงเลเวล ${n}`,
      unlocked: i.level >= n,
      progress: { now: Math.min(i.level, n), goal: n },
    })),
    // ponytail: "every exam submitted in a term" skipped, needs an exam-completion source readable by students.
  ];
}
