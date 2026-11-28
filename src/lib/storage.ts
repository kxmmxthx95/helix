import { supabase } from "@/lib/supabase";

/**
 * Buckets served by the Cloudflare files-worker (VITE_R2_BUCKETS="avatars,banners,…").
 * Anything not listed — notably `subject-documents` — stays on Supabase Storage, so each bucket can be flipped
 * (and rolled back) on its own. Same four calls the app already makes, same result shapes.
 */
const base = (import.meta.env.VITE_STORAGE_URL as string | undefined)?.replace(/\/$/, "");
const r2Buckets = new Set(((import.meta.env.VITE_R2_BUCKETS as string | undefined) ?? "").split(",").map((s) => s.trim()).filter(Boolean));

type Err = { message: string };
/** Discriminated like supabase-js, so `if (error) throw error` narrows `data`. */
type Result<T> = { data: T; error: null } | { data: null; error: Err };
export interface BucketApi {
  upload(path: string, body: Blob | File, opts?: { upsert?: boolean; contentType?: string }): Promise<Result<{ path: string }>>;
  remove(paths: string[]): Promise<Result<unknown>>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  createSignedUrl(path: string, expiresIn: number, opts?: { download?: string | boolean }): Promise<Result<{ signedUrl: string }>>;
}

const objectUrl = (bucket: string, path: string) => `${base}/o/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

async function call<T>(res: Response): Promise<Result<T>> {
  if (res.ok) return { data: (await res.json()) as T, error: null };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { data: null, error: { message: body?.error ?? `storage error ${res.status}` } };
}

function r2Bucket(bucket: string): BucketApi {
  return {
    async upload(path, body, opts) {
      const res = await fetch(objectUrl(bucket, path), {
        method: "PUT",
        headers: { ...(await authHeader()), "content-type": opts?.contentType ?? (body as File).type ?? "application/octet-stream", ...(opts?.upsert ? { "x-upsert": "true" } : {}) },
        body,
      });
      return call<{ path: string }>(res);
    },
    async remove(paths) {
      const res = await fetch(`${base}/remove`, { method: "POST", headers: { ...(await authHeader()), "content-type": "application/json" }, body: JSON.stringify({ bucket, paths }) });
      return call<{ deleted: string[] }>(res);
    },
    getPublicUrl: (path) => ({ data: { publicUrl: objectUrl(bucket, path) } }),
    async createSignedUrl(path, expiresIn, opts) {
      const download = typeof opts?.download === "string" ? opts.download : undefined;
      const res = await fetch(`${base}/sign`, { method: "POST", headers: { ...(await authHeader()), "content-type": "application/json" }, body: JSON.stringify({ bucket, path, expiresIn, download }) });
      return call<{ signedUrl: string }>(res);
    },
  };
}

export const storage = {
  from: (bucket: string): BucketApi => (base && r2Buckets.has(bucket) ? r2Bucket(bucket) : supabase.storage.from(bucket)),
};
