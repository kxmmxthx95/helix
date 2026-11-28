// @vitest-environment node
// Real-data check of embedded selects: every `.from(t).select("…rel(…)…")` the app contains is run against PostgREST (service role,
// the ground truth for shape and content) and against this API (as a super_admin, on a copy of the live data), and compared.
// Runs only with: SHADOW_DB=<sqlite> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key>. Needs network and the real data, so not in CI.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDb, parseSelect } from "../../../src/lib/db";
import { sqliteD1 } from "../api/testdb";
import worker, { type Env } from "../index";

const { SHADOW_DB, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY } = process.env;
const realFetch = globalThis.fetch;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : sources(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.|database\.types/.test(f) ? [p] : [];
  });
}

/** (table, select string) pairs with an embed, as written in src/. */
function shapes(): { table: string; select: string; at: string }[] {
  const seen = new Map<string, { table: string; select: string; at: string }>();
  for (const f of sources(new URL("../../../src", import.meta.url).pathname)) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\.from\(\s*"(\w+)"\s*\)\s*\.select\(\s*(["`])((?:(?!\2)[\s\S])*?)\2/g)) {
      const select = m[3]!.replace(/\s+/g, " ").trim();
      if (!select.includes("(") || select.includes("${")) continue;
      seen.set(`${m[1]}|${select}`, { table: m[1]!, select, at: f.split("/src/")[1]! });
    }
  }
  return [...seen.values()];
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d(:?\d\d)?)$/;
/** Same data, different spelling: timestamps by instant, objects by key order, arrays of objects by content. */
function canon(v: unknown): unknown {
  if (typeof v === "string" && ISO.test(v)) return new Date(v.replace(/([+-]\d\d)$/, "$1:00")).getTime();
  if (Array.isArray(v)) return v.map(canon).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)]));
  return v;
}

describe.skipIf(!SHADOW_DB || !SUPABASE_URL || !KEY)("embedded selects: PostgREST vs the API on real data", () => {
  // built lazily: describe bodies also run when the suite is skipped
  let ctx: { raw: ReturnType<typeof sqliteD1>["raw"]; db: ReturnType<typeof createDb> } | undefined;
  function setup() {
    if (ctx) return ctx;
    const { d1, raw } = sqliteD1(SHADOW_DB);
    const admin = (raw.prepare("SELECT profile_id FROM profile_roles WHERE role = 'super_admin' LIMIT 1").get() as { profile_id: string }).profile_id;
    const env = { DB: d1, SUPABASE_URL: "x", SUPABASE_ANON_KEY: "x" } as unknown as Env;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (String(url).includes("/auth/v1/user")) return Response.json({ id: admin });
      if (String(url).startsWith("https://api.test")) return worker.fetch(new Request(url, init), env);
      return realFetch(url, init);
    });
    return (ctx = { raw, db: createDb({ baseUrl: "https://api.test", getToken: async () => "t" }) });
  }
  const list = shapes();

  it("found the call sites", () => expect(list.length).toBeGreaterThan(20));

  it.each(list.map((s) => [`${s.table} ← ${s.select.slice(0, 90)}  (${s.at})`, s] as const))("%s", async (_n, s) => {
    const { raw, db } = setup();
    const order = raw.prepare(`SELECT name FROM pragma_table_info('${s.table}') WHERE pk = 1 ORDER BY pk LIMIT 1`).get() as { name: string } | undefined;
    const key = order?.name ?? "id";
    const url = `${SUPABASE_URL}/rest/v1/${s.table}?select=${encodeURIComponent(s.select)}&order=${key}.asc&limit=40`;
    const pg = await realFetch(url, { headers: { apikey: KEY!, authorization: `Bearer ${KEY}` } });
    const want = await pg.json();
    if (!pg.ok) throw new Error(`PostgREST: ${JSON.stringify(want).slice(0, 200)}`);
    const got = await (db.from(s.table as never) as any).select(s.select).order(key).limit(40);
    if (got.error) throw new Error(`API: ${JSON.stringify(got.error)}`);
    expect(canon(got.data)).toEqual(canon(want));
    void parseSelect;
  });
});
