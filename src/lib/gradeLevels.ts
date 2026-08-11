/** M1 → ม.1 · P2 → ป.2 · K3 → อ.3 */
export function gradeShortLabel(code: string) {
  const m = /^([MPK])(\d+)$/i.exec(code.trim());
  if (!m) return code;
  const prefix = ({ M: "ม.", P: "ป.", K: "อ." } as const)[m[1]!.toUpperCase() as "M" | "P" | "K"];
  return prefix ? `${prefix}${m[2]}` : code;
}
