import triggers from "../../d1/triggers.json";
import writes from "../../d1/writes.json";
import { andPred, predSql, where, type Pred, type Sql } from "./compile";
import { toApiRow } from "./convert";
import { authenticate } from "./identity";
import { ApiFailure, columnKind, tableColumns, tableDefs, type Kind } from "./manifest";
import { writePredicates, type Caller } from "./policy";
import type { ApiResponse, WriteRequest } from "./protocol";
import type { ApiEnv } from "./query";

/**
 * INSERT / UPDATE / DELETE / UPSERT with the generated row-level-security checks (Postgres semantics):
 *  - insert: the check runs on the COMPLETE new row (defaults applied), as WITH CHECK does;
 *  - update: only rows the UPDATE policies' USING (and SELECT) let through are touched; if any of them would become a row the
 *    check forbids, the whole statement fails before changing anything (42501), like Postgres;
 *  - delete: only rows the DELETE policies let through;
 *  - every request is one D1 batch = one transaction; a policy failure or a single()/count mismatch aborts it by running a statement
 *    that errors on purpose (json('p') = policy, integer overflow = single()).
 * Tables are writable only if listed in worker/d1/writes.json: a table's triggers (updated_at, audit, notifications…) must be ported first.
 */
const WRITABLE = new Set((writes as { tables: string[] }).tables);
/** Tables whose Postgres trigger `touch_updated_at` sets updated_at = now() on every UPDATE (SQLite cannot do that in a BEFORE trigger). */
const TOUCH = new Set((triggers as { touch: string[] }).touch);
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const q = (id: string) => `"${id}"`;
type Stmt = Sql & { ret?: boolean };
const POLICY_ABORT: Sql = { sql: "SELECT CASE WHEN changes() = 0 THEN json('p') END", params: [] };
const SINGLE_ABORT: Sql = { sql: "SELECT CASE WHEN changes() <> 1 THEN abs(-9223372036854775808) END", params: [] };

export interface WriteOptions {
  /** tests only: override worker/d1/writes.json */
  writable?: Set<string>;
}

function toDb(kind: Kind, v: unknown, col: string): unknown {
  if (v === null || v === undefined) return null;
  const bad = () => new ApiFailure(400, "22P02", `invalid input for column ${col}`);
  switch (kind) {
    case "bool":
      if (typeof v === "boolean") return v ? 1 : 0;
      throw bad();
    case "json":
      return JSON.stringify(v);
    case "money":
      if (typeof v !== "number" || !Number.isFinite(v)) throw bad();
      return Math.round(v * 100);
    case "int":
    case "real":
      if (typeof v !== "number" || !Number.isFinite(v)) throw bad();
      return v;
    case "ts": {
      const d = typeof v === "string" ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) throw bad();
      return d.toISOString();
    }
    default:
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      throw bad();
  }
}

function rowValues(table: string, row: unknown): Map<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new ApiFailure(400, "PGRST102", "values must be objects");
  const out = new Map<string, unknown>();
  const generated = new Set(tableColumns(table).keys());
  for (const d of tableDefs(table)) generated.delete(d.col); // what remains are the generated columns
  for (const [c, v] of Object.entries(row)) {
    if (generated.has(c)) throw new ApiFailure(400, "428C9", `column "${c}" can only be updated to DEFAULT (generated)`);
    out.set(c, toDb(columnKind(table, c), v, c));
  }
  return out;
}

const withUid = (expr: string, who: Caller): Sql => ({ sql: expr.replaceAll("__UID__", "?"), params: Array(expr.split("__UID__").length - 1).fill(who.uid) });

/** `SELECT <value or default or NULL> AS col, …`: the new row as the policies must see it. */
function candidate(table: string, vals: Map<string, unknown>, who: Caller): Sql {
  const parts: Sql[] = tableDefs(table).map((d) =>
    vals.has(d.col) ? { sql: `? AS ${q(d.col)}`, params: [vals.get(d.col)] } : d.default ? ((x) => ({ sql: `${x.sql} AS ${q(d.col)}`, params: x.params }))(withUid(d.default, who)) : { sql: `NULL AS ${q(d.col)}`, params: [] },
  );
  return { sql: `SELECT ${parts.map((p) => p.sql).join(", ")}`, params: parts.flatMap((p) => p.params) };
}

