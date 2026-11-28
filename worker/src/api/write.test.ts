// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "./query";
import type { ApiResponse, WriteRequest } from "./protocol";
import { schemaDb } from "./testdb";
import { handleWrite } from "./write";

const U = { admin: "u-admin", teacher: "u-teacher", stuA: "u-stu-a", stuB: "u-stu-b" };
const S = { a: "s-a", b: "s-b", c: "s-c" };
let raw: ReturnType<typeof schemaDb>["raw"];
let env: ApiEnv;
const run = (sql: string, ...p: unknown[]) => raw.prepare(sql).run(...(p as never[]));
const rows = (sql: string, ...p: unknown[]) => raw.prepare(sql).all(...(p as never[])) as Record<string, unknown>[];

beforeEach(() => {
  const t = schemaDb();
  raw = t.raw;
  env = { DB: t.d1, SUPABASE_URL: "x", SUPABASE_ANON_KEY: "x" };
  run("INSERT INTO departments(id,code,name) VALUES ('d1','A','A'), ('d2','B','B')");
  for (const [id, d] of [[U.admin, null], [U.teacher, "d1"], [U.stuA, "d1"], [U.stuB, "d2"]] as const) run("INSERT INTO profiles(id,first_name,last_name,department_id) VALUES (?, ?, 'L', ?)", id, id, d);
  run("INSERT INTO profile_roles(profile_id,role) VALUES (?, 'super_admin'), (?, 'teacher'), (?, 'student'), (?, 'student')", U.admin, U.teacher, U.stuA, U.stuB);
  run("INSERT INTO students(id,student_code,first_name,last_name,department_id,profile_id) VALUES (?, '1', 'F', 'L', 'd1', ?), (?, '2', 'F', 'L', 'd2', ?), (?, '3', 'F', 'L', 'd1', NULL)", S.a, U.stuA, S.b, U.stuB, S.c);
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => Response.json({ id: ((init.headers as Record<string, string>).authorization ?? "").slice(7) }));
});
afterEach(() => vi.unstubAllGlobals());

async function write(as: string | null, r: Partial<WriteRequest> & { table?: string }, writable = ["student_contacts", "students", "profiles"]) {
  const body = { table: "student_contacts", filters: [], ors: [], ...r } as WriteRequest;
  try {
    const res = await handleWrite(new Request("https://w.test/w", { method: "POST", headers: as ? { authorization: `Bearer ${as}` } : {}, body: JSON.stringify(body) }), env, { writable: new Set(writable) });
    return { status: 200, body: res as ApiResponse<any> };
  } catch (e: any) {
    return { status: e.status as number, body: { data: null, count: null, error: { code: e.code, message: e.message, status: e.status } } as ApiResponse<any> };
  }
}
const contact = (studentId: string, extra: object = {}) => ({ student_id: studentId, relationship: "mother", first_name: "M", last_name: "L", ...extra });
const count = (table = "student_contacts") => (rows(`SELECT count(*) n FROM ${table}`)[0] as { n: number }).n;

describe("insert", () => {
  it("applies defaults, converts types and returns the row", async () => {
    const r = await write(U.admin, { op: "insert", values: contact(S.a, { is_primary: true }), returning: "*", single: "one" });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ student_id: S.a, is_primary: true, relationship: "mother" });
    expect(r.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.body.data.created_at).toMatch(/Z$/);
    expect(rows("SELECT is_primary FROM student_contacts")[0]!.is_primary).toBe(1);
  });

  it("checks the policy on the complete new row", async () => {
    expect((await write(U.stuA, { op: "insert", values: contact(S.a) })).status).toBe(200); // own contact (manage_self)
    const other = await write(U.stuA, { op: "insert", values: contact(S.c) }); // a classmate's
    expect(other).toMatchObject({ status: 403, body: { error: { code: "42501" } } });
    expect(count()).toBe(1);
    expect((await write(U.teacher, { op: "insert", values: contact(S.a) })).status).toBe(403); // teachers cannot manage contacts
  });

  it("is all-or-nothing for several rows", async () => {
    const r = await write(U.stuA, { op: "insert", values: [contact(S.a), contact(S.c)] });
    expect(r.status).toBe(403);
    expect(count()).toBe(0);
  });

  it("maps database errors to Postgres codes and rejects bad input", async () => {
    expect((await write(U.admin, { op: "insert", values: { student_id: S.a } })).body.error?.code).toBe("23502");
    expect((await write(U.admin, { op: "insert", values: contact(S.a, { is_primary: "yes" }) })).body.error?.code).toBe("22P02");
    expect((await write(U.admin, { op: "insert", values: contact(S.a, { nope: 1 }) })).status).toBe(400);
    expect((await write(U.admin, { op: "insert", values: { "x\") ; DROP TABLE students; --": 1 } })).status).toBe(400);
    expect(count("students")).toBe(3);
  });
});

