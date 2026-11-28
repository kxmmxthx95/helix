# Supabase → Cloudflare

Why: Supabase plan cost, and login CPU (bcrypt in GoTrue under a class-sized burst on the free nano compute).
Target cost ≈ **$5/mo** (Workers Paid; Pages, R2 ≤10 GB, D1/DO/Cron included).
Rule: every phase ships alone and can be rolled back, except the DB cutover (phase 6).

## Measured baseline (2026-11-28, Supabase free plan)

- Postgres 93 MB; 599 users (593 students). Biggest: `audit_logs` 20 MB / 27.7k rows (no retention yet).
- Storage ≈ 488 MB, of which `subject-documents` 442 MB (142 files). **Decision (final): `subject-documents` is NEVER moved to R2.**
  It stays on Supabase Storage, so the Supabase project is kept (downgrade to Free; 442 MB fits the 1 GB limit) — phase 7 is "shrink", not "delete".
  Open constraint for phase 5/6: its storage policies (`subject-documents` rows in `storage.objects`) use Supabase Auth JWTs and Postgres
  RLS helpers. Once login/DB leave Supabase, those two hooks (`useDocuments`, `useDocTasks`) need either a Supabase session kept alive for
  them or a Worker that checks access itself and reads the files with the service key. Decide at phase 5; nothing to do before.
- DB queries are cheap; the CPU spike is `signInWithPassword` (bcrypt) × concurrent students.

## Phases

