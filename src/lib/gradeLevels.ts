/** M1 → ม.1 · P2 → ป.2 · K3 → อ.3 */
export function gradeShortLabel(code: string) {
  const m = /^([MPK])(\d+)$/i.exec(code.trim());
  if (!m) return code;
  const prefix = ({ M: "ม.", P: "ป.", K: "อ." } as const)[m[1]!.toUpperCase() as "M" | "P" | "K"];
  return prefix ? `${prefix}${m[2]}` : code;
}

/**
 * Grades in one curriculum path: from the cohort entry point up to (but not
 * including) the next entry point — ม.1→ม.3, ม.4→ม.6, ป.1→ป.3, ป.4→ป.6.
 */
export function gradesInEntryPath<T extends { id: string; sort_order: number; is_entry_point: boolean }>(
  gradeLevels: T[],
  entryGradeLevelId: string,
): T[] {
  const entry = gradeLevels.find((g) => g.id === entryGradeLevelId);
  if (!entry) return gradeLevels;
  const nextEntry = gradeLevels
    .filter((g) => g.is_entry_point && g.sort_order > entry.sort_order)
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  const end = nextEntry?.sort_order ?? Number.POSITIVE_INFINITY;
  return gradeLevels.filter((g) => g.sort_order >= entry.sort_order && g.sort_order < end);
}

// Level badge tint — data colour, one hue per grade (ม.1–ม.6 / ปวช.1–3 / ปวส.1–2 repeat by number).
const LEVEL_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];
export function levelTone(label: string | undefined): string {
  const n = Number(/(\d)/.exec(label ?? "")?.[1]);
  return n >= 1 ? LEVEL_TONES[(n - 1) % LEVEL_TONES.length]! : "bg-secondary text-muted-foreground";
}