describe("update", () => {
  it("lets a student change their own row but not hand it to someone else", async () => {
    expect((await write(U.stuA, { table: "students", op: "update", values: { phone: "081" }, filters: [{ col: "id", op: "eq", val: S.a }] })).status).toBe(200);
    expect(rows("SELECT phone FROM students WHERE id = ?", S.a)[0]!.phone).toBe("081");
    const steal = await write(U.stuA, { table: "students", op: "update", values: { profile_id: U.stuB }, filters: [{ col: "id", op: "eq", val: S.a }] });
    expect(steal).toMatchObject({ status: 403, body: { error: { code: "42501" } } });
    expect(rows("SELECT profile_id FROM students WHERE id = ?", S.a)[0]!.profile_id).toBe(U.stuA);
  });

  it("silently skips rows the caller cannot update, like Postgres", async () => {
    const r = await write(U.stuA, { table: "students", op: "update", values: { phone: "999" }, filters: [{ col: "id", op: "eq", val: S.c }], returning: "*" });
    expect(r).toMatchObject({ status: 200, body: { data: [] } });
    expect(rows("SELECT phone FROM students WHERE id = ?", S.c)[0]!.phone).toBeNull();
    const asAdmin = await write(U.admin, { table: "students", op: "update", values: { phone: "999" }, filters: [{ col: "id", op: "eq", val: S.c }], returning: ["id", "phone"] });
    expect(asAdmin.body.data).toEqual([{ id: S.c, phone: "999" }]);
  });

  it("needs a WHERE, and single() on zero rows fails without writing", async () => {
    expect((await write(U.admin, { table: "students", op: "update", values: { phone: "1" } })).status).toBe(400);
    const none = await write(U.stuA, { table: "students", op: "update", values: { phone: "1" }, filters: [{ col: "id", op: "eq", val: S.c }], returning: "*", single: "one" });
    expect(none).toMatchObject({ status: 406, body: { error: { code: "PGRST116" } } });
  });

  it("converts JSON and booleans in patches", async () => {
    await write(U.admin, { op: "insert", values: contact(S.a) });
    const r = await write(U.admin, { op: "update", values: { is_primary: true }, filters: [{ col: "student_id", op: "eq", val: S.a }], returning: ["is_primary"] });
    expect(r.body.data).toEqual([{ is_primary: true }]);
  });
});

describe("delete and upsert", () => {
  it("deletes only visible-and-allowed rows, and needs a WHERE", async () => {
    await write(U.admin, { op: "insert", values: [contact(S.a), contact(S.c)] });
    expect((await write(U.stuA, { op: "delete" })).status).toBe(400);
    const own = await write(U.stuA, { op: "delete", filters: [{ col: "student_id", op: "in", val: [S.a, S.c] }], returning: ["student_id"] });
    expect(own.body.data).toEqual([{ student_id: S.a }]); // the classmate's contact is neither visible nor deletable
    expect(count()).toBe(1);
    expect((await write(U.admin, { op: "delete", filters: [{ col: "student_id", op: "eq", val: S.c }] })).status).toBe(200);
    expect(count()).toBe(0);
  });

  it("upserts on a unique key", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await write(U.admin, { op: "upsert", onConflict: ["id"], values: contact(S.a, { id, first_name: "One" }) });
    await write(U.admin, { op: "upsert", onConflict: ["id"], values: contact(S.a, { id, first_name: "Two" }) });
    expect(rows("SELECT first_name FROM student_contacts")).toEqual([{ first_name: "Two" }]);
    // a student may not upsert over a row they cannot update
    await write(U.admin, { op: "insert", values: contact(S.c, { id: "22222222-2222-4222-8222-222222222222" }) });
    const r = await write(U.stuA, { op: "upsert", onConflict: ["id"], values: contact(S.a, { id: "22222222-2222-4222-8222-222222222222", first_name: "Hijack" }) });
    expect(r.status).toBe(403);
    expect(rows("SELECT first_name FROM student_contacts WHERE id = '22222222-2222-4222-8222-222222222222'")[0]!.first_name).toBe("M");
  });
});

