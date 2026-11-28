// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";
import { sign, validPath, verify } from "./lib";

/** Minimal in-memory R2: just the calls the worker makes. */
function fakeR2() {
  const m = new Map<string, { body: ArrayBuffer; type: string }>();
  const obj = (k: string) => {
    const o = m.get(k);
    if (!o) return null;
    return {
      httpEtag: `"${k.length}-${o.body.byteLength}"`,
      body: new Blob([o.body]).stream(),
      writeHttpMetadata: (h: Headers) => h.set("content-type", o.type),
    };
  };
  return {
    m,
    head: async (k: string) => obj(k),
    get: async (k: string) => obj(k),
    put: async (k: string, body: ReadableStream, o: { httpMetadata: { contentType: string } }) => {
      m.set(k, { body: await new Response(body).arrayBuffer(), type: o.httpMetadata.contentType });
    },
    delete: async (ks: string[]) => ks.forEach((k) => m.delete(k)),
  };
}

const mkEnv = () => {
  const r2 = fakeR2();
  const env = { FILES: r2, SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "anon", SIGNING_SECRET: "s3cret", ALLOWED_ORIGINS: "https://app.test" } as unknown as Env;
  return { r2, env };
};

/** Pretends to be Supabase's r2_authz: allow only the listed `bucket/name:op` triples. */
function allow(...ok: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string);
      return Response.json(ok.includes(`${b.p_bucket}/${b.p_name}:${b.p_op}`));
    }),
  );
}

const call = (env: Env, path: string, init?: RequestInit) => worker.fetch(new Request(`https://w.test${path}`, init), env);
const auth = { authorization: "Bearer jwt" };

afterEach(() => vi.unstubAllGlobals());

describe("lib", () => {
  it("validPath rejects traversal and empty segments", () => {
    expect(validPath("a/b.png")).toBe(true);
    for (const p of ["", "../x", "a/../b", "a//b", "/a", "a/", "a\\b", "a\nb"]) expect(validPath(p)).toBe(false);
  });

  it("signatures bind bucket, path, expiry and download name", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = await sign("k", "b", "p/x.pdf", exp, "n.pdf");
    expect(await verify("k", "b", "p/x.pdf", exp, "n.pdf", sig)).toBe(true);
    expect(await verify("k", "b", "p/y.pdf", exp, "n.pdf", sig)).toBe(false);
    expect(await verify("k", "b", "p/x.pdf", exp, "", sig)).toBe(false);
    expect(await verify("other", "b", "p/x.pdf", exp, "n.pdf", sig)).toBe(false);
    const past = Math.floor(Date.now() / 1000) - 1;
    expect(await verify("k", "b", "p", past, "", await sign("k", "b", "p", past))).toBe(false);
    expect(await verify("k", "b", "p", exp, "", "not-base64!!")).toBe(false);
  });
});

