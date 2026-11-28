import type { Database } from "@/lib/database.types";
import type { ApiResponse, Embed, Filter, Op, Scalar, SelectRequest } from "../../worker/src/api/protocol";

/**
 * supabase-js-shaped client for the Cloudflare API worker (docs/cloudflare-migration.md, phase 4.3).
 * Read-only for now, on the tables the worker has policies for; anything else is rejected by the worker (403).
 * Embedded selects (`alias:rel!fk!inner(cols, nested(...))`, `rel(count)`) and filters on embedded columns (`.eq("rel.col", v)`) are supported.
 * Unsupported syntax throws at call time instead of silently returning different data: column aliases, nested or(and(...)), order on embeds.
 */
type Tables = Database["public"]["Tables"];
type TableName = keyof Tables & string;
type Row<T extends TableName> = Tables[T]["Row"];

type Trim<S extends string> = S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S;
type Split<S extends string> = S extends `${infer A},${infer B}` ? Trim<A> | Split<B> : Trim<S>;
// An embed (`rel(...)`) makes the result shape depend on the select string; supabase-js derives it at the type level, here it is `any` (call sites annotate).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Picked<T extends TableName, C extends string> = C extends `${string}(${string}` ? any : C extends "*" ? Row<T> : Pick<Row<T>, Extract<Split<C>, keyof Row<T>>>;
type Col<T extends TableName> = (keyof Row<T> & string) | (string & {}); // plain column or `embed.column` path

export interface DbError {
  message: string;
  code: string;
  status: number;
}
export type DbResult<D> = { data: D; count: number | null; error: null } | { data: null; count: number | null; error: DbError };

export interface DbOptions {
  baseUrl: string | undefined;
  getToken: () => Promise<string | undefined>;
}

const OPS = new Set<Op>(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);

/** Parses `a.eq.1,b.is.null,c.in.(x,y)` (PostgREST or() syntax, flat form only). */
export function parseOr(expr: string): Filter[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of expr) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => {
    if (/(^|\.)(and|or|not)\(/.test(p)) throw new Error(`db: nested or()/and() is not supported: ${p}`);
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\.(not\.)?([a-z]+)\.(.*)$/s.exec(p);
    if (!m || !OPS.has(m[3] as Op)) throw new Error(`db: cannot parse or() term: ${p}`);
    const op = m[3] as Op;
    const raw = m[4]!;
    const val: Filter["val"] =
      op === "in" ? raw.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim().replace(/^"|"$/g, ""))
      : op === "is" ? (raw === "null" ? null : raw === "true")
      : raw;
    return { col: m[1]!, op, val, ...(m[2] ? { neg: true } : {}) };
  });
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** `*, topics:teaching_plan_slot_topics(topic_id, position)` -> parent columns + embed tree. */
export function parseSelect(select: string, table = "?"): { columns: "*" | string[]; embeds: Embed[] } {
  const cols: string[] = [];
  const embeds: Embed[] = [];
  let star = false;
  for (const item of splitTop(select)) {
    const m = /^(?:(\w+):)?(\w+)((?:![\w]+)*)\((.*)\)$/s.exec(item);
    if (m) {
      const bangs = m[3] ? m[3].split("!").filter(Boolean) : [];
      const inner = bangs.includes("inner");
      const hint = bangs.find((b) => b !== "inner");
      const body = m[4]!.trim();
      const sub = body === "count" ? null : parseSelect(body, m[2]);
      embeds.push({ alias: m[1] ?? m[2]!, table: m[2]!, ...(hint ? { hint } : {}), ...(inner ? { inner } : {}), columns: sub ? sub.columns : "count", ...(sub?.embeds.length ? { embeds: sub.embeds } : {}) });
    } else if (item === "*") star = true;
    else if (/^\w+$/.test(item)) cols.push(item);
    else throw new Error(`db: unsupported select item "${item}" (table ${table}); column aliases and casts are not supported`);
  }
  if (star && cols.length) throw new Error(`db: "*" combined with named columns is not supported (table ${table})`);
  return { columns: star ? "*" : cols, embeds };
}

