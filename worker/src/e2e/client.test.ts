// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
// Client (src/lib/db.ts) against the real worker + generated schema. Excluded from worker/tsconfig (it crosses into the app project); vitest runs it.
import { createDb, parseOr } from "../../../src/lib/db";
import { schemaDb } from "../api/testdb";
import worker, { type Env } from "../index";

describe("parseOr", () => {
  it("parses flat PostgREST terms", () => {
    expect(parseOr("a.eq.1,b.is.null,c.in.(x,y),d.not.eq.z")).toEqual([
      { col: "a", op: "eq", val: "1" }, { col: "b", op: "is", val: null }, { col: "c", op: "in", val: ["x", "y"] }, { col: "d", op: "eq", val: "z", neg: true },
    ]);
  });
  it("refuses what it cannot translate faithfully", () => {
    expect(() => parseOr("a.eq.1,and(b.eq.2,c.eq.3)")).toThrow(/nested/);
    expect(() => parseOr("garbage")).toThrow(/cannot parse/);
  });
});

describe("client ↔ worker, end to end", () => {
  const { d1, raw } = schemaDb();
  raw.exec(`INSERT INTO departments(id,code,name) VALUES ('d1','A','A');
    INSERT INTO profiles(id,first_name,last_name,department_id) VALUES ('me','Me','X','d1'), ('mate','Mate','Y','d1');
    INSERT INTO profile_roles(profile_id,role) VALUES ('me','teacher'), ('mate','teacher');`);
  const env = { DB: d1, SUPABASE_URL: "x", SUPABASE_ANON_KEY: "x" } as unknown as Env;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url).includes("/auth/v1/user")) return Response.json({ id: (init.headers as Record<string, string>)["authorization"]!.slice(7) });
    return worker.fetch(new Request(url, init), env);
  });
  const db = createDb({ baseUrl: "https://api.test", getToken: async () => "me" });

  it("behaves like supabase-js for the login-path queries", async () => {
    const own = await db.from("profiles").select("*").eq("id", "me").single();
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject({ id: "me", first_name: "Me", is_active: true });

    const roles = await db.from("profile_roles").select("role").eq("profile_id", "me");
    expect(roles.data).toEqual([{ role: "teacher" }]);

    const stu = await db.from("students").select("*").eq("profile_id", "me").maybeSingle();
    expect(stu).toEqual({ data: null, count: null, error: null });

    const n = await db.from("student_contacts").select("id", { count: "exact", head: true }).eq("student_id", "none");
    expect(n).toEqual({ data: null, count: 0, error: null });
  });

  it("reports errors in supabase-js shape; rejects unsupported syntax early", async () => {
    const miss = await db.from("profiles").select("*").eq("id", "nobody").single();
    expect(miss.data).toBeNull();
    expect(miss.error).toMatchObject({ code: "PGRST116" });
    expect(() => db.from("profiles").select("id, n:first_name")).toThrow(/unsupported/);
    const off = createDb({ baseUrl: undefined, getToken: async () => "me" });
    expect((await off.from("profiles").select("*")).error?.message).toMatch(/VITE_API_URL/);
  });
});
