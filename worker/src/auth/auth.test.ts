// @vitest-environment node
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schemaDb } from "../api/testdb";
import worker, { type Env } from "../index";
import { hashPassword, verifyPassword } from "./password";
import { signAccessToken, verifyAccessToken } from "./token";

const SECRET = "test-secret-test-secret-test-secret";
let env: Env;
let raw: ReturnType<typeof schemaDb>["raw"];

const run = (sql: string, ...p: unknown[]) => raw.prepare(sql).run(...(p as never[]));
const get = <T>(sql: string, ...p: unknown[]) => raw.prepare(sql).get(...(p as never[])) as T;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://w.test${path}`, { method: "POST", headers, body: JSON.stringify(body) }), env);
const json = async (r: Response) => (await r.json()) as any;
const login = (loginId: string, password: string, studentOnly = true) => post("/auth/login", { loginId, password, studentOnly });

beforeEach(async () => {
  const t = schemaDb();
  raw = t.raw;
  env = { DB: t.d1, FILES: {}, SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "a", SIGNING_SECRET: "s", ALLOWED_ORIGINS: "", AUTH_JWT_SECRET: SECRET } as unknown as Env;
  run("INSERT INTO departments(id,code,name) VALUES ('d1','A','A')");
  // s1001: modern hash. s1002: imported GoTrue-style bcrypt. s1003: banned. staff01: staff email.
  run("INSERT INTO users(id,email,password_hash) VALUES ('u1','1001@students.helix.internal',?), ('u2','1002@students.helix.internal',?), ('u4','staff01@staff.helix.internal',?)",
    await hashPassword("pw-one"), bcrypt.hashSync("pw-two", 10), await hashPassword("pw-staff"));
  run("INSERT INTO users(id,email,password_hash,banned_until) VALUES ('u3','1003@students.helix.internal',?, '2999-01-01T00:00:00.000Z')", await hashPassword("pw-three"));
  for (const id of ["u1", "u2", "u4"]) run("INSERT INTO profiles(id,first_name,last_name,department_id) VALUES (?, 'F', 'L', 'd1')", id);
  run("INSERT INTO profile_roles(profile_id,role) VALUES ('u1','student'), ('u2','student'), ('u4','teacher')");
  run("INSERT INTO students(id,student_code,first_name,last_name,department_id,profile_id) VALUES ('st1','1001','F','L','d1','u1')");
  run("INSERT INTO student_contacts(id,student_id,relationship,first_name,last_name) VALUES ('c1','st1','mother','M','L'), ('c2','st1','father','F','L')");
  // GoTrue must never be reached for our own tokens.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("unexpected network call"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("passwords and tokens", () => {
  it("pbkdf2 round-trips, rejects wrong passwords, and bcrypt hashes are flagged for rehash", async () => {
    const h = await hashPassword("secret");
    expect(h).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword("secret", h)).toEqual({ ok: true, needsRehash: false });
    expect((await verifyPassword("Secret", h)).ok).toBe(false);
    const b = bcrypt.hashSync("secret", 10).replace("$2b$", "$2a$"); // GoTrue writes $2a$
    expect(await verifyPassword("secret", b)).toEqual({ ok: true, needsRehash: true });
    expect((await verifyPassword("nope", b)).ok).toBe(false);
    expect((await verifyPassword("x", null)).ok).toBe(false);
    expect((await verifyPassword("x", "garbage")).ok).toBe(false);
  });

  it("access tokens verify only with the right key, unexpired and unmodified", async () => {
    const { token } = await signAccessToken(SECRET, { sub: "u1", sid: "s1" });
    expect(await verifyAccessToken(SECRET, token)).toMatchObject({ sub: "u1", sid: "s1", role: "authenticated", aud: "authenticated" });
    expect(await verifyAccessToken("other-secret", token)).toBeNull();
    const [h, p, s] = token.split(".");
    const forged = btoa(JSON.stringify({ ...JSON.parse(atob(p!.replace(/-/g, "+").replace(/_/g, "/"))), sub: "admin" })).replace(/=+$/, "");
    expect(await verifyAccessToken(SECRET, `${h}.${forged}.${s}`)).toBeNull();
    expect(await verifyAccessToken(SECRET, token, Date.now() + 3601_000)).toBeNull();
    expect(await verifyAccessToken(SECRET, "a.b")).toBeNull();
  });
});

