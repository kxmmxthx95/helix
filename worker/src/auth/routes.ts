import { toApiRow } from "../api/convert";
import { ApiFailure } from "../api/manifest";
import { b64url } from "../lib";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";
import { ACCESS_TTL_S, signAccessToken, verifyAccessToken } from "./token";

export interface AuthEnv {
  DB?: D1Database;
  AUTH_JWT_SECRET?: string;
}

const enc = new TextEncoder();
const sha256 = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const newRefreshToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
/** A rotated refresh token still works for this long (two tabs racing); after that, its reuse means theft and kills the session. */
const REUSE_WINDOW_MS = 10_000;

function setup(env: AuthEnv): { db: D1Database; secret: string } {
  if (!env.DB || !env.AUTH_JWT_SECRET) throw new ApiFailure(503, "auth_unavailable", "auth is not configured");
  return { db: env.DB, secret: env.AUTH_JWT_SECRET };
}

async function body<T>(req: Request): Promise<Partial<T>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") throw new ApiFailure(400, "bad_json", "malformed request");
  return b as Partial<T>;
}

const session = async (secret: string, uid: string, sid: string, email: string, refresh: string) => {
  const { token, exp } = await signAccessToken(secret, { sub: uid, sid, email });
  return { access_token: token, refresh_token: refresh, token_type: "bearer", expires_in: ACCESS_TTL_S, expires_at: exp, user: { id: uid, email } };
};

/** Login ids as AuthProvider tries them: student code, staff code, or a literal email. Students-only pages send one candidate. */
const candidates = (id: string, studentOnly: boolean) => (studentOnly ? [`${id}@students.helix.internal`] : [`${id}@students.helix.internal`, `${id}@staff.helix.internal`, id]);

type UserRow = { id: string; email: string; password_hash: string | null; banned_until: string | null };

export async function login(req: Request, env: AuthEnv): Promise<Response> {
  const { db, secret } = setup(env);
  const b = await body<{ loginId: string; password: string; studentOnly: boolean }>(req);
  if (typeof b.loginId !== "string" || typeof b.password !== "string" || !b.loginId.trim() || b.loginId.length > 200 || b.password.length > 500) {
    throw new ApiFailure(400, "invalid_credentials", "Invalid login credentials");
  }
  const emails = candidates(b.loginId.trim(), b.studentOnly === true);
  const { results } = await db.prepare(`SELECT id, email, password_hash, banned_until FROM users WHERE email IN (${emails.map(() => "?").join(",")})`).bind(...emails).all<UserRow>();
  const user = emails.map((e) => results.find((r) => r.email === e)).find(Boolean);

  // Always one hash verification, so an unknown login id costs the same as a wrong password.
  const check = await verifyPassword(b.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !check.ok) throw new ApiFailure(400, "invalid_credentials", "Invalid login credentials");
  if (user.banned_until && user.banned_until > new Date().toISOString()) throw new ApiFailure(400, "user_banned", "User is banned");

  const sid = crypto.randomUUID();
  const refresh = newRefreshToken();
  const now = new Date().toISOString();
  const rehash = check.needsRehash ? await hashPassword(b.password) : null;
  const [, , profile, roles, student, contacts] = await db.batch<Record<string, unknown>>([
    db.prepare("INSERT INTO sessions (id, user_id, refresh_hash, last_used_at, user_agent) VALUES (?, ?, ?, ?, ?)").bind(sid, user.id, await sha256(refresh), now, (req.headers.get("user-agent") ?? "").slice(0, 200)),
    db.prepare("UPDATE users SET last_sign_in_at = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?").bind(now, rehash, user.id),
    db.prepare("SELECT * FROM profiles WHERE id = ?").bind(user.id),
    db.prepare("SELECT role FROM profile_roles WHERE profile_id = ?").bind(user.id),
    db.prepare("SELECT * FROM students WHERE profile_id = ?").bind(user.id),
    db.prepare("SELECT COUNT(*) AS c FROM student_contacts WHERE student_id = (SELECT id FROM students WHERE profile_id = ?)").bind(user.id),
  ]);
  return Response.json(
    {
      ...(await session(secret, user.id, sid, user.email, refresh)),
      // Everything the app reads right after sign-in, in the same response (was 4 more round trips).
      bootstrap: {
        profile: profile!.results[0] ? toApiRow("profiles", profile!.results[0]) : null,
        roles: roles!.results.map((r) => r.role),
        student: student!.results[0] ? toApiRow("students", student!.results[0]) : null,
        contact_count: Number(contacts!.results[0]?.c ?? 0),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

type SessionRow = { id: string; user_id: string; refresh_hash: string; prev_refresh_hash: string | null; rotated_at: string | null; revoked_at: string | null; email: string; banned_until: string | null };

export async function refresh(req: Request, env: AuthEnv): Promise<Response> {
  const { db, secret } = setup(env);
  const { refresh_token } = await body<{ refresh_token: string }>(req);
  if (typeof refresh_token !== "string" || refresh_token.length > 200) throw new ApiFailure(400, "invalid_grant", "Invalid Refresh Token");
  const h = await sha256(refresh_token);
  const row = await db
    .prepare("SELECT s.id, s.user_id, s.refresh_hash, s.prev_refresh_hash, s.rotated_at, s.revoked_at, u.email, u.banned_until FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.refresh_hash = ? OR s.prev_refresh_hash = ?")
    .bind(h, h)
    .first<SessionRow>();
  if (!row || row.revoked_at) throw new ApiFailure(400, "invalid_grant", "Invalid Refresh Token");
  const now = new Date();
  if (row.banned_until && row.banned_until > now.toISOString()) throw new ApiFailure(400, "user_banned", "User is banned");

  if (row.refresh_hash !== h) {
    // A rotated-away token: fine inside the reuse window, theft outside it.
    const age = row.rotated_at ? now.getTime() - Date.parse(row.rotated_at) : Infinity;
    if (age > REUSE_WINDOW_MS) {
      await db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(now.toISOString(), row.id).run();
      throw new ApiFailure(400, "invalid_grant", "Invalid Refresh Token");
    }
  }
  const next = newRefreshToken();
  await db
    .prepare("UPDATE sessions SET prev_refresh_hash = refresh_hash, refresh_hash = ?, rotated_at = ?, last_used_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(await sha256(next), now.toISOString(), now.toISOString(), row.id)
    .run();
  return Response.json(await session(secret, row.user_id, row.id, row.email, next), { headers: { "cache-control": "no-store" } });
}

/** scope: "local" (this session), "others" (every other session of this user), "global" (all). Same meanings as supabase.auth.signOut. */
export async function logout(req: Request, env: AuthEnv): Promise<Response> {
  const { db, secret } = setup(env);
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  const claims = m ? await verifyAccessToken(secret, m[1]!) : null;
  if (!claims) throw new ApiFailure(401, "bad_jwt", "invalid or expired session");
  const { scope = "local" } = await body<{ scope: string }>(req);
  const now = new Date().toISOString();
  const [sql, params] =
    scope === "others" ? ["UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL", [now, claims.sub, claims.sid]]
    : scope === "global" ? ["UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", [now, claims.sub]]
    : scope === "local" ? ["UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [now, claims.sid]]
    : (() => { throw new ApiFailure(400, "bad_scope", "scope must be local, others or global"); })();
  await db.prepare(sql).bind(...params).run();
  return Response.json({ ok: true });
}
