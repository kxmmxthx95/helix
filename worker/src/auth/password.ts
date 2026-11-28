import bcrypt from "bcryptjs";
import { b64url, fromB64url } from "../lib";

/**
 * New hashes: PBKDF2-SHA256, 100k iterations (the Workers WebCrypto maximum), ~8 ms of CPU.
 * Imported GoTrue hashes are bcrypt ($2a$10$…, ~50 ms in bcryptjs): verified once, then replaced by a PBKDF2 hash (`needsRehash`).
 */
const ITER = 100_000;
const enc = new TextEncoder();

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITER}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, ITER))}`;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/** A well-formed hash nobody knows the password of: unknown users cost the same as wrong passwords. */
export const DUMMY_HASH = `pbkdf2-sha256$${ITER}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export async function verifyPassword(password: string, stored: string | null): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith("pbkdf2-sha256$")) {
    const [, iter, salt, hash] = stored.split("$");
    const got = await pbkdf2(password, fromB64url(salt!), Number(iter));
    return { ok: equal(got, fromB64url(hash!)), needsRehash: Number(iter) < ITER };
  }
  if (/^\$2[aby]\$/.test(stored)) {
    // compareSync: the async variant yields through timers, pointless inside one request.
    let ok = false;
    try {
      ok = bcrypt.compareSync(password, stored);
    } catch {
      /* malformed hash = no match */
    }
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
}
