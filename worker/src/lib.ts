/** Mirrors storage.buckets on Supabase (checked 2026-11-28). `upsert`: buckets that had an UPDATE policy. */
export interface BucketRule {
  public: boolean;
  upsert?: boolean;
  maxBytes?: number;
  mimes?: string[];
}

const MB = 1024 * 1024;
const IMG = ["image/jpeg", "image/png", "image/webp"];

export const BUCKETS: Record<string, BucketRule> = {
  "assignment-attachments": { public: false },
  "assignment-submissions": { public: false },
  avatars: { public: true, upsert: true },
  banners: { public: true, upsert: true, maxBytes: 5 * MB, mimes: IMG },
  "card-slips": { public: false, maxBytes: 5 * MB, mimes: IMG },
  "employee-documents": { public: false },
  "exam-question-images": { public: true },
  "leave-attachments": { public: false },
  "pos-products": { public: true, upsert: true, maxBytes: 2 * MB, mimes: IMG },
  "school-assets": { public: true, upsert: true },
  "subject-covers": { public: true, upsert: true, maxBytes: 10 * MB, mimes: IMG },
  "tuition-invoices": { public: false, maxBytes: 10 * MB, mimes: ["application/pdf"] },
};

export const DEFAULT_MAX_BYTES = 50 * MB;

/** Object key inside a bucket: no empty / dot segments, no control chars, bounded length. */
export function validPath(p: string): boolean {
  if (!p || p.length > 900) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(p)) return false;
  return p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

const payload = (bucket: string, path: string, exp: number, download: string) => enc.encode(`${bucket}/${path}\n${exp}\n${download}`);

/** HMAC over bucket/path/expiry/download-name; binds the signature to exactly one object and filename. */
export async function sign(secret: string, bucket: string, path: string, exp: number, download = ""): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), payload(bucket, path, exp, download)));
}

export async function verify(secret: string, bucket: string, path: string, exp: number, download: string, sig: string): Promise<boolean> {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromB64url(sig), payload(bucket, path, exp, download));
  } catch {
    return false;
  }
}
