/** Kinds of exam a topic set / room is for (exam_type); round = "ครั้งที่". */
export const EXAM_KINDS = ["สอบกลางภาค", "สอบปลายภาค", "สอบย่อย", "สอบเก็บคะแนน"];

/** "สอบกลางภาค ครั้งที่ 1" — null when the exam is unknown (sets made before migration 0192). */
export function examLabel(s: { exam_type: string | null; round: number | null }): string | null {
  return s.exam_type ? (s.round ? `${s.exam_type} ครั้งที่ ${s.round}` : s.exam_type) : null;
}

// Badge tints: one per kind (unknown kinds stay neutral); round tinted by its number.
const KIND_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
];
export function kindTone(kind: string | null): string {
  const i = kind ? EXAM_KINDS.indexOf(kind) : -1;
  return i >= 0 ? KIND_TONES[i % KIND_TONES.length]! : "bg-muted text-muted-foreground";
}
export function roundTone(round: number | null): string {
  return round ? KIND_TONES[(round - 1) % KIND_TONES.length]!.replace("sky", "violet").replace("emerald", "teal") : "bg-muted text-muted-foreground";
}
