# Supabase → Cloudflare

Why: Supabase plan cost, and login CPU (bcrypt in GoTrue under a class-sized burst on the free nano compute).
Target cost ≈ **$5/mo** (Workers Paid; Pages, R2 ≤10 GB, D1/DO/Cron included).
Rule: every phase ships alone and can be rolled back, except the DB cutover (phase 6).

## Measured baseline (2026-11-28, Supabase free plan)

- Postgres 93 MB; 599 users (593 students). Biggest: `audit_logs` 20 MB / 27.7k rows (no retention yet).
- Storage ≈ 488 MB, of which `subject-documents` 442 MB (142 files). **Decision: `subject-documents` is NOT moved to R2.**
  Consequence: it stays on Supabase Storage until phase 7 — decide then whether to drop it or copy it.
- DB queries are cheap; the CPU spike is `signInWithPassword` (bcrypt) × concurrent students.

## Phases

| # | Work | Status |
|---|---|---|
| 0 | Inventory (below), wrangler config | done |
| 1 | Vercel → Cloudflare Pages (`public/_headers`, `public/_redirects`, `wrangler.jsonc`, `npm run deploy:cf`) | config ready, not deployed |
| 2 | Storage → R2, bucket by bucket (not `subject-documents`). Worker checks access, streams the object | todo |
| 3 | 10 Edge Functions → Workers; `pg_cron`/`pg_net` jobs → Cron Triggers | todo |
| 4 | Shadow D1 (nightly sync from Supabase) + Worker API + `supabase`-shaped client; port RPC/trigger/policy per domain; parity tests on real data, behind an env flag | todo |
| 5 | Auth in Worker: PBKDF2 (WebCrypto) for new hashes, lazy bcrypt verify → rehash for imported `auth.users` hashes (no forced reset); one `/login` call returns profile + roles + student; realtime via Durable Object | todo |
| 6 | **DB cutover** outside exam weeks: freeze writes → final sync → flip flag. Rollback = flip back + replay writes made since | todo |
| 7 | Supabase read-only 30 days → downgrade/delete | todo |

Already shipped toward the login problem: students wait a random 0–2 s before `signInWithPassword` (`AuthProvider.signIn`, `studentOnly`).

## Phase 1 deploy (first time)

```sh
npx wrangler pages project create helix --production-branch main   # once
npm run deploy:cf                                                    # build + upload dist/
```

Then: add the new origin (`https://helix.pages.dev` or the custom domain) to Supabase → Auth → URL Configuration
(Site URL / redirect list) and to any edge-function CORS allowlist. Point the domain at Pages only after a smoke test
of login, a POS sale (offline outbox) and PWA update on the `*.pages.dev` URL. `vercel.json` stays until DNS moves.

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
