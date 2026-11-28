import { tableColumns } from "./manifest";

/** SQLite row → what supabase-js would have returned (booleans, parsed json, money in baht). */
export function toApiRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const kinds = tableColumns(table);
  const out: Record<string, unknown> = {};
  for (const [col, v] of Object.entries(row)) {
    const kind = kinds.get(col);
    if (v === null || v === undefined) out[col] = null;
    else if (kind === "bool") out[col] = v === 1 || v === true;
    else if (kind === "json") out[col] = typeof v === "string" ? JSON.parse(v) : v;
    else if (kind === "money") out[col] = Number(v) / 100;
    else out[col] = v;
  }
  return out;
}
