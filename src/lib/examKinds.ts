/** Kinds of exam a topic set / room is for (exam_type); round = "ครั้งที่". */
export const EXAM_KINDS = ["สอบกลางภาค", "สอบปลายภาค", "สอบย่อย", "สอบเก็บคะแนน"];

/** "สอบกลางภาค ครั้งที่ 1" — null when the exam is unknown (sets made before migration 0192). */
export function examLabel(s: { exam_type: string | null; round: number | null }): string | null {
  return s.exam_type ? (s.round ? `${s.exam_type} ครั้งที่ ${s.round}` : s.exam_type) : null;
}
