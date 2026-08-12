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
