/** Spaces/hyphens dropped, upper-cased — the one stored form, so equality checks (password reset) are exact. */
export const normalizeNationalId = (raw: string): string => raw.replace(/[\s-]/g, "").toUpperCase();

/** Thai ID (13 digits) or a foreign student's number (G-number / passport: 6–20 letters or digits). Expects a normalized value. */
export const isValidNationalId = (id: string): boolean => /^\d{13}$/.test(id) || /^[A-Z0-9]{6,20}$/.test(id);

export const NATIONAL_ID_HINT = "เลขบัตรประชาชน 13 หลัก หรือเลขต่างชาติ/พาสปอร์ต 6–20 ตัวอักษร";
