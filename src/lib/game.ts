/** Student game theme — career avatars are cosmetic only (migration 0069). */
export const CHARACTER_CLASSES = [
  { id: "math", label: "นักคณิตศาสตร์" },
  { id: "science", label: "นักวิทยาศาสตร์" },
  { id: "language", label: "นักภาษา" },
  { id: "social", label: "นักสังคม/ประวัติศาสตร์" },
  { id: "art", label: "ศิลปิน" },
  { id: "music", label: "นักดนตรี" },
  { id: "sport", label: "นักกีฬา" },
  { id: "tech", label: "นักเทคโนโลยี" },
] as const;

export type CharacterClass = (typeof CHARACTER_CLASSES)[number]["id"];

export function isCharacterClass(v: string | null): v is CharacterClass {
  return CHARACTER_CLASSES.some((c) => c.id === v);
}

/** Derive เพศ from Thai student name title (no separate gender column). */
export function studentGender(prefix: string | null): "ชาย" | "หญิง" | null {
  if (prefix === "เด็กชาย" || prefix === "นาย") return "ชาย";
  if (prefix === "เด็กหญิง" || prefix === "นางสาว") return "หญิง";
  return null;
}

/** Unknown prefix falls back to the boy art — the only default body type (grill decision). */
export function bodyType(prefix: string | null): "boy" | "girl" {
  return studentGender(prefix) === "หญิง" ? "girl" : "boy";
}

export const characterSrc = (cls: CharacterClass, prefix: string | null) =>
  `/game/char-${cls}-${bodyType(prefix)}.webp`;
