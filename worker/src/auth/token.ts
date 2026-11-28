import { b64url, fromB64url } from "../lib";

const enc = new TextEncoder();
const key = (secret: string, use: "sign" | "verify") => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [use]);
const part = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));

export const ACCESS_TTL_S = 3600;

export interface Claims {
  iss: "helix";
  sub: string;
  sid: string;
  role: "authenticated";
  aud: "authenticated";
  email?: string;
  iat: number;
  exp: number;
}

/** HS256 JWT. `sub` = user id and `sid` = session id, the two claims the database already reads (auth.uid(), _jwt_session()). */
export async function signAccessToken(
  secret: string,
  c: Omit<Claims, "iss" | "role" | "aud" | "iat" | "exp">,
  now = Date.now(),
): Promise<{ token: string; exp: number }> {
  const iat = Math.floor(now / 1000);
  const claims: Claims = { iss: "helix", role: "authenticated", aud: "authenticated", iat, exp: iat + ACCESS_TTL_S, ...c };
  const body = `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}`;
  const sig = await crypto.subtle.sign("HMAC", await key(secret, "sign"), enc.encode(body));
  return { token: `${body}.${b64url(sig)}`, exp: claims.exp };
}

/** Returns the claims of a valid, unexpired token we issued, else null. */
export async function verifyAccessToken(secret: string, token: string, now = Date.now()): Promise<Claims | null> {
  const p = token.split(".");
  if (p.length !== 3) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(secret, "verify"), fromB64url(p[2]!), enc.encode(`${p[0]}.${p[1]}`)))) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(p[1]!))) as Claims;
    return c.iss === "helix" && c.exp * 1000 > now ? c : null;
  } catch {
    return null;
  }
}
