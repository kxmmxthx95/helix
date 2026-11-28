import { ApiFailure } from "./api/manifest";
import { errorBody, handleSelect } from "./api/query";
import { BUCKETS, DEFAULT_MAX_BYTES, sign, validPath, verify } from "./lib";

export interface Env {
  FILES: R2Bucket;
  /** D1 shadow/primary database. Absent until it is created and bound in wrangler.jsonc. */
  DB?: D1Database;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SIGNING_SECRET: string;
  /** Comma-separated browser origins allowed to call the API. */
  ALLOWED_ORIGINS: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const key = (bucket: string, path: string) => `${bucket}/${path}`;

/** Asks Supabase (the caller's JWT, so RLS applies) whether the caller may do `op`. Phase 4/5 replaces this with local checks. */
async function can(env: Env, jwt: string, bucket: string, path: string, op: "read" | "write" | "delete"): Promise<boolean> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/r2_authz`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ p_bucket: bucket, p_name: path, p_op: op }),
  });
  if (res.status === 401) throw new HttpError(401, "invalid or expired session");
  return res.ok && (await res.json()) === true;
}

function bearer(req: Request): string {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new HttpError(401, "missing bearer token");
  return m[1]!;
}

/** `/o/<bucket>/<path…>` → validated parts. */
function parseObject(url: URL) {
  const rest = url.pathname.slice("/o/".length);
  const slash = rest.indexOf("/");
  if (slash < 1) throw new HttpError(404, "not found");
  const bucket = rest.slice(0, slash);
  let path: string;
  try {
    path = rest
      .slice(slash + 1)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  } catch {
    throw new HttpError(400, "bad path");
  }
  const rule = BUCKETS[bucket];
  if (!rule) throw new HttpError(404, "unknown bucket");
  if (!validPath(path)) throw new HttpError(400, "bad path");
  return { bucket, path, rule };
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function readObject(req: Request, env: Env, url: URL): Promise<Response> {
  const { bucket, path, rule } = parseObject(url);
  const download = url.searchParams.get("download") ?? "";
  if (!rule.public) {
    const ok = await verify(env.SIGNING_SECRET, bucket, path, Number(url.searchParams.get("exp")), download, url.searchParams.get("sig") ?? "");
    if (!ok) throw new HttpError(403, "invalid or expired link");
  }
  const obj = req.method === "HEAD" ? await env.FILES.head(key(bucket, path)) : await env.FILES.get(key(bucket, path));
  if (!obj) throw new HttpError(404, "object not found");

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("cache-control", rule.public ? "public, max-age=3600" : "private, no-store");
  h.set("x-content-type-options", "nosniff");
  const type = h.get("content-type") ?? "";
  // Anything a browser could run as a page is served as a download, never inline.
  if (download || /^(text\/html|image\/svg)/.test(type)) {
    h.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download || path.split("/").pop()!)}`);
  }
  if (req.headers.get("if-none-match") === obj.httpEtag) return new Response(null, { status: 304, headers: h });
  return new Response("body" in obj ? (obj as R2ObjectBody).body : null, { headers: h });
}

async function upload(req: Request, env: Env, url: URL): Promise<Response> {
  const jwt = bearer(req);
  const { bucket, path, rule } = parseObject(url);
  const size = Number(req.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(411, "content-length required");
  if (size > (rule.maxBytes ?? DEFAULT_MAX_BYTES)) throw new HttpError(413, "file too large");
  const type = req.headers.get("content-type") ?? "application/octet-stream";
  if (rule.mimes && !rule.mimes.includes(type.split(";")[0]!.trim())) throw new HttpError(415, "file type not allowed");
  if (!(await can(env, jwt, bucket, path, "write"))) throw new HttpError(403, "not allowed");
  const upsert = rule.upsert === true && req.headers.get("x-upsert") === "true";
  if (!upsert && (await env.FILES.head(key(bucket, path)))) throw new HttpError(409, "The resource already exists");
  await env.FILES.put(key(bucket, path), req.body, { httpMetadata: { contentType: type } });
  return Response.json({ path });
}

async function remove(req: Request, env: Env): Promise<Response> {
  const jwt = bearer(req);
  const { bucket, paths } = (await req.json()) as { bucket: string; paths: string[] };
  if (!BUCKETS[bucket] || !Array.isArray(paths) || paths.length > 100) throw new HttpError(400, "bad request");
  const deleted: string[] = [];
  for (const p of paths) {
    if (typeof p === "string" && validPath(p) && (await can(env, jwt, bucket, p, "delete"))) deleted.push(p);
  }
  if (deleted.length) await env.FILES.delete(deleted.map((p) => key(bucket, p)));
  return Response.json({ deleted });
}

async function signUrl(req: Request, env: Env, url: URL): Promise<Response> {
  const jwt = bearer(req);
  const b = (await req.json()) as { bucket: string; path: string; expiresIn: number; download?: string };
  if (!BUCKETS[b.bucket] || !validPath(b.path)) throw new HttpError(400, "bad request");
  if (!(await can(env, jwt, b.bucket, b.path, "read"))) throw new HttpError(403, "not allowed");
  if (!(await env.FILES.head(key(b.bucket, b.path)))) throw new HttpError(404, "Object not found");
  const exp = Math.floor(Date.now() / 1000) + Math.min(Math.max(Math.floor(b.expiresIn) || 60, 1), 7 * 86400);
  const download = b.download ?? "";
  const sig = await sign(env.SIGNING_SECRET, b.bucket, b.path, exp, download);
  const qs = `exp=${exp}&sig=${sig}${download ? `&download=${encodeURIComponent(download)}` : ""}`;
  return Response.json({ signedUrl: `${url.origin}/o/${b.bucket}/${encodePath(b.path)}?${qs}` });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const cors = new Headers({ vary: "origin" });
    if (origin && env.ALLOWED_ORIGINS.split(",").includes(origin)) {
      cors.set("access-control-allow-origin", origin);
      cors.set("access-control-allow-methods", "GET,HEAD,PUT,POST,OPTIONS");
      cors.set("access-control-allow-headers", "authorization,content-type,x-upsert,if-none-match");
      cors.set("access-control-max-age", "86400");
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    let res: Response;
    try {
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/o/")) res = await readObject(req, env, url);
      else if (req.method === "PUT" && url.pathname.startsWith("/o/")) res = await upload(req, env, url);
      else if (req.method === "POST" && url.pathname === "/remove") res = await remove(req, env);
      else if (req.method === "POST" && url.pathname === "/sign") res = await signUrl(req, env, url);
      else if (req.method === "POST" && url.pathname === "/q") res = Response.json(await handleSelect(req, env));
      else throw new HttpError(404, "not found");
    } catch (e) {
      if (e instanceof ApiFailure) {
        res = Response.json(errorBody(e), { status: e.status });
        cors.forEach((v, k) => res.headers.set(k, v));
        return res;
      }
      if (!(e instanceof HttpError)) console.error(e);
      res = Response.json({ error: e instanceof HttpError ? e.message : "internal error" }, { status: e instanceof HttpError ? e.status : 500 });
    }
    cors.forEach((v, k) => res.headers.set(k, v));
    return res;
  },
};
