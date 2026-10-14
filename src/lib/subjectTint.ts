const SUBJECT_TINTS = [
  "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
  "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
];

/** Deterministic tint per subject (subjects carry no color/icon field) — same id always lands on the same color. */
export function subjectTint(subjectId: string) {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_TINTS[hash % SUBJECT_TINTS.length]!;
}
