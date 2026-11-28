#!/usr/bin/env node
// Measures Supabase Auth password-login cost and queueing, with a throwaway user that is always deleted afterwards.
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/login-burst.mjs [burst=20] [jitterMs=0]
// Keep burst + 6 below the per-IP sign-in limit (30 / 5 min by default) or you measure the rate limiter, not the CPU.
import { randomBytes } from "node:crypto";

const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC } = process.env;
if (!URL_ || !ANON || !SVC) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
const burst = Number(process.argv[2] ?? 20);
const jitter = Number(process.argv[3] ?? 0);
const email = `loadtest-${randomBytes(4).toString("hex")}@students.helix.internal`;
const password = randomBytes(12).toString("base64url");
const admin = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const stats = (ms) => { const a = [...ms].sort((x, y) => x - y); return `min ${a[0]} p50 ${pct(a, 50)} p95 ${pct(a, 95)} max ${a.at(-1)} ms`; };

async function login() {
  const t = performance.now();
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await res.json().catch(() => ({}));
  return { ms: Math.round(performance.now() - t), status: res.status, code: body.error_code ?? body.msg ?? "" };
}

let userId;
try {
  const c = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) });
  if (!c.ok) throw new Error(`create user: ${c.status} ${await c.text()}`);
  userId = (await c.json()).id;
  console.log(`test user ${userId} created`);

  const rtt = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: ANON } }); rtt.push(Math.round(performance.now() - t)); }
  console.log(`round trip (health, no hashing): ${stats(rtt)}`);

  const seq = [];
  for (let i = 0; i < 6; i++) seq.push(await login());
  console.log(`6 sequential logins: ${stats(seq.map((r) => r.ms))}  statuses ${[...new Set(seq.map((r) => r.status))]}`);

  const results = await Promise.all(Array.from({ length: burst }, async () => { if (jitter) await new Promise((r) => setTimeout(r, Math.random() * jitter)); return login(); }));
  const by = {};
  for (const r of results) { const k = `${r.status}${r.code ? " " + r.code : ""}`; by[k] = (by[k] ?? 0) + 1; }
  console.log(`burst of ${burst}${jitter ? ` (random 0-${jitter} ms start)` : " (all at once)"}: ${stats(results.map((r) => r.ms))}`);
  console.log("statuses:", JSON.stringify(by));
} finally {
  if (userId) {
    const d = await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin });
    console.log(`test user deleted: ${d.status}`);
  }
}
