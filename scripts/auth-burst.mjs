#!/usr/bin/env node
// Fires N simultaneous logins at the API worker's /auth/login, twice: first against GoTrue-style bcrypt hashes (every user's first
// login), then against the PBKDF2 hashes the first round left behind. Users are synthetic rows in the SHADOW D1 and are removed after.
//   API_URL=https://helix-files.<you>.workers.dev node scripts/auth-burst.mjs [N=200]
// Compare with scripts/login-burst.mjs (Supabase Auth: ~13 logins/s, a 200-student class takes ~15 s).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = process.env.API_URL;
if (!API) throw new Error("set API_URL");
const N = Number(process.argv[2] ?? 200);
const worker = new URL("../worker", import.meta.url).pathname;
const bcrypt = createRequire(join(worker, "package.json"))("bcryptjs");
const d1 = (arg) => execFileSync("npx", ["wrangler", "d1", "execute", "helix-shadow", "--remote", "-y", ...arg], { cwd: worker, stdio: ["ignore", "pipe", "pipe"] });

const password = "burst-" + Math.random().toString(36).slice(2, 10);
const hash = bcrypt.hashSync(password, 10); // same cost as GoTrue's
const uids = Array.from({ length: N }, (_, i) => `loadtest-${String(i).padStart(4, "0")}`);
const ids = uids.map((u) => u.replace("loadtest-", "zz")); // login ids; "zz…" cannot collide with real student codes
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];

async function round(label) {
  const t0 = performance.now();
  const res = await Promise.all(ids.map(async (id) => {
    const t = performance.now();
    try {
      const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: id, password, studentOnly: true }) });
      const text = await r.text();
      let code = "";
      try { code = JSON.parse(text).error?.code ?? ""; } catch { code = (/<title>([^<]*)<\/title>/.exec(text)?.[1] ?? "").trim() + " | " + (/[Ee]rror code:?\s*(\d+)/.exec(text)?.[1] ?? text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90)); } // a non-JSON body is the platform talking
      return { ms: Math.round(performance.now() - t), status: r.status, code };
    } catch (e) { return { ms: Math.round(performance.now() - t), status: 0, code: String(e.cause?.code ?? e.message) }; }
  }));
  const ms = res.map((r) => r.ms).sort((a, b) => a - b);
  const by = {};
  for (const r of res) { const k = `${r.status}${r.code ? " " + r.code : ""}`; by[k] = (by[k] ?? 0) + 1; }
  console.log(`${label}: ${N} logins in ${Math.round(performance.now() - t0)} ms total | p50 ${pct(ms, 50)}  p95 ${pct(ms, 95)}  max ${ms.at(-1)} ms | ${JSON.stringify(by)}`);
}

const dir = mkdtempSync(join(tmpdir(), "authburst-"));
try {
  const file = join(dir, "users.sql");
  writeFileSync(file, uids.map((u, i) => `INSERT INTO users(id,email,password_hash) VALUES ('${u}','${ids[i]}@students.helix.internal','${hash}');`).join("\n"));
  d1(["--file", file]);
  console.log(`${N} synthetic users inserted (bcrypt cost 10)`);
  await round("round 1, first login (bcrypt verify + rehash)");
  await round("round 2, steady state (pbkdf2)             ");
} finally {
  try { d1(["--command", "DELETE FROM sessions WHERE user_id LIKE 'loadtest-%'; DELETE FROM users WHERE id LIKE 'loadtest-%';"]); console.log("synthetic users and sessions removed"); }
  catch { console.log("CLEANUP FAILED: delete users with id LIKE 'loadtest-%' from the shadow D1"); }
  rmSync(dir, { recursive: true, force: true });
}
