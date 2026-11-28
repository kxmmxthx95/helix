import type { Database } from "@/lib/database.types";
import type { ApiResponse, Filter, Op, Scalar, SelectRequest } from "../../worker/src/api/protocol";

/**
 * supabase-js-shaped client for the Cloudflare API worker (docs/cloudflare-migration.md, phase 4.3).
 * Read-only for now, on the tables the worker has policies for; anything else is rejected by the worker (403).
 * Unsupported syntax throws at call time instead of silently returning different data:
 * embedded selects (`rel(cols)`), aliases, nested or(and(...)).
 */
type Tables = Database["public"]["Tables"];
type TableName = keyof Tables & string;
type Row<T extends TableName> = Tables[T]["Row"];

type Trim<S extends string> = S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S;
type Split<S extends string> = S extends `${infer A},${infer B}` ? Trim<A> | Split<B> : Trim<S>;
type Picked<T extends TableName, C extends string> = C extends "*" ? Row<T> : Pick<Row<T>, Extract<Split<C>, keyof Row<T>>>;

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

class Select<T extends TableName, D> implements PromiseLike<DbResult<D>> {
  private readonly req: SelectRequest;
  constructor(private readonly opts: DbOptions, table: T, columns: string, o?: { count?: "exact"; head?: boolean }) {
    const cols = columns.trim() === "*" ? "*" : columns.split(",").map((c) => c.trim());
    if (cols !== "*") for (const c of cols) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)) throw new Error(`db: embedded/aliased select is not supported yet: "${c}" (table ${table})`);
    this.req = { table, columns: cols, filters: [], ors: [], order: [], ...(o?.count ? { count: true } : {}), ...(o?.head ? { head: true } : {}) };
  }

  private f(col: string, op: Op, val: Filter["val"], neg?: boolean): this {
    this.req.filters.push({ col, op, val, ...(neg ? { neg } : {}) });
    return this;
  }
  eq(col: keyof Row<T> & string, v: Scalar) { return this.f(col, "eq", v); }
  neq(col: keyof Row<T> & string, v: Scalar) { return this.f(col, "neq", v); }
  gt(col: keyof Row<T> & string, v: Scalar) { return this.f(col, "gt", v); }
  gte(col: keyof Row<T> & string, v: Scalar) { return this.f(col, "gte", v); }
  lt(col: keyof Row<T> & string, v: Scalar) { return this.f(col, "lt", v); }
  lte(col: keyof Row<T> & string, v: Scalar) { return this.f(col, "lte", v); }
  like(col: keyof Row<T> & string, v: string) { return this.f(col, "like", v); }
  ilike(col: keyof Row<T> & string, v: string) { return this.f(col, "ilike", v); }
  is(col: keyof Row<T> & string, v: boolean | null) { return this.f(col, "is", v); }
  in(col: keyof Row<T> & string, v: readonly Scalar[]) { return this.f(col, "in", [...v]); }
  not(col: keyof Row<T> & string, op: Op, v: Filter["val"]) { return this.f(col, op, v, true); }
  or(expr: string) { this.req.ors.push(parseOr(expr)); return this; }
  order(col: keyof Row<T> & string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
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
