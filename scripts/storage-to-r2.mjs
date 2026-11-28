#!/usr/bin/env node
// Copies Supabase Storage objects into the R2 bucket `helix-files` (key = <bucket>/<path>), one bucket at a time.
// Idempotent (overwrites). Run before flipping a bucket in VITE_R2_BUCKETS, and again after old app tabs have drained.
//   SUPABASE_URL=https://x.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/storage-to-r2.mjs avatars banners
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY } = process.env;
const R2_BUCKET = process.env.R2_BUCKET ?? "helix-files";
const buckets = process.argv.slice(2);
if (!SUPABASE_URL || !KEY || !buckets.length) throw new Error("usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/storage-to-r2.mjs <bucket>…");
if (buckets.includes("subject-documents")) throw new Error("subject-documents stays on Supabase");

const headers = { authorization: `Bearer ${KEY}`, apikey: KEY };
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

/** Recursively lists a bucket (the list API is one folder level at a time). */
async function* walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset }),
    });
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`);
    const rows = await res.json();
    for (const r of rows) {
      const path = prefix ? `${prefix}/${r.name}` : r.name;
      if (r.id === null) yield* walk(bucket, path); // folder
      else yield { path, type: r.metadata?.mimetype ?? "application/octet-stream" };
    }
    if (rows.length < 100) return;
  }
}

const tmp = mkdtempSync(join(tmpdir(), "r2copy-"));
let n = 0;
try {
  for (const bucket of buckets) {
    for await (const { path, type } of walk(bucket)) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${enc(path)}`, { headers });
      if (!res.ok) throw new Error(`download ${bucket}/${path}: ${res.status}`);
      const file = join(tmp, "obj");
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      execFileSync("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${bucket}/${path}`, "--file", file, "--content-type", type, "--remote"], { stdio: ["ignore", "ignore", "inherit"] });
      console.log(`${++n} ${bucket}/${path}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`copied ${n} objects`);
