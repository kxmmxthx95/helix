import type { AddressFields, Student } from "@/lib/database.types";

export type OnboardingStep = "password" | "identity" | "contact" | "guardians" | "health";

export const ONBOARDING_STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "password", label: "ตั้งรหัสผ่าน" },
  { key: "identity", label: "บัตรประชาชน/ที่อยู่" },
  { key: "contact", label: "ติดต่อ" },
  { key: "guardians", label: "ผู้ปกครอง" },
  { key: "health", label: "สุขภาพ" },
];

/** อยู่/ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์เท่านั้น — หมู่ที่/ตรอกซอย/ถนนไม่ใช่ทุกบ้านจะมี (grill decision). */
export const REQUIRED_ADDRESS_KEYS: (keyof AddressFields)[] = [
  "house_no",
  "subdistrict",
  "district",
  "province",
  "postal_code",
];

/** ผู้ปกครองต้องมีอย่างน้อย 2 คน — father/mother slot ใช้ "other" แทนได้ (grill decision). */
export const REQUIRED_GUARDIAN_COUNT = 2;

const filled = (v: string | null | undefined) => !!v?.trim();

export function identityStepComplete(student: Student): boolean {
  return filled(student.national_id) && REQUIRED_ADDRESS_KEYS.every((k) => filled(student[k]));
}

export function contactStepComplete(student: Student): boolean {
  return filled(student.phone) && filled(student.email);
}

export function healthStepComplete(student: Student): boolean {
  return (
    !!student.blood_type &&
    filled(student.family_status) &&
    filled(student.chronic_disease) &&
    filled(student.drug_allergy) &&
    filled(student.food_allergy)
  );
}

/**
 * First incomplete step, or null once everything required is filled.
 * Order matters — this is also the order steps are presented in, and the
 * step Gate() lands a still-incomplete student on after each login.
 */
export function missingOnboardingStep(
  mustChangePassword: boolean,
  student: Student | null,
  guardianCount: number,
): OnboardingStep | null {
  if (mustChangePassword) return "password";
  if (!student) return null; // no linked roster row — nothing this gate can check
  if (!identityStepComplete(student)) return "identity";
  if (!contactStepComplete(student)) return "contact";
  if (guardianCount < REQUIRED_GUARDIAN_COUNT) return "guardians";
  if (!healthStepComplete(student)) return "health";
  return null;
}
