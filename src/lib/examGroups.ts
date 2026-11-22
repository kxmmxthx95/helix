/**
 * Merge items that sit in the same scope (`scopeOf`, e.g. teacher + room) and whose subjects share at
 * least one ผังการเรียน lesson (`lessonsOf`, from plan_lesson_subjects). Sharing chains: A–B and B–C
 * give one group. Groups keep first-seen order and members keep input order; an item with no shared
 * lesson (or no scope) stays alone.
 */
export function groupBySharedLessons<T>(
  items: T[],
  scopeOf: (t: T) => string | null,
  subjectOf: (t: T) => string,
  lessonsOf: (subjectId: string) => ReadonlySet<string> | undefined,
): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i++) {
    const scope = scopeOf(items[i]!);
    if (scope === null) continue;
    const mine = lessonsOf(subjectOf(items[i]!));
    for (let j = 0; j < i; j++) {
      if (scopeOf(items[j]!) !== scope) continue;
      const theirs = lessonsOf(subjectOf(items[j]!));
      if (mine && theirs && [...mine].some((l) => theirs.has(l))) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, T[]>();
  items.forEach((t, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), t]));
  return [...groups.values()];
}