describe("files worker", () => {
  it("uploads, serves public objects without auth, and honours ETag", async () => {
    const { env } = mkEnv();
    allow("avatars/u1:write");
    const put = await call(env, "/o/avatars/u1", { method: "PUT", headers: { ...auth, "content-type": "image/jpeg", "content-length": "3", "x-upsert": "true" }, body: new Uint8Array([1, 2, 3]) });
    expect(put.status).toBe(200);
    const get = await call(env, "/o/avatars/u1");
    expect(get.status).toBe(200);
    expect([...new Uint8Array(await get.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(get.headers.get("content-type")).toBe("image/jpeg");
    const again = await call(env, "/o/avatars/u1", { headers: { "if-none-match": get.headers.get("etag")! } });
    expect(again.status).toBe(304);
  });

  it("refuses unauthorised, oversize, wrong-type and duplicate uploads", async () => {
    const { env } = mkEnv();
    const up = (bucket: string, path: string, type: string, len: number, extra: Record<string, string> = {}) =>
      call(env, `/o/${bucket}/${path}`, { method: "PUT", headers: { ...auth, "content-type": type, "content-length": String(len), ...extra }, body: new Uint8Array(len) });
    allow();
    expect((await up("banners", "u", "image/png", 3)).status).toBe(403);
    allow("banners/u:write", "tuition-invoices/s/a.pdf:write", "leave-attachments/u/a.png:write");
    expect((await up("banners", "u", "image/png", 6 * 1024 * 1024)).status).toBe(413);
    expect((await up("tuition-invoices", "s/a.pdf", "image/png", 3)).status).toBe(415);
    expect((await up("leave-attachments", "u/a.png", "image/png", 3)).status).toBe(200);
    expect((await up("leave-attachments", "u/a.png", "image/png", 3)).status).toBe(409);
    // x-upsert is ignored for buckets that never had an UPDATE policy
    expect((await up("leave-attachments", "u/a.png", "image/png", 3, { "x-upsert": "true" })).status).toBe(409);
    const noJwt = await call(env, "/o/banners/u", { method: "PUT", headers: { "content-type": "image/png", "content-length": "3" }, body: new Uint8Array(3) });
    expect(noJwt.status).toBe(401);
  });

  it("serves private objects only through a signed link that authz granted", async () => {
    const { env, r2 } = mkEnv();
    r2.m.set("card-slips/s1/a.png", { body: new Uint8Array([9]).buffer, type: "image/png" });
    expect((await call(env, "/o/card-slips/s1/a.png")).status).toBe(403);

    allow();
    const denied = await call(env, "/sign", { method: "POST", headers: auth, body: JSON.stringify({ bucket: "card-slips", path: "s1/a.png", expiresIn: 60 }) });
    expect(denied.status).toBe(403);

    allow("card-slips/s1/a.png:read");
    const ok = await call(env, "/sign", { method: "POST", headers: auth, body: JSON.stringify({ bucket: "card-slips", path: "s1/a.png", expiresIn: 60 }) });
    const { signedUrl } = (await ok.json()) as { signedUrl: string };
    const u = new URL(signedUrl);
    const res = await call(env, u.pathname + u.search);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // tampering with the path or the signature fails
    expect((await call(env, `/o/card-slips/s1/b.png${u.search}`)).status).toBe(403);
    expect((await call(env, u.pathname + u.search.replace(/sig=./, "sig=X"))).status).toBe(403);
    // an allowed path whose object does not exist is a 404, like Supabase
    allow("card-slips/s1/none.png:read");
    expect((await call(env, "/sign", { method: "POST", headers: auth, body: JSON.stringify({ bucket: "card-slips", path: "s1/none.png", expiresIn: 60 }) })).status).toBe(404);
  });

  it("removes only the paths authz allows", async () => {
    const { env, r2 } = mkEnv();
    r2.m.set("banners/me", { body: new ArrayBuffer(1), type: "image/png" });
    r2.m.set("banners/you", { body: new ArrayBuffer(1), type: "image/png" });
    allow("banners/me:delete");
    const res = await call(env, "/remove", { method: "POST", headers: auth, body: JSON.stringify({ bucket: "banners", paths: ["me", "you"] }) });
    expect(await res.json()).toEqual({ deleted: ["me"] });
    expect([...r2.m.keys()]).toEqual(["banners/you"]);
  });

  it("forces html/svg downloads and sets CORS only for allowed origins", async () => {
    const { env, r2 } = mkEnv();
    r2.m.set("school-assets/x.svg", { body: new ArrayBuffer(1), type: "image/svg+xml" });
    const res = await call(env, "/o/school-assets/x.svg", { headers: { origin: "https://app.test" } });
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.test");
    const evil = await call(env, "/o/school-assets/x.svg", { headers: { origin: "https://evil.test" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects unknown buckets and traversal", async () => {
    const { env } = mkEnv();
    expect((await call(env, "/o/subject-documents/x")).status).toBe(404);
    // the URL parser already resolves %2e%2e, so the worker never sees a ".." that reaches R2
    expect([400, 404]).toContain((await call(env, "/o/avatars/a/%2e%2e/b")).status);
    expect((await call(env, "/o/avatars/a%2F..%2Fb")).status).toBe(400);
  });
});
