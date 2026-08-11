/** DDMMYYYY (พ.ศ.) from an <input type=date> value (stored ค.ศ.) — grill decision, initial password = วันเกิด. */
export function passwordFromDob(dateOfBirth: string): string {
  const [y, m, d] = dateOfBirth.split("-");
  const be = String(Number(y) + 543).padStart(4, "0");
  return `${d}${m}${be}`;
}

/** Digits-only national ID as an initial password — grill decision (2026-08-11), students only. */
export function passwordFromNationalId(nationalId: string): string {
  return nationalId.replace(/\D/g, "");
}
