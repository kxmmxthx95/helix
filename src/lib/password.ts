import { normalizeNationalId } from "@/lib/nationalId";

/** DDMMYYYY (พ.ศ.) from an <input type=date> value (stored ค.ศ.) — grill decision, initial password = วันเกิด. */
export function passwordFromDob(dateOfBirth: string): string {
  const [y, m, d] = dateOfBirth.split("-");
  const be = String(Number(y) + 543).padStart(4, "0");
  return `${d}${m}${be}`;
}

/** Normalized national ID (Thai 13 digits, or a foreign G-number/passport) as an initial password — grill decision (2026-08-11), students only. */
export function passwordFromNationalId(nationalId: string): string {
  return normalizeNationalId(nationalId);
}
