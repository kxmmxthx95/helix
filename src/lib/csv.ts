/**
 * Minimal RFC 4180 CSV reader. Hand-rolled rather than pulled from npm
 * because the only hard part is quoting — and Excel quotes any field holding
 * a comma, so a naive split(",") silently corrupts real exports.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  // Strip the BOM Excel writes on "CSV UTF-8" exports.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip blank trailing lines rather than importing an empty student.
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i]!;

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // Escaped quote.
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }

    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c !== "\r") {
      field += c;
    }
    i++;
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Triggers a browser download of `text` as a CSV file. BOM so Excel opens Thai as UTF-8. */
export function downloadCsv(filename: string, text: string) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type CsvColumn = { key: string; header: string; required?: boolean };

export type CsvIssue = { row: number; message: string };

export type CsvParseResult<T> = { rows: T[]; issues: CsvIssue[] };

/**
 * Map a CSV into records keyed by `columns`, matching on the header row.
 * Returns rows and issues together so the preview can show both — the import
 * itself decides whether to proceed.
 */
export function readTable<T extends Record<string, string>>(
  text: string,
  columns: CsvColumn[],
): CsvParseResult<T> {
  const table = parseCsv(text);
  const issues: CsvIssue[] = [];

  const header = table[0];
  if (!header) return { rows: [], issues: [{ row: 0, message: "ไฟล์ว่าง" }] };

  const index = new Map<string, number>();
  for (const col of columns) {
    const at = header.findIndex((h) => h.trim() === col.header);
    if (at === -1) {
      if (col.required) issues.push({ row: 1, message: `ไม่พบคอลัมน์ "${col.header}"` });
      continue;
    }
    index.set(col.key, at);
  }
  if (issues.length > 0) return { rows: [], issues };

  const rows: T[] = [];
  table.slice(1).forEach((cells, n) => {
    const lineNo = n + 2; // 1-based, and the header took line 1.
    const record = {} as Record<string, string>;
    let ok = true;

    for (const col of columns) {
      const at = index.get(col.key);
      const value = at === undefined ? "" : (cells[at] ?? "").trim();
      if (col.required && value === "") {
        issues.push({ row: lineNo, message: `"${col.header}" ว่าง` });
        ok = false;
      }
      record[col.key] = value;
    }

    if (ok) rows.push(record as T);
  });

  return { rows, issues };
}