describe("gates", () => {
  it("only lists tables are writable; unknown tables, anonymous callers and tables without policies are refused", async () => {
    expect((await write(U.admin, { op: "insert", values: contact(S.a) }, [])).status).toBe(403);
    expect((await write(U.admin, { op: "insert", values: {}, table: "nope" } as never)).status).toBe(404);
    expect((await write(null, { op: "insert", table: "student_contacts", values: contact(S.a) })).status).toBe(401);
    expect((await write(U.admin, { op: "insert", table: "password_reset_attempts", values: { login_id: "x" } }, ["password_reset_attempts"])).status).toBe(403);
  });
});

describe("what the Postgres triggers did", () => {
  const audit = () => rows("SELECT actor_id, actor_roles, action, table_name, record_id, changes FROM audit_logs ORDER BY id");

  it("writes audit_logs for staff (insert, update, delete) in the same shape as log_audit", async () => {
    const ins = await write(U.admin, { op: "insert", values: contact(S.a, { is_primary: true }), returning: ["id"], single: "one" });
    const id = ins.body.data.id as string;
    await write(U.admin, { op: "update", values: { first_name: "Z" }, filters: [{ col: "id", op: "eq", val: id }] });
    await write(U.admin, { op: "delete", filters: [{ col: "id", op: "eq", val: id }] });
    const log = audit();
    expect(log.map((l) => l.action)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(log[0]).toMatchObject({ actor_id: U.admin, table_name: "student_contacts", record_id: id });
    expect(JSON.parse(log[0]!.actor_roles as string)).toEqual(["super_admin"]);
    const ch = log.map((l) => JSON.parse(l.changes as string));
    expect(ch[0].new).toMatchObject({ first_name: "M", is_primary: true }); // booleans as JSON booleans
    expect(ch[1]).toMatchObject({ old: { first_name: "M" }, new: { first_name: "Z" } });
    expect(ch[2].old.first_name).toBe("Z");
  });

  it("does not audit students, failed writes or later raw SQL; clears the actor afterwards", async () => {
    await write(U.stuA, { op: "insert", values: contact(S.a) }); // a student: log_audit skips student/parent-only actors
    await write(U.stuA, { op: "insert", values: contact(S.c) }); // denied, rolled back
    await write(U.admin, { op: "insert", values: [contact(S.a), { student_id: S.a }] }); // second row violates NOT NULL: whole batch rolled back
    expect(audit()).toEqual([]);
    expect(rows("SELECT uid FROM _ctx")).toEqual([{ uid: null }]);
    run("INSERT INTO student_contacts(student_id,relationship,first_name,last_name) VALUES (?, 'other', 'x', 'x')", S.a);
    expect(audit()).toEqual([]);
  });

  it("touches updated_at on every update of a table that has the trigger (students does, student_contacts does not)", async () => {
    run("UPDATE students SET updated_at = '2000-01-01T00:00:00.000Z'");
    const up = await write(U.admin, { table: "students", op: "update", values: { phone: "1" }, filters: [{ col: "id", op: "eq", val: S.a }], returning: ["updated_at"] });
    expect(up.body.data[0].updated_at > "2020").toBe(true);
    run("UPDATE student_contacts SET updated_at = '2000-01-01T00:00:00.000Z'");
    await write(U.admin, { op: "insert", values: contact(S.a, { updated_at: "2000-01-01T00:00:00.000Z" }) });
    const c = await write(U.admin, { op: "update", values: { first_name: "Q" }, filters: [{ col: "student_id", op: "eq", val: S.a }], returning: ["updated_at"] });
    expect(c.body.data[0].updated_at).toBe("2000-01-01T00:00:00.000Z"); // no touch_updated_at trigger on this table
  });
});