| # | Work | Status |
|---|---|---|
| 0 | Inventory (below), wrangler config | done |
| 1 | Vercel → Cloudflare Workers static assets (`wrangler.jsonc`, `public/_headers`, `npm run deploy:cf`) | **deployed** at https://helix.adah.workers.dev; student login verified by hand there 2026-11-28 (single user; burst, POS offline and PWA update not tested). Vercel still serves production; DNS not moved |
| 2 | Storage → R2. **Parked (2026-11-28):** the user keeps `subject-documents`, `subject-covers` and all public buckets (`avatars banners exam-question-images pos-products school-assets`) on Supabase. Built + deployed (worker https://helix-files.adah.workers.dev, R2 `helix-files`, `r2_authz` 0237/0238, `src/lib/storage.ts`) but no bucket is flipped (`VITE_R2_BUCKETS` empty). Only the 6 private buckets (~25 MB) remain candidates; moving them saves almost nothing, so do it only if Supabase Storage is ever dropped | parked |
| 3 | ~~10 Edge Functions → Workers~~ **Folded into phase 4/5** (decided 2026-11-28): every function uses the service role, `auth.admin.*`, vault secrets or `pg_net` cron against Supabase, so porting them first means rewriting them again when auth/DB move; they save no money (invocations are inside the plan). `send-print-email` needs a new mail path anyway (nodemailer SMTP does not run on Workers) | merged |
| 4 | Shadow D1 + Worker API + `supabase`-shaped client; port RPC/trigger/policy per domain; parity tests on real data, behind an env flag. **4.1 done:** `scripts/pg-to-d1.py` → `worker/d1/schema.sql` (127 tables, 153 indexes, 2 views; loads in local D1). **4.2 done:** `scripts/pg-to-d1-data.py <file.sqlite>` copies all live data (127 tables, 96,694 rows, 599 users; 52 MB in SQLite vs 93 MB in Postgres) and verifies row counts, money totals, foreign keys and integrity — all match. **4.3 slice done (read-only, 4 tables):** `worker/src/api/` (`POST /q`: validated query descriptor → parameterised SQL on D1, deny-by-default policy map, 1000-row cap like PostgREST), `src/lib/db.ts` (supabase-js-shaped `from().select().eq()/in()/or()/order()/single()…`, nothing imports it yet). Policies ported: `profiles`, `profile_roles`, `students`, `student_contacts`; **parity-tested against Postgres RLS on real data (10 users × 4 tables, identical row sets)**. Not deployed: no remote D1 exists yet. Next: 4.4 per-domain ports (writes, embeds, more tables), remote shadow D1 + nightly sync | in progress |
| 5 | Auth in Worker: PBKDF2 (WebCrypto) for new hashes, lazy bcrypt verify → rehash for imported `auth.users` hashes (no forced reset); one `/login` call returns profile + roles + student; realtime via Durable Object | todo |
| 6 | **DB cutover** outside exam weeks: freeze writes → final sync → flip flag. Rollback = flip back + replay writes made since | todo |
| 7 | Supabase read-only 30 days → downgrade to Free (kept for `subject-documents` only) | todo |

## Login burst measurement (2026-11-28, Supabase free plan, `scripts/login-burst.mjs`, throwaway user, deleted after)

| | result |
|---|---|
| round trip, no hashing (`/auth/v1/health`) | p50 115 ms |
| one login, sequential | p50 166 ms → ≈ 50 ms of server work (bcrypt) |
| 20 logins at once | min 244 / p50 1540 / max 1637 ms, all 200 |

The server finishes ~1 login per 73 ms regardless of how many arrive: **~13 logins/s**, a single-core queue. A class of 200 therefore takes **~15 s to drain** (the last student
waits ~15 s; 504s once the proxy times out). A random start delay only moves the queue: it would need a window ≥ 15 s to help, and costs every lone login. The 0–2 s
stagger added in 6658d98 was therefore **removed**; the existing retry-with-jitter stays. The fix is capacity: auth hashing that scales out (phase 5: PBKDF2 in Workers runs
in parallel isolates, ~50 ms each, no shared queue) or a bigger Supabase compute in the meantime. Still unchecked: the per-IP sign-in rate limit (Dashboard → Authentication →
Rate Limits; default 30 / 5 min / IP) — a whole school behind one NAT address may hit it before CPU. The 26-call test did not trigger it.

## Phase 1 deploy

Pages now delegates to Workers, so the SPA is a Worker with static assets (`not_found_handling: single-page-application`, headers from `dist/_headers`).

```sh
npm run deploy:cf   # build + wrangler deploy; ~12 min the first time (148 MB, 416 files), later runs upload only changed files
```

Before pointing the real domain at it: add the origin to Supabase → Auth → URL Configuration and to `ALLOWED_ORIGINS` in `worker/wrangler.jsonc`;
smoke-test login, a POS sale (offline outbox) and the PWA update prompt on the workers.dev URL. `vercel.json` stays until DNS moves.

## Phase 4.1 findings (schema → D1)

Mechanical, no blockers: types (uuid/enum/jsonb/arrays/timestamptz → TEXT, boolean → 0/1, enums → CHECK), `now()`/`gen_random_uuid()` defaults, 2 generated
columns, 37 partial/unique indexes, 124 CHECKs, 250 FKs. Regenerate with `python3 scripts/pg-to-d1.py` (read-only against Postgres).
**Decided 2026-11-28: money = INTEGER satang (baht × 100)** — 11 columns (`card_settings.pin_threshold`, `card_slip_requests.amount/approved_amount`, `card_transactions.amount`,
`student_wallets.daily_limit`, `tuition_*.amount`, `salary_grades.min/max_salary`, `student_guardian_financials.monthly_income`); CHECK constants are scaled too. The API converts at the edge
(`worker/d1/columns.json` marks them `money`). Scores/points/credits stay REAL; the API rounds to 2 dp on write. Still to port/decide: 4 `default auth.uid()` + `pos_products.code` sequence → set in the API; FTS index `students_search_idx`
→ `LIKE` or FTS5; view `resolved_grade_status` needs `computed_grade_status()` ported; `pos_products.code` regex check weakened to GLOB.

## Phase 2 rollout (parked — see above) (one bucket at a time; flag off = no behaviour change)

How it works: the browser calls the files-worker with its Supabase JWT; the worker asks `r2_authz(bucket, path, op)` on Supabase
(caller's JWT, so RLS applies; branches are the old storage policies, verified against them for 11 users × all 460 objects, read + write)
and then reads/writes R2. Private files are opened through `/sign` → HMAC link (like Supabase signed URLs). Public buckets are served unauthenticated.

1–3. Done 2026-11-28: R2 bucket `helix-files`, `0237_r2_authz.sql` pushed, secrets set, worker deployed.
   New app origin → add to `ALLOWED_ORIGINS` in `worker/wrangler.jsonc`, then `cd worker && npx wrangler deploy`.
4. Copy a bucket: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/storage-to-r2.mjs avatars`
5. Set `VITE_STORAGE_URL=<worker url>` and add the bucket to `VITE_R2_BUCKETS`, deploy the app. Smoke test upload / view / (private) signed open.
6. After old tabs have drained (PWA update prompt), run step 4 again for that bucket to pick up files uploaded to Supabase in the gap.
7. Rollback = remove the bucket from `VITE_R2_BUCKETS` (files uploaded to R2 meanwhile need copying back).

Suggested order: `banners`, `school-assets`, `exam-question-images`, `avatars`, `pos-products` (public) → then the private ones
(`leave-attachments`, `tuition-invoices`, `card-slips`, `assignment-*`, `employee-documents`). Not done: HTTP Range for large PDFs.

## Inventory

**Client usage:** 61 files import `lib/supabase`; `.from()` 611, `.rpc()` 74 (71 distinct), `.auth.*` 12, storage 45, realtime 1
(`useCardTopup` → `card_transactions`), `functions.invoke` 8. Query shapes: 49 embedded joins, 7 `.or`, 80 `.in`, 122 `.order`, 18 `.upsert`.

**DB:** 236 migrations, ~17.9k lines; 384 RLS policies (+83 on `storage.objects`), 418 functions (327 `security definer`), 238 triggers.
RLS is built from ~15 reused predicates — port these, then a per-table map:
`is_org_wide` (235 uses), `can_manage` (148), `can_write_exam_session` (54), `can_pos` (31), `can_manage_hr` (28), `can_manage_users`,
`can_manage_academic`, `can_write_teaching_assignment`, `can_write_exam_subject`, `can_read_exam_session`, `can_write_bank_row`,
`can_manage_hr_of`, `can_write_practice_subject`, `my_student_id`, … (full list: `grep -ohE "\b(is_org_wide|can_[a-z_]+|my_[a-z_]+)\(" supabase/migrations/*.sql | sort | uniq -c | sort -rn`).

**RPCs called from the client (71):**
- exam: `add_exam_session_room add_exam_special_seat approve_exam_takeover claim_exam_attempt decide_exam_topic_set exam_attempt_paper exam_review_key exam_room_conflict_seats exam_seating_status grant_exam_retake revoke_exam_topic_set_approval save_exam_answers save_exam_scan set_exam_attempt_manual_score set_exam_session_seats set_exam_special_seat submit_exam_attempt submit_exam_topic_set submit_no_exam_set unlock_exam_code verify_exam_code`
- practice: `practice_check save_practice_answer submit_practice_attempt`
- card / POS (money — port last, with Durable Object or single conditional statements): `card_* (26)`, `pos_* (9)`
- attendance / HR: `attendance_duties clear_staff_attendance_override my_attendance_covers set_staff_attendance_override staff_attendance_status handover_teaching_assignments`
- docs / plans / misc: `review_doc_file review_doc_task_file set_plan_link save_push_subscription set_line_notifications_enabled keep_other_sessions my_card_students`

**Edge Functions (10):** `delete-user generate-exam-question invite-user line-notify line-webhook pos-pin reset-password send-print-email sync-holidays update-user-phone`.
Secrets: `GMAIL_USER GMAIL_APP_PASSWORD GROQ_API_KEY LINE_CHANNEL_ACCESS_TOKEN LINE_CHANNEL_SECRET POS_PIN_SECRET VAPID_*`.
They use `auth.admin.{createUser,deleteUser,getUserById,updateUserById}` — these move with auth (phase 5). Deps: `web-push`, `nodemailer` (needs `nodejs_compat`, or swap for an HTTP mail API).

**Cron (pg_cron):** `exam-auto-submit` (every minute), `auto-clock-out` (*/5), `employee-end-dates` (17:05 UTC), `purge-cron-history`; plus the `net.http_post` jobs that call `line-notify`.

**Buckets in use:** `avatars banners card-slips employee-documents pos-products school-assets subject-covers` (+ `subject-documents`, `tuition-invoices`, `exam-question-images`, `leave-attachments` in the DB).

## D1 constraints to design around

- No interactive transactions (only `db.batch`). The ~55 `FOR UPDATE` paths (POS wallet, exam submit, seat fill) become one conditional SQL statement, or run inside a Durable Object.
- ~100 bound parameters per query → chunk long `.in()` lists.
- Types: 27 enums, jsonb (265 mentions), arrays (62) → TEXT/JSON; `timestamptz` → ISO text.
- Free Workers CPU is 10 ms/request: password hashing needs Workers Paid.

## Security finding (2026-11-28, existing Supabase RLS — not caused by this migration)

A logged-in `student` could read, through the public REST API, other students' data. Measured as a real student of a 181-student department:
`students` 181 rows (national_id, date of birth, chronic_disease, drug_allergy, address, coordinates, phone) and `student_contacts` 336 rows (every parent's phone/email/address);
no column privileges restricted it. **Fixed 2026-11-28 by migration 0239** (students/contacts: own rows only for the `student` role; staff, guardians, covers unchanged —
checked for 10 users before applying, live result identical to the tested one). The D1 policy engine mirrors it.

**Still open (decision needed):** the same audit shows a student can read ALL rows of `attendance_records` (2,814), `period_attendance_records` (12,721),
`student_item_scores` (851 — every student's scores), `student_leave_requests` (165), `behavior_records` (11), `student_cohort_enrollments`, and the department's `profiles`
(185 rows incl. staff national_id/phone/email/line_user_id), plus partial views of exam/document tables. Each needs a policy review so the app's own screens keep working;
the new API is deny-by-default, so they get stricter policies when ported (phase 4.4) — or fix them in Postgres first.