class Select<T extends TableName, D> implements PromiseLike<DbResult<D>> {
  private readonly req: SelectRequest;
  constructor(private readonly opts: DbOptions, table: T, columns: string, o?: { count?: "exact"; head?: boolean }) {
    const { columns: cols, embeds } = parseSelect(columns, table);
    this.req = { table, columns: cols, ...(embeds.length ? { embeds } : {}), filters: [], ors: [], order: [], ...(o?.count ? { count: true } : {}), ...(o?.head ? { head: true } : {}) };
  }

  private f(col: string, op: Op, val: Filter["val"], neg?: boolean): this {
    const path = col.split(".");
    const name = path.pop()!;
    let target: { filters?: Filter[]; embeds?: Embed[] } = this.req;
    for (const seg of path) {
      const e: Embed | undefined = target.embeds?.find((x) => x.alias === seg);
      if (!e) throw new Error(`db: filter on "${col}" but the select has no embed "${seg}" (table ${this.req.table})`);
      target = e;
    }
    (target.filters ??= []).push({ col: name, op, val, ...(neg ? { neg } : {}) });
    return this;
  }
  eq(col: Col<T>, v: Scalar) { return this.f(col, "eq", v); }
  neq(col: Col<T>, v: Scalar) { return this.f(col, "neq", v); }
  gt(col: Col<T>, v: Scalar) { return this.f(col, "gt", v); }
  gte(col: Col<T>, v: Scalar) { return this.f(col, "gte", v); }
  lt(col: Col<T>, v: Scalar) { return this.f(col, "lt", v); }
  lte(col: Col<T>, v: Scalar) { return this.f(col, "lte", v); }
  like(col: Col<T>, v: string) { return this.f(col, "like", v); }
  ilike(col: Col<T>, v: string) { return this.f(col, "ilike", v); }
  is(col: Col<T>, v: boolean | null) { return this.f(col, "is", v); }
  in(col: Col<T>, v: readonly Scalar[]) { return this.f(col, "in", [...v]); }
  not(col: Col<T>, op: Op, v: Filter["val"]) { return this.f(col, op, v, true); }
  or(expr: string) { this.req.ors.push(parseOr(expr)); return this; }
  order(col: Col<T>, o?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.req.order.push({ col, asc: o?.ascending ?? true, ...(o?.nullsFirst === undefined ? {} : { nullsFirst: o.nullsFirst }) });
    return this;
  }
  limit(n: number) { this.req.limit = n; return this; }
  range(from: number, to: number) { this.req.offset = from; this.req.limit = to - from + 1; return this; }
  single(): Select<T, D extends (infer R)[] ? R : D> { this.req.single = "one"; return this as never; }
  maybeSingle(): Select<T, (D extends (infer R)[] ? R : D) | null> { this.req.single = "maybe"; return this as never; }

  then<R1 = DbResult<D>, R2 = never>(ok?: ((v: DbResult<D>) => R1 | PromiseLike<R1>) | null, fail?: ((e: unknown) => R2 | PromiseLike<R2>) | null): Promise<R1 | R2> {
    return this.run().then(ok, fail);
  }

  private async run(): Promise<DbResult<D>> {
    const { baseUrl, getToken } = this.opts;
    if (!baseUrl) return { data: null, count: null, error: { message: "VITE_API_URL is not set", code: "", status: 0 } };
    try {
      const token = await getToken();
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/q`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(this.req) });
      return (await res.json()) as ApiResponse as DbResult<D>;
    } catch (e) {
      return { data: null, count: null, error: { message: e instanceof Error ? e.message : String(e), code: "", status: 0 } };
    }
  }
}

export function createDb(opts: DbOptions) {
  return {
    from: <T extends TableName>(table: T) => ({
      select: <C extends string = "*">(columns: C = "*" as C, o?: { count?: "exact"; head?: boolean }) =>
        new Select<T, Picked<T, C>[]>(opts, table, columns, o),
    }),
  };
}

/** App-wide instance. Token = the current Supabase session until phase 5 moves login to the worker. */
export const db = createDb({
  baseUrl: import.meta.env.VITE_API_URL as string | undefined,
  getToken: async () => (await (await import("@/lib/supabase")).supabase.auth.getSession()).data.session?.access_token,
});
