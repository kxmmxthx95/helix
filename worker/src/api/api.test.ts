// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../index";
import type { ApiResponse, SelectRequest } from "./protocol";
import { schemaDb } from "./testdb";

const ID = {
  deptA: "d-a", deptB: "d-b",
  admin: "u-admin", teacher: "u-teacher", stuA: "u-stu-a", stuB: "u-stu-b", parent: "u-parent",
  sA: "s-a", sB: "s-b", sC: "s-c",
};

function setup() {
  const { d1, raw } = schemaDb();
  const x = (sql: string, ...p: unknown[]) => raw.prepare(sql).run(...(p as never[]));
  x("INSERT INTO departments(id,code,name) VALUES (?, 'A','Dept A'), (?, 'B','Dept B')", ID.deptA, ID.deptB);
  const prof = (id: string, dept: string | null) => x("INSERT INTO profiles(id,first_name,last_name,department_id) VALUES (?,?, 'L', ?)", id, id, dept);
  prof(ID.admin, null); prof(ID.teacher, ID.deptA); prof(ID.stuA, ID.deptA); prof(ID.stuB, ID.deptB); prof(ID.parent, null);
  const role = (p: string, r: string) => x("INSERT INTO profile_roles(profile_id,role) VALUES (?,?)", p, r);
  role(ID.admin, "super_admin"); role(ID.teacher, "teacher"); role(ID.stuA, "student"); role(ID.stuB, "student"); role(ID.parent, "parent");
  const stu = (id: string, code: string, dept: string, profile: string | null) =>
    x("INSERT INTO students(id,student_code,first_name,last_name,department_id,profile_id) VALUES (?,?, 'F','L',?,?)", id, code, dept, profile);
  stu(ID.sA, "001", ID.deptA, ID.stuA); stu(ID.sB, "002", ID.deptB, ID.stuB); stu(ID.sC, "003", ID.deptA, null);
  x("INSERT INTO guardianships(parent_id,student_id) VALUES (?,?)", ID.parent, ID.sB);
  x("INSERT INTO student_contacts(id,student_id,relationship,first_name,last_name,is_primary) VALUES ('c-a',?, 'mother','M','L',1), ('c-b',?, 'father','F','L',0)", ID.sA, ID.sB);
  return d1;
}

