// @vitest-environment node
// Embedded selects through the real client (src/lib/db.ts) and the real worker. Excluded from worker/tsconfig (crosses into the app project).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, parseSelect } from "../../../src/lib/db";
import { schemaDb } from "../api/testdb";
import worker, { type Env } from "../index";

let db: (as: string) => ReturnType<typeof createDb>;

beforeEach(() => {
  const { d1, raw } = schemaDb();
  raw.exec(`
    INSERT INTO departments(id,code,name) VALUES ('d1','A','Dept A'), ('d2','B','Dept B');
    INSERT INTO profiles(id,first_name,last_name,department_id) VALUES ('admin','Ad','Min',NULL), ('pa','Pat','A','d1'), ('pb','Pim','B','d2');
    INSERT INTO profile_roles(profile_id,role) VALUES ('admin','super_admin'), ('pa','student'), ('pb','student');
    INSERT INTO students(id,student_code,first_name,last_name,department_id,profile_id) VALUES ('sa','1','F','A','d1','pa'), ('sb','2','F','B','d2','pb'), ('sx','3','F','X','d1',NULL);
    INSERT INTO student_contacts(id,student_id,relationship,first_name,last_name,is_primary) VALUES ('c1','sa','mother','M','L',1), ('c2','sa','father','Fa','L',0), ('c3','sb','mother','M2','L',1);`);
  const env = { DB: d1, SUPABASE_URL: "x", SUPABASE_ANON_KEY: "x" } as unknown as Env;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url).includes("/auth/v1/user")) return Response.json({ id: (init.headers as Record<string, string>)["authorization"]!.slice(7) });
    return worker.fetch(new Request(url, init), env);
  });
  db = (as) => createDb({ baseUrl: "https://api.test", getToken: async () => as });
});
afterEach(() => vi.unstubAllGlobals());

describe("parseSelect", () => {
  it("parses aliases, hints, !inner, nesting and (count)", () => {
    expect(parseSelect("id, plan_lessons!inner(id, grade_levels(code))", "t")).toEqual({
      columns: ["id"],
      embeds: [{ alias: "plan_lessons", table: "plan_lessons", inner: true, columns: ["id"], embeds: [{ alias: "grade_levels", table: "grade_levels", columns: ["code"] }] }],
    });
    expect(parseSelect("*, topics:slot_topics(count), profile:profiles!profile_id(a)", "t").embeds).toEqual([
      { alias: "topics", table: "slot_topics", columns: "count" },
      { alias: "profile", table: "profiles", hint: "profile_id", columns: ["a"] },
    ]);
    expect(() => parseSelect("a:b", "t")).toThrow(/unsupported/);
  });
});

describe("embedded selects", () => {
  it("many-to-one with a hint returns an object, one-to-many an array, and missing rows null / []", async () => {
    const r = await db("admin").from("students").select("id, profile:profiles!profile_id(first_name), contacts:student_contacts(first_name, is_primary)").order("id");
    expect(r.error).toBeNull();
    const by = Object.fromEntries((r.data as any[]).map((x) => [x.id, x]));
    expect(by.sa.profile).toEqual({ first_name: "Pat" });
    expect(by.sa.contacts).toHaveLength(2);
    expect(by.sa.contacts.find((c: any) => c.first_name === "M").is_primary).toBe(true); // JSON boolean, not 1
    expect(by.sx.profile).toBeNull();
    expect(by.sx.contacts).toEqual([]);
  });

  it("nests, and !inner drops parents without a match", async () => {
    const r = await db("admin").from("students").select("id, profile:profiles!profile_id!inner(first_name, department:departments(code))").order("id");
    expect((r.data as any[]).map((x) => x.id)).toEqual(["sa", "sb"]); // sx has no profile
    expect((r.data as any[])[0].profile).toEqual({ first_name: "Pat", department: { code: "A" } });
  });

  it("filters on an embedded column narrow the embedded rows only (without !inner)", async () => {
    const r = await db("admin").from("students").select("id, contacts:student_contacts(first_name)").eq("contacts.relationship", "father").order("id");
    const by = Object.fromEntries((r.data as any[]).map((x) => [x.id, x.contacts]));
    expect(by.sa).toEqual([{ first_name: "Fa" }]);
    expect(by.sb).toEqual([]);
    expect(r.data).toHaveLength(3); // every student is still returned
  });

  it("with !inner a filter on the embed also removes parents, and counts follow", async () => {
    const r = await db("admin").from("students").select("id, contacts:student_contacts!inner(first_name)", { count: "exact" }).eq("contacts.relationship", "father");
    expect((r.data as any[]).map((x) => x.id)).toEqual(["sa"]);
    expect(r.count).toBe(1);
  });

  it("supports (count)", async () => {
    const r = await db("admin").from("students").select("id, student_contacts(count)").eq("id", "sa").single();
    expect(r.data).toEqual({ id: "sa", student_contacts: [{ count: 2 }] });
  });

  it("applies the embedded table's own row-level security", async () => {
    // a student may see their own profile row only; the embed must not leak a classmate's profile
    const asStudent = await db("pa").from("student_contacts").select("id, student:students!student_id(id, profile:profiles!profile_id(first_name))").order("id");
    const rows = asStudent.data as any[];
    expect(rows.map((x) => x.id)).toEqual(["c1", "c2"]); // only their own contacts are visible at all
    expect(rows[0].student).toEqual({ id: "sa", profile: { first_name: "Pat" } });
    const asAdmin = await db("admin").from("student_contacts").select("id, student:students!student_id(profile:profiles!profile_id(first_name))").eq("id", "c3").single();
    expect((asAdmin.data as any).student.profile).toEqual({ first_name: "Pim" });
  });

  it("reports unknown and ambiguous relationships like PostgREST", async () => {
    const r = await db("admin").from("students").select("id, classrooms(id)");
    expect(r.error).toMatchObject({ code: "PGRST200" });
  });
});
