import { verifyAccessToken } from "../auth/token";
import { ApiFailure } from "./manifest";
import type { Caller } from "./policy";

interface IdentityEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** When set, tokens issued by /auth/login are accepted (checked locally, no network). */
  AUTH_JWT_SECRET?: string;
}

const cache = new Map<string, { who: Caller; exp: number }>();

/**
 * Our own access tokens (phase 5) are verified locally. Anything else is treated as a Supabase Auth JWT and validated by GoTrue
 * (cached 30 s per isolate) until the cutover removes that path.
 */
export async function authenticate(req: Request, env: IdentityEnv): Promise<Caller> {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new ApiFailure(401, "PGRST301", "missing bearer token");
  const token = m[1]!;
  if (env.AUTH_JWT_SECRET) {
    const own = await verifyAccessToken(env.AUTH_JWT_SECRET, token);
    if (own) return { uid: own.sub, sid: own.sid };
  }
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.who;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiFailure(401, "PGRST301", "invalid or expired session");
  const uid = ((await res.json()) as { id?: string }).id;
  if (!uid) throw new ApiFailure(401, "PGRST301", "invalid session");
  // GoTrue has validated the token, so its payload can be read without re-verifying the signature.
  let sid: string | null = null;
  try { sid = (JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { session_id?: string }).session_id ?? null; } catch { /* no session claim */ }
  const who = { uid, sid };
  if (cache.size > 500) cache.clear();
  cache.set(token, { who, exp: Date.now() + 30_000 });
  return who;
}
