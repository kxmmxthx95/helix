import { ApiFailure, columnKind, tableColumns } from "./manifest";
import type { Filter, Scalar, SelectRequest } from "./protocol";

export interface Sql {
  sql: string;
  params: unknown[];
}
/** Row-level-security result: everything, nothing, or a SQL condition on the queried table. */
export type Pred = boolean | Sql;

/** PostgREST on Supabase caps every response at 1000 rows; keep that behaviour so call sites see the same data. */
export const MAX_ROWS = 1000;

const q = (id: string) => `"${id}"`;
const CMP = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;

/** JSON/bool/money values as stored: booleans 0/1, money in satang. */
function coerce(table: string, col: string, v: Scalar): Scalar {
  if (v === null) return null;
  const kind = columnKind(table, col);
  if (kind === "json") throw new ApiFailure(400, "0A000", `filtering on json column ${table}.${col} is not supported`);
  if (typeof v === "boolean") return v ? 1 : 0;
  // `.or("a.eq.true,b.gt.5")` carries text: read it as the column's type.
  if (typeof v === "string") {
    if (kind === "bool" && (v === "true" || v === "false")) return v === "true" ? 1 : 0;
    if ((kind === "int" || kind === "real" || kind === "money") && v.trim() !== "" && !Number.isNaN(Number(v))) v = Number(v) as never;
  }
  if (kind === "money" && typeof v === "number") return Math.round(v * 100);
  return v;
}

function cond(table: string, f: Filter): Sql {
  const c = q(f.col);
  columnKind(table, f.col);
  let out: Sql;
  if (f.op === "in") {
    if (!Array.isArray(f.val)) throw new ApiFailure(400, "22023", "in() needs an array");
    // One bound parameter however long the list is (D1 allows ~100 per statement).
    out = { sql: `${c} IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(f.val.map((v) => coerce(table, f.col, v)))] };
  } else if (f.op === "is") {
    if (f.val !== null && typeof f.val !== "boolean") throw new ApiFailure(400, "22023", "is() takes null, true or false");
    out = { sql: f.val === null ? `${c} IS NULL` : `${c} IS ${f.val ? 1 : 0}`, params: [] };
  } else if (f.op === "like" || f.op === "ilike") {
    if (typeof f.val !== "string") throw new ApiFailure(400, "22023", "like() needs a string");
    // ponytail: SQLite LIKE ignores ASCII case for both; Postgres `like` is case-sensitive. Thai text is unaffected.
    out = { sql: `${c} LIKE ?`, params: [f.val] };
  } else {
    if (Array.isArray(f.val)) throw new ApiFailure(400, "22023", `${f.op}() needs a single value`);
    out = { sql: `${c} ${CMP[f.op]} ?`, params: [coerce(table, f.col, f.val)] };
  }
  return f.neg ? { sql: `NOT (${out.sql})`, params: out.params } : out;
}

const and = (parts: Sql[]): Sql => ({ sql: parts.length ? parts.map((p) => `(${p.sql})`).join(" AND ") : "1", params: parts.flatMap((p) => p.params) });

function where(table: string, req: SelectRequest, pred: Pred): Sql {
  const parts = req.filters.map((f) => cond(table, f));
  for (const alt of req.ors) {
    if (!alt.length) continue;
    const cs = alt.map((f) => cond(table, f));
    parts.push({ sql: cs.map((c) => `(${c.sql})`).join(" OR "), params: cs.flatMap((c) => c.params) });
  }
  if (pred === false) parts.push({ sql: "0", params: [] });
  else if (pred !== true) parts.push(pred);
  return and(parts);
}

export function compileSelect(req: SelectRequest, pred: Pred): { rows: Sql | null; count: Sql | null } {
  const table = req.table;
  const known = tableColumns(table);
  const w = where(table, req, pred);

  let rows: Sql | null = null;
  if (!req.head) {
    const cols = req.columns === "*" ? [...known.keys()] : req.columns;
    for (const c of cols) columnKind(table, c);
    const order = req.order.map((o) => {
      columnKind(table, o.col);
      const first = o.nullsFirst ?? !o.asc; // Postgres: NULLs sort as largest
      return `${q(o.col)} ${o.asc ? "ASC" : "DESC"} NULLS ${first ? "FIRST" : "LAST"}`;
    });
    const int = (n: number | undefined, d: number) => (n === undefined ? d : Number.isInteger(n) && n >= 0 ? n : (() => { throw new ApiFailure(400, "22023", "bad limit/offset"); })());
    // single()/maybeSingle() read 2 rows so a duplicate is detectable.
    const limit = req.single ? 2 : Math.min(int(req.limit, MAX_ROWS), MAX_ROWS);
    rows = {
      sql: `SELECT ${cols.map(q).join(", ")} FROM ${q(table)} WHERE ${w.sql}${order.length ? ` ORDER BY ${order.join(", ")}` : ""} LIMIT ${limit} OFFSET ${int(req.offset, 0)}`,
      params: w.params,
    };
  }
  const count = req.count || req.head ? { sql: `SELECT COUNT(*) AS c FROM ${q(table)} WHERE ${w.sql}`, params: w.params } : null;
  return { rows, count };
}