describe("POST /auth/login", () => {
  it("signs a student in and returns the post-login data in the same response", async () => {
    const r = await login("1001", "pw-one");
    expect(r.status).toBe(200);
    const b = await json(r);
    expect(b).toMatchObject({ token_type: "bearer", expires_in: 3600, user: { id: "u1", email: "1001@students.helix.internal" } });
    expect(b.bootstrap).toMatchObject({ roles: ["student"], contact_count: 2, profile: { id: "u1" }, student: { id: "st1", student_code: "1001" } });
    const claims = await verifyAccessToken(SECRET, b.access_token);
    expect(claims?.sub).toBe("u1");
    expect(get<{ n: number }>("SELECT count(*) n FROM sessions WHERE user_id = 'u1'").n).toBe(1);
    expect(get<{ t: string | null }>("SELECT last_sign_in_at t FROM users WHERE id='u1'").t).not.toBeNull();
  });

  it("verifies a GoTrue bcrypt hash once, then stores a pbkdf2 hash and keeps working", async () => {
    expect((await login("1002", "pw-two")).status).toBe(200);
    expect(get<{ h: string }>("SELECT password_hash h FROM users WHERE id='u2'").h).toMatch(/^pbkdf2-sha256\$/);
    expect((await login("1002", "pw-two")).status).toBe(200);
    expect((await login("1002", "wrong")).status).toBe(400);
  });

  it("tries student, staff and literal email for non-student logins; student pages only the student identity", async () => {
    expect((await login("staff01", "pw-staff", false)).status).toBe(200);
    expect((await login("staff01", "pw-staff", true)).status).toBe(400);
  });

  it("gives one generic error for wrong password and unknown user; refuses banned users", async () => {
    const wrong = await login("1001", "bad");
    const unknown = await login("9999", "bad");
    expect(wrong.status).toBe(400);
    expect(await json(wrong)).toEqual(await json(unknown));
    expect((await json(await login("1003", "pw-three"))).error.code).toBe("user_banned");
    expect((await post("/auth/login", { loginId: "", password: "x" })).status).toBe(400);
    expect((await post("/auth/login", { loginId: 5, password: {} })).status).toBe(400);
    expect(get<{ n: number }>("SELECT count(*) n FROM sessions").n).toBe(0);
  });

  it("is unavailable (503) rather than insecure when the signing key is missing", async () => {
    delete env.AUTH_JWT_SECRET;
    expect((await login("1001", "pw-one")).status).toBe(503);
  });

  it("our token opens the data API without calling GoTrue", async () => {
    const b = await json(await login("1001", "pw-one"));
    const q = await worker.fetch(new Request("https://w.test/q", { method: "POST", headers: { authorization: `Bearer ${b.access_token}` },
      body: JSON.stringify({ table: "students", columns: ["id"], filters: [], ors: [], order: [] }) }), env);
    expect((await json(q)).data).toEqual([{ id: "st1" }]);
  });
});

describe("refresh and logout", () => {
  it("rotates the refresh token and keeps the session id", async () => {
    const a = await json(await login("1001", "pw-one"));
    const r1 = await json(await post("/auth/refresh", { refresh_token: a.refresh_token }));
    expect(r1.refresh_token).not.toBe(a.refresh_token);
    expect((await verifyAccessToken(SECRET, r1.access_token))?.sid).toBe((await verifyAccessToken(SECRET, a.access_token))?.sid);
    // the previous token still works inside the reuse window (two tabs racing)...
    expect((await post("/auth/refresh", { refresh_token: a.refresh_token })).status).toBe(200);
  });

  it("reuse of a rotated token after the window is treated as theft: the whole session dies", async () => {
    const a = await json(await login("1001", "pw-one"));
    const r1 = await json(await post("/auth/refresh", { refresh_token: a.refresh_token }));
    run("UPDATE sessions SET rotated_at = '2000-01-01T00:00:00.000Z'");
    expect((await post("/auth/refresh", { refresh_token: a.refresh_token })).status).toBe(400);
    expect(get<{ r: string | null }>("SELECT revoked_at r FROM sessions").r).not.toBeNull();
    expect((await post("/auth/refresh", { refresh_token: r1.refresh_token })).status).toBe(400); // the legitimate holder is out too
  });

  it("rejects unknown tokens and banned users", async () => {
    expect((await post("/auth/refresh", { refresh_token: "nope" })).status).toBe(400);
    const a = await json(await login("1001", "pw-one"));
    run("UPDATE users SET banned_until = '2999-01-01T00:00:00.000Z' WHERE id = 'u1'");
    expect((await post("/auth/refresh", { refresh_token: a.refresh_token })).status).toBe(400);
  });

  it("logout scopes: local, others, global", async () => {
    const [a, b, c] = [await json(await login("1001", "pw-one")), await json(await login("1001", "pw-one")), await json(await login("1001", "pw-one"))];
    const out = (who: { access_token: string }, scope: string) => post("/auth/logout", { scope }, { authorization: `Bearer ${who.access_token}` });
    const alive = () => get<{ n: number }>("SELECT count(*) n FROM sessions WHERE revoked_at IS NULL").n;
    expect(alive()).toBe(3);
    expect((await out(a, "local")).status).toBe(200);
    expect(alive()).toBe(2);
    await out(b, "others"); // keeps only b
    expect(alive()).toBe(1);
    expect((await post("/auth/refresh", { refresh_token: c.refresh_token })).status).toBe(400);
    expect((await post("/auth/refresh", { refresh_token: b.refresh_token })).status).toBe(200);
    await out(b, "global");
    expect(alive()).toBe(0);
    expect((await post("/auth/logout", { scope: "local" })).status).toBe(401);
    expect((await out(b, "bogus")).status).toBe(400);
  });
});