function returning(table: string, r: WriteRequest): string {
  if (!r.returning) return "";
  const cols = r.returning === "*" ? [...tableColumns(table).keys()] : r.returning;
  for (const c of cols) columnKind(table, c);
  return ` RETURNING ${cols.map(q).join(", ")}`;
}

function insertStatements(r: WriteRequest, who: Caller, p: NonNullable<ReturnType<typeof writePredicates>>): Stmt[] {
  const rows = Array.isArray(r.values) ? r.values : r.values ? [r.values] : [];
  if (!rows.length) throw new ApiFailure(400, "PGRST102", "no rows to insert");
  if (p.insert === false) throw new ApiFailure(403, "42501", `new row violates row-level security policy for table "${r.table}"`);
  // A returned row must also be visible to the caller (Postgres requires the SELECT policy for RETURNING).
  const check = predSql(andPred(p.insert, r.returning ? p.select : true));
  const defs = tableDefs(r.table).map((d) => q(d.col)).join(", ");
  const out: Stmt[] = [];
  for (const row of rows) {
    const vals = rowValues(r.table, row);
    const cand = candidate(r.table, vals, who);
    let tail = "";
    if (r.op === "upsert") {
      const target = (r.onConflict?.length ? r.onConflict : null);
      if (!target) throw new ApiFailure(400, "PGRST102", "upsert needs onConflict");
      for (const c of target) columnKind(r.table, c);
      if (r.ignoreDuplicates) tail = ` ON CONFLICT (${target.map(q).join(", ")}) DO NOTHING`;
      else {
        const sets = [...vals.keys()].filter((c) => !target.includes(c)).map((c) => `${q(c)} = excluded.${q(c)}`);
        if (TOUCH.has(r.table) && !vals.has("updated_at")) sets.push(`"updated_at" = ${NOW}`);
        // ponytail: the conflict path checks the UPDATE policy's USING on the existing row, not WITH CHECK on the new values.
        const using = predSql(p.updateUsing);
        tail = ` ON CONFLICT (${target.map(q).join(", ")}) DO UPDATE SET ${sets.length ? sets.join(", ") : `${q(target[0]!)} = excluded.${q(target[0]!)}`} WHERE ${using.sql}`;
        out.push({ sql: `INSERT INTO ${q(r.table)} AS "__row" (${defs}) SELECT ${defs} FROM (${cand.sql}) AS "__row" WHERE ${check.sql}${tail}${returning(r.table, r)}`, params: [...cand.params, ...check.params, ...using.params], ret: !!r.returning });
        out.push(POLICY_ABORT);
        continue;
      }
    }
    out.push({ sql: `INSERT INTO ${q(r.table)} (${defs}) SELECT ${defs} FROM (${cand.sql}) AS "__row" WHERE ${check.sql}${tail}${returning(r.table, r)}`, params: [...cand.params, ...check.params], ret: !!r.returning });
    if (!r.ignoreDuplicates) out.push(POLICY_ABORT);
  }
  return out;
}

