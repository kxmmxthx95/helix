// @vitest-environment node
// Runs only when PARITY_PG (rows seen per user under real Postgres RLS: uid|tag|table|count|md5) and SHADOW_DB (sqlite from
// scripts/pg-to-d1-data.py) are set: both contain real data and live outside the repo.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
import type { ApiResponse } from "./protocol";
import { sqliteD1 } from "./testdb";

const { PARITY_PG, SHADOW_DB } = process.env;
type Row = { uid: string; tag: string; table: string; n: string; hash: string };

describe.skipIf(!PARITY_PG || !SHADOW_DB)("RLS parity with Postgres (real data)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const rows: Row[] = PARITY_PG ? JSON.parse(readFileSync(PARITY_PG, "utf8")) : [];

  it.each(rows.map((r) => [`${r.tag} ${r.uid.slice(0, 8)} → ${r.table}`, r] as const))("%s", async (_n, r) => {
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => Response.json({ id: ((init.headers as Record<string, string>).authorization ?? "").replace("Bearer ", "") }));
    const env = { DB: sqliteD1(SHADOW_DB).d1, SUPABASE_URL: "x", SUPABASE_ANON_KEY: "x" } as unknown as Env;
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await worker.fetch(new Request("https://w.test/q", { method: "POST", headers: { authorization: `Bearer ${r.uid}` },
        body: JSON.stringify({ table: r.table, columns: ["id"], filters: [], ors: [], order: [{ col: "id", asc: true }], limit: 1000, offset }) }), env);
      const body = (await res.json()) as ApiResponse<{ id: string }[]>;
      if (body.error) throw new Error(body.error.message);
      ids.push(...body.data.map((x) => x.id));
      if (body.data.length < 1000) break;
    }
    ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // byte order, like collate "C"
    expect({ n: ids.length, hash: ids.length ? createHash("md5").update(ids.join(",")).digest("hex") : "" }).toEqual({ n: Number(r.n), hash: r.hash });
  });
});