let env: Env;
beforeEach(() => {
  env = { FILES: {}, DB: setup(), SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "anon", SIGNING_SECRET: "s", ALLOWED_ORIGINS: "" } as unknown as Env;
  // GoTrue stand-in: the token IS the user id ("bad" is rejected).
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    const t = ((init.headers as Record<string, string>).authorization ?? "").replace("Bearer ", "");
    return t === "bad" ? new Response("{}", { status: 401 }) : Response.json({ id: t });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const base: SelectRequest = { table: "profiles", columns: "*", filters: [], ors: [], order: [], };
async function ask(as: string | null, q: Partial<SelectRequest>) {
  const res = await worker.fetch(new Request("https://w.test/q", { method: "POST", headers: as ? { authorization: `Bearer ${as}` } : {}, body: JSON.stringify({ ...base, ...q }) }), env);
  return { status: res.status, body: (await res.json()) as ApiResponse<any> };
}
const ids = (r: { body: ApiResponse<any> }, col = "id") => (r.body.data as Record<string, unknown>[]).map((x) => x[col]).sort();

describe("row-level policies", () => {
  it("rejects anonymous and invalid sessions", async () => {
    expect((await ask(null, {})).status).toBe(401);
    expect((await ask("bad", {})).status).toBe(401);
  });

  it("a student sees only their own profile, roles, student row and contacts (0239, 0242)", async () => {
    expect(ids(await ask(ID.stuA, {}))).toEqual([ID.stuA]); // 0242: profiles_read_scope no longer applies to students
    expect(ids(await ask(ID.teacher, {}))).toEqual([ID.stuA, ID.teacher].sort()); // staff still see their department
    expect(ids(await ask(ID.stuA, { table: "profile_roles", columns: ["role"] }), "role")).toEqual(["student"]);
    // migration 0239: a classmate (sC, same department) and their contacts are NOT visible to a student
    expect(ids(await ask(ID.stuA, { table: "students" }))).toEqual([ID.sA]);
    expect(ids(await ask(ID.stuA, { table: "student_contacts" }))).toEqual(["c-a"]);
    expect(ids(await ask(ID.stuB, { table: "student_contacts" }))).toEqual(["c-b"]);
    // ...while a teacher of that department still sees the whole department
    expect(ids(await ask(ID.teacher, { table: "students" }))).toEqual([ID.sA, ID.sC].sort());
  });

  it("org-wide staff sees everything; a parent sees only their child", async () => {
    expect((await ask(ID.admin, { table: "students" })).body.data).toHaveLength(3);
    expect((await ask(ID.admin, { table: "profile_roles" })).body.data).toHaveLength(5);
    expect(ids(await ask(ID.parent, { table: "students" }))).toEqual([ID.sB]);
    expect(ids(await ask(ID.parent, { table: "student_contacts" }))).toEqual(["c-b"]);
  });

  it("a teacher sees roles of colleagues in their department only", async () => {
    expect(ids(await ask(ID.teacher, { table: "profile_roles", columns: ["profile_id"] }), "profile_id")).toEqual([ID.stuA, ID.teacher].sort());
  });

  it("tables with no policy (Postgres: deny-all, only reachable through RPCs) are not reachable", async () => {
    const r = await ask(ID.admin, { table: "password_reset_attempts" });
    expect(r.status).toBe(403);
    expect(await ask(ID.admin, { table: "nope" })).toMatchObject({ status: 404 });
  });
});

describe("query features", () => {
  it("filters, in() over any length, order, limit, count", async () => {
    const many = Array.from({ length: 500 }, (_, i) => `x${i}`).concat([ID.sA, ID.sC]);
    const r = await ask(ID.admin, { table: "students", filters: [{ col: "id", op: "in", val: many }], order: [{ col: "student_code", asc: false }] });
    expect(ids(r, "student_code")).toEqual(["001", "003"]);
    expect((r.body.data as { student_code: string }[])[0]!.student_code).toBe("003");
    const c = await ask(ID.admin, { table: "students", columns: ["id"], count: true, head: true, filters: [{ col: "department_id", op: "eq", val: ID.deptA }] });
    expect(c.body).toEqual({ data: null, count: 2, error: null });
    expect((await ask(ID.admin, { table: "students", limit: 1, order: [{ col: "student_code", asc: true }] })).body.data).toHaveLength(1);
  });

  it("or(), not() and is()", async () => {
    const r = await ask(ID.admin, { table: "students", ors: [[{ col: "student_code", op: "eq", val: "001" }, { col: "student_code", op: "eq", val: "002" }]], filters: [{ col: "profile_id", op: "is", val: null, neg: true }] });
    expect(ids(r, "student_code")).toEqual(["001", "002"]);
  });

  it("single / maybeSingle behave like PostgREST", async () => {
    const one = await ask(ID.stuA, { table: "profiles", filters: [{ col: "id", op: "eq", val: ID.stuA }], single: "one" });
    expect(one.body.data).toMatchObject({ id: ID.stuA });
    expect((await ask(ID.stuA, { table: "profiles", filters: [{ col: "id", op: "eq", val: "none" }], single: "maybe" })).body).toEqual({ data: null, count: null, error: null });
    const none = await ask(ID.stuA, { table: "profiles", filters: [{ col: "id", op: "eq", val: "none" }], single: "one" });
    expect(none).toMatchObject({ status: 406, body: { error: { code: "PGRST116" } } });
    expect((await ask(ID.admin, { table: "profiles", single: "maybe" })).status).toBe(406); // many rows
  });

  it("converts booleans and never lets identifiers or values become SQL", async () => {
    const r = await ask(ID.admin, { table: "student_contacts", filters: [{ col: "is_primary", op: "eq", val: true }] });
    expect(ids(r)).toEqual(["c-a"]);
    expect((r.body.data as { is_primary: boolean }[])[0]!.is_primary).toBe(true);
    expect((await ask(ID.admin, { table: "students", columns: ["id; DROP TABLE students"] })).status).toBe(400);
    expect((await ask(ID.admin, { table: "students", filters: [{ col: "id\" OR 1=1 --", op: "eq", val: 1 }] })).status).toBe(400);
    expect((await ask(ID.admin, { table: "students", filters: [{ col: "student_code", op: "eq", val: "' OR 1=1 --" }] })).body.data).toEqual([]);
    expect((await ask(ID.admin, { table: "students", limit: -1 })).status).toBe(400);
    expect((await ask(ID.admin, { table: "students" })).body.data).toHaveLength(3); // table intact
  });
});
