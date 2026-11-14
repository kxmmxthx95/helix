# Backup (Supabase free plan)

`.github/workflows/backup.yml` runs nightly (02:17 Bangkok) and on demand (Actions → backup → Run workflow).

| What | Where in the R2 bucket | Kept |
| --- | --- | --- |
| DB dump (`public`, `auth`, `storage` metadata), `age`-encrypted | `db/daily/`, `db/weekly/` (Sundays), `db/monthly/` (1st) | 14 days / 8 weeks / 12 months |
| Storage files (every bucket), incremental | `storage/<bucket>/…` | current |
| Files deleted or overwritten in Storage | `storage-old/<date>/…` | 30 days |

It also pings the API (keeps the free project from pausing after 7 idle days) and LINE-pushes you when the
backup fails or the DB / Storage passes 80% of the free limits (400 MB / 800 MB).

Not in the dump: `vault` secrets (`line_notify_cron_secret`), Edge Function secrets, Auth settings — re-create from the dashboard.

## One-time setup

Already done (2026-11-14): R2 bucket `helix-backup`; `age` key pair (private key `~/helix-backup.key` — copy it to a
password manager and keep it offline, without it the backups cannot be opened); Postgres role `backup_ro`
(`bypassrls` + `pg_read_all_data`, so it can dump everything and write nothing; connects through the **session pooler**
because GitHub runners are IPv4-only); GitHub secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`,
`AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `LINE_USER_ID`. The dump → encrypt → restore round trip was tested locally.

Still manual (needs a dashboard — no CLI can mint these):

1. **R2 API token**: Cloudflare → R2 → Manage API tokens → Create, *Object Read & Write*, limited to bucket `helix-backup`.
   `gh secret set R2_ACCESS_KEY_ID` and `gh secret set R2_SECRET_ACCESS_KEY` (paste when prompted).
2. **Supabase Storage S3 key**: Dashboard → Storage → S3 Connection → New access key.
   `gh secret set SB_S3_ACCESS_KEY_ID` and `gh secret set SB_S3_SECRET_ACCESS_KEY`.
3. **LINE bot token** (the one `line-notify` uses; Supabase only shows its hash): `gh secret set LINE_CHANNEL_ACCESS_TOKEN`.

Then run the workflow once by hand (Actions → backup → Run workflow) and check `db/daily/` in the bucket.
Until step 1–3 are done the nightly run fails (GitHub emails the failure).

## Restore

```sh
rclone copyto r2:BUCKET/db/daily/db-YYYY-MM-DD.dump.age db.dump.age   # rclone configured with the R2 keys
age -d -i backup.key -o db.dump db.dump.age
# into a NEW Supabase project (or local Postgres 17); extra "already exists" errors for auth/storage are normal:
pg_restore --no-owner --no-privileges --clean --if-exists -d "$NEW_DB_URL" db.dump
rclone sync r2:BUCKET/storage sbnew:   # sbnew = the new project's Storage S3 endpoint
```

Restore into a scratch project once to prove the backup works, and repeat after big schema changes.
