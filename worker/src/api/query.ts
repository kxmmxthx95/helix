import { compileSelect } from "./compile";
import { toApiRow } from "./convert";
import { authenticate, loadCtx } from "./identity";
import { ApiFailure, tableColumns } from "./manifest";
import { selectPolicy } from "./policy";
import type { ApiResponse, SelectRequest } from "./protocol";

export interface ApiEnv {
  DB?: D1Database;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Shape-check an untrusted request body. Identifiers are validated against the manifest later, values are always bound. */
function parse(body: unknown): SelectRequest {
  const b = body as Partial<SelectRequest> | null;
  if (!b || !isStr(b.table) || !Array.isArray(b.filters) || !Array.isArray(b.ors) || !Array.isArray(b.order)) throw new ApiFailure(400, "PGRST100", "malformed query");
  if (b.columns !== "*" && !(Array.isArray(b.columns) && b.columns.every(isStr))) throw new ApiFailure(400, "PGRST100", "malformed columns");
  return b as SelectRequest;
}

/** `timing` receives milliseconds per stage, surfaced as a Server-Timing header. */
export async function handleSelect(req: Request, env: ApiEnv, timing: Record<string, number> = {}): Promise<ApiResponse> {
  if (!env.DB) throw new ApiFailure(503, "PGRST000", "database not configured");
  let t = Date.now();
  const lap = (name: string) => { const n = Date.now(); timing[name] = n - t; t = n; };
  const uid = await authenticate(req, env);
  lap("auth");
  const q = parse(await req.json().catch(() => null));
  tableColumns(q.table); // 404 for unknown tables before anything else
  const policy = selectPolicy(q.table);
  if (!policy) throw new ApiFailure(403, "42501", `table ${q.table} is not available through the API yet`);

  const ctx = await loadCtx(env.DB, uid);
  lap("ctx");
  const { rows, count } = compileSelect(q, policy(ctx));
  const run = (s: { sql: string; params: unknown[] }) => env.DB!.prepare(s.sql).bind(...s.params);
  const [r1, r2] = await env.DB.batch<Record<string, unknown>>([rows, count].filter((s) => s !== null).map(run));
  lap("query");
  const rowRes = rows ? r1! : null;
  const total = count ? Number((rows ? r2! : r1!).results[0]?.c ?? 0) : null;

  const data = (rowRes?.results ?? []).map((r) => toApiRow(q.table, r));
  if (q.single) {
    if (data.length === 1) return { data: data[0], count: total, error: null };
    if (data.length === 0 && q.single === "maybe") return { data: null as never, count: total, error: null };
    throw new ApiFailure(406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
  }
  return { data: q.head ? (null as never) : data, count: total, error: null };
}

export const errorBody = (e: ApiFailure): ApiResponse => ({ data: null, count: null, error: { message: e.message, code: e.code, status: e.status } });
