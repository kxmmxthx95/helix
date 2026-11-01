import { useEffect, useState } from "react";

/** [province, district, subdistrict] — names only, no จังหวัด/อำเภอ/ตำบล prefixes. Data: kongvut/thai-province-data (MIT). */
export type ThaiAddressRow = [string, string, string];

let table: Promise<Record<string, ThaiAddressRow[]>> | null = null;

/** The ~600KB postcode table is its own chunk, fetched the first time a 5-digit postcode is typed. */
export function loadThaiAddress() {
  table ??= import("@/data/thaiAddress.json").then((m) => m.default as unknown as Record<string, ThaiAddressRow[]>);
  return table;
}

/** Rows for a postcode; `null` while loading, `[]` for an unknown or incomplete postcode. */
export function useZipRows(zip: string | null): ThaiAddressRow[] | null {
  const valid = zip !== null && /^\d{5}$/.test(zip);
  const [state, setState] = useState<{ zip: string; rows: ThaiAddressRow[] } | null>(null);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    void loadThaiAddress().then((t) => !cancelled && setState({ zip, rows: t[zip] ?? [] }));
    return () => {
      cancelled = true;
    };
  }, [valid, zip]);
  if (!valid) return [];
  return state?.zip === zip ? state.rows : null;
}

/** Distinct values of column `col` among rows matching the already-chosen earlier columns. */
export function addressOptions(rows: ThaiAddressRow[], col: 0 | 1 | 2, chosen: (string | null)[]): string[] {
  const out = new Set<string>();
  for (const r of rows) if (chosen.every((c, i) => !c || r[i] === c)) out.add(r[col]);
  return [...out];
}