function updateStatements(r: WriteRequest, p: NonNullable<ReturnType<typeof writePredicates>>): Stmt[] {
  if (!r.filters.length && !r.ors.length) throw new ApiFailure(400, "21000", "UPDATE requires a WHERE clause");
  const patch = rowValues(r.table, r.values);
  if (!patch.size) throw new ApiFailure(400, "PGRST102", "empty update");
  // Rows the caller may update and see (Postgres applies the SELECT policy when the statement has a WHERE).
  const visible = where(r.table, r, andPred(p.updateUsing, p.select));
  const oldRows: Sql = { sql: `SELECT "__row".rowid FROM ${q(r.table)} AS "__row" WHERE ${visible.sql}`, params: visible.params };
  const check = predSql(p.updateCheck);
  const overlay = tableDefs(r.table).map((d) => (patch.has(d.col) ? { sql: `? AS ${q(d.col)}`, params: [patch.get(d.col)] } : { sql: q(d.col), params: [] as unknown[] }));
  const out: Stmt[] = [
    {
      sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM (SELECT rowid AS "__rid", ${overlay.map((o) => o.sql).join(", ")} FROM ${q(r.table)}) AS "__row" WHERE "__rid" IN (${oldRows.sql}) AND NOT (${check.sql})) THEN json('p') END`,
      params: [...overlay.flatMap((o) => o.params), ...oldRows.params, ...check.params],
    },
    { sql: `UPDATE ${q(r.table)} SET ${[...patch.keys()].map((c) => `${q(c)} = ?`).join(", ")}${TOUCH.has(r.table) && !patch.has("updated_at") ? `, "updated_at" = ${NOW}` : ""} WHERE rowid IN (${oldRows.sql})${returning(r.table, r)}`, params: [...patch.values(), ...oldRows.params], ret: !!r.returning },
  ];
  return out;
}

function deleteStatements(r: WriteRequest, p: NonNullable<ReturnType<typeof writePredicates>>): Stmt[] {
  if (!r.filters.length && !r.ors.length) throw new ApiFailure(400, "21000", "DELETE requires a WHERE clause");
  const visible = where(r.table, r, andPred(p.delete, p.select));
  return [{ sql: `DELETE FROM ${q(r.table)} WHERE rowid IN (SELECT "__row".rowid FROM ${q(r.table)} AS "__row" WHERE ${visible.sql})${returning(r.table, r)}`, params: visible.params, ret: !!r.returning }];
}

function mapError(e: unknown): never {
  const m = String((e as Error)?.message ?? e);
  if (/malformed JSON/i.test(m)) throw new ApiFailure(403, "42501", "new row violates row-level security policy");
  if (/integer overflow/i.test(m)) throw new ApiFailure(406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
  if (/UNIQUE constraint/i.test(m)) throw new ApiFailure(409, "23505", "duplicate key value violates unique constraint");
  if (/FOREIGN KEY/i.test(m)) throw new ApiFailure(409, "23503", "violates foreign key constraint");
  if (/NOT NULL constraint/i.test(m)) throw new ApiFailure(400, "23502", "null value in column violates not-null constraint");
  if (/CHECK constraint/i.test(m)) throw new ApiFailure(400, "23514", "new row violates check constraint");
  if (/ON CONFLICT clause does not match/i.test(m)) throw new ApiFailure(400, "42P10", "there is no unique or exclusion constraint matching the ON CONFLICT specification");
  throw e;
}

export async function handleWrite(req: Request, env: ApiEnv, opts: WriteOptions = {}): Promise<ApiResponse> {
  if (!env.DB) throw new ApiFailure(503, "PGRST000", "database not configured");
  const who = await authenticate(req, env);
  const r = (await req.json().catch(() => null)) as WriteRequest | null;
  if (!r || typeof r.table !== "string" || !["insert", "update", "delete", "upsert"].includes(r.op) || !Array.isArray(r.filters ?? []) || !Array.isArray(r.ors ?? [])) {
    throw new ApiFailure(400, "PGRST100", "malformed write");
  }
  r.filters ??= [];
  r.ors ??= [];
  tableColumns(r.table);
  if (!(opts.writable ?? WRITABLE).has(r.table)) throw new ApiFailure(403, "42501", `writes to ${r.table} are not available through the API yet`);
  const p = writePredicates(r.table, who);
  if (!p) throw new ApiFailure(403, "42501", `table ${r.table} is not available through the API yet`);

  const stmts: Stmt[] = r.op === "insert" || r.op === "upsert" ? insertStatements(r, who, p) : r.op === "update" ? updateStatements(r, p) : deleteStatements(r, p);
  if (r.single) stmts.push(SINGLE_ABORT);
  // The audit triggers read the actor from _ctx (SQLite has no auth.uid()); set it inside the same transaction and clear it after.
  stmts.unshift({ sql: "UPDATE _ctx SET uid = ?, sid = ?", params: [who.uid, who.sid] });
  stmts.push({ sql: "UPDATE _ctx SET uid = NULL, sid = NULL", params: [] });
  let results: D1Result<Record<string, unknown>>[];
  try {
    results = await env.DB.batch(stmts.map((s) => env.DB!.prepare(s.sql).bind(...s.params)));
  } catch (e) {
    mapError(e);
  }
  const rows = r.returning ? results.flatMap((x, i) => (stmts[i]!.ret ? (x.results ?? []) : [])).map((row) => toApiRow(r.table, row)) : null;
  if (r.single) return { data: (rows?.[0] ?? null) as never, count: null, error: null };
  return { data: rows as never, count: null, error: null };
}
