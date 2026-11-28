#!/usr/bin/env node
// Compares the API worker (D1) with Supabase PostgREST for the same query shapes, from this machine.
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… API_URL=https://helix-files.<you>.workers.dev node scripts/api-bench.mjs [runs=30]
// Needs the shadow D1 (binding DB in worker/wrangler.jsonc). Creates ONE throwaway Supabase user plus matching super_admin rows in
// the SHADOW D1 only (never in Postgres), and removes both at the end. PostgREST is called with the service role (RLS bypassed =
// the most favourable case for Supabase), the worker with the user's JWT and the full policy engine.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const { SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC, API_URL: API } = process.env;
if (!SB || !ANON || !SVC || !API) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, API_URL");
const runs = Number(process.argv[2] ?? 30);
const email = `bench-${randomBytes(4).toString("hex")}@staff.helix.internal`;
const password = randomBytes(12).toString("base64url");
const admin = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const d1 = (sql) => execFileSync("npx", ["wrangler", "d1", "execute", "helix-shadow", "--remote", "-y", "--command", sql], { cwd: new URL("../worker", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] });

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const fmt = (a) => { a = [...a].sort((x, y) => x - y); return `p50 ${pct(a, 50)}  p95 ${pct(a, 95)}  max ${a.at(-1)} ms`; };
let netErrors = 0;
// A dropped connection is retried (and counted) instead of aborting a 10-minute run.
const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 3 || !/fetch failed/.test(String(e))) throw e; netErrors++; await new Promise((r) => setTimeout(r, 500)); } } };
async function time(fn, n) { const out = []; for (let i = 0; i < 3; i++) await retry(fn); for (let i = 0; i < n; i++) { const t = performance.now(); await retry(fn); out.push(Math.round(performance.now() - t)); } return out; }

let uid;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130)); // finally{} does not run on a signal
try {
  const c = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) });
  if (!c.ok) throw new Error(`create user ${c.status}`);
  uid = (await c.json()).id;
  const login = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  const jwt = login.access_token;
  d1(`INSERT INTO users(id,email) VALUES ('${uid}','${email}'); INSERT INTO profiles(id,first_name,last_name) VALUES ('${uid}','bench','bench'); INSERT INTO profile_roles(profile_id,role) VALUES ('${uid}','super_admin');`);

  const base = { filters: [], ors: [], order: [] };
  const q = (b) => () => fetch(`${API}/q`, { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify({ ...base, ...b }) }).then(async (r) => { const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return { r, j }; });
  const pg = (path) => () => fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } }).then((r) => r.json());

  const cases = [
    ["login bootstrap (4 sequential queries)", async () => {
      await q({ table: "profiles", columns: "*", filters: [{ col: "id", op: "eq", val: uid }], single: "one" })();
      await q({ table: "profile_roles", columns: ["role"], filters: [{ col: "profile_id", op: "eq", val: uid }] })();
      await q({ table: "students", columns: "*", filters: [{ col: "profile_id", op: "eq", val: uid }], single: "maybe" })();
      await q({ table: "student_contacts", columns: ["id"], count: true, head: true, filters: [{ col: "student_id", op: "eq", val: uid }] })();
    }, async () => {
      await pg(`profiles?select=*&id=eq.${uid}`)(); await pg(`profile_roles?select=role&profile_id=eq.${uid}`)();
      await pg(`students?select=*&profile_id=eq.${uid}`)(); await pg(`student_contacts?select=id&student_id=eq.${uid}&limit=1`)();
    }],
    ["list 593 students (select *, order)", q({ table: "students", columns: "*", order: [{ col: "student_code", asc: true }] }), pg("students?select=*&order=student_code.asc")],
    ["list 604 profile_roles", q({ table: "profile_roles", columns: "*" }), pg("profile_roles?select=*")],
  ];
  console.log(`runs per case: ${runs} (+3 warm-up), sequential, from this machine\n`);
  for (const [name, w, p] of cases) {
    const a = await time(w, runs), b = await time(p, runs);
    console.log(`${name}\n   worker+D1 : ${fmt(a)}\n   PostgREST : ${fmt(b)}`);
  }
  const { r } = await retry(q({ table: "students", columns: ["id"], limit: 1 }));
  console.log(`\nworker stages for a 1-row query (Server-Timing): ${r.headers.get("server-timing")}`);
  console.log(`network errors retried: ${netErrors}`);
} finally {
  try { d1(`DELETE FROM profile_roles WHERE profile_id='${uid}'; DELETE FROM profiles WHERE id='${uid}'; DELETE FROM users WHERE id='${uid}';`); console.log("shadow rows removed"); } catch (e) { console.log("SHADOW CLEANUP FAILED for", uid); }
  if (uid) console.log("test user deleted:", (await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: admin })).status);
}
