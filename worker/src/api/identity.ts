import { ApiFailure } from "./manifest";
import type { Ctx } from "./policy";

interface IdentityEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const cache = new Map<string, { uid: string; exp: number }>();

/**
 * Interim (shadow mode): the session is still a Supabase Auth JWT, so GoTrue validates it for us (cached 30 s per isolate).
 * Phase 5 replaces this function with local verification of our own token; nothing else here changes.
 */
export async function authenticate(req: Request, env: IdentityEnv): Promise<string> {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new ApiFailure(401, "PGRST301", "missing bearer token");
  const token = m[1]!;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.uid;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiFailure(401, "PGRST301", "invalid or expired session");
  const uid = ((await res.json()) as { id?: string }).id;
  if (!uid) throw new ApiFailure(401, "PGRST301", "invalid session");
  if (cache.size > 500) cache.clear();
  cache.set(token, { uid, exp: Date.now() + 30_000 });
  return uid;
}

/** The three facts every policy needs, in one D1 round trip. */
export async function loadCtx(db: D1Database, uid: string): Promise<Ctx> {
  const [roles, prof, stu] = await db.batch<Record<string, string>>([
    db.prepare("SELECT role FROM profile_roles WHERE profile_id = ?").bind(uid),
    db.prepare("SELECT department_id FROM profiles WHERE id = ?").bind(uid),
    db.prepare("SELECT id FROM students WHERE profile_id = ?").bind(uid),
  ]);
  return {
    uid,
    roles: new Set(roles!.results.map((r) => r.role!)),
    dept: prof!.results[0]?.department_id ?? null,
    studentId: stu!.results[0]?.id ?? null,
  };
}
