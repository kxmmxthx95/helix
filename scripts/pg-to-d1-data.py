#!/usr/bin/env python3
"""Copies the live (linked) Supabase `public` data + auth.users ids into a fresh SQLite file shaped like worker/d1/schema.sql.

    python3 scripts/pg-to-d1-data.py /path/to/helix-shadow.sqlite

Read-only against Postgres. Converts per worker/d1/columns.json (written by pg-to-d1.py): timestamps -> UTC ISO-8601 with ms + Z,
booleans -> 0/1, json/arrays -> JSON text, money -> integer satang. Password hashes are NOT copied (phase 5 does that deliberately).
Then verifies: row count per table, money totals, foreign keys, integrity. The output file holds real personal data: keep it out of git.
"""
import json, re, sqlite3, subprocess, sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

D1 = Path(__file__).resolve().parent.parent / "worker" / "d1"
manifest = {t: [c for c in cols if not c.get("gen")] for t, cols in json.loads((D1 / "columns.json").read_text()).items()}  # generated columns are computed by SQLite
PAGE, GROUP_ROWS = 1000, 3000


def q(sql: str):
    p = subprocess.run(["supabase", "db", "query", "--linked", sql], capture_output=True, text=True, stdin=subprocess.DEVNULL)
    t = p.stdout + p.stderr
    try:
        return json.loads(t[t.index("{"): t.rindex("}") + 1], parse_float=Decimal)["rows"]
    except Exception:
        sys.exit(f"query failed:\n{t[:600]}")


def ts(v):
    v = re.sub(r"([+-]\d\d)$", r"\1:00", v.replace(" ", "T"))  # plain-text timestamptz ends in "+00"
    v = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], v)  # fromisoformat wants 3 or 6 fractional digits
    d = datetime.fromisoformat(v).astimezone(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"


def conv(kind, v):
    if v is None: return None
    if kind == "ts": return ts(v)
    if kind == "bool": return 1 if v else 0
    if kind == "json": return json.dumps(v, separators=(",", ":"), default=float, ensure_ascii=False)
    if kind == "money": return int((Decimal(v) * 100).to_integral_value())
    if kind == "real": return float(v)
    return v


def main(out: str):
    out_p = Path(out)
    out_p.unlink(missing_ok=True)
    db = sqlite3.connect(out)
    db.executescript((D1 / "schema.sql").read_text())
    db.execute("pragma foreign_keys=off")

    tables = list(manifest)
    counts = {r["t"]: int(r["n"]) for r in q(" union all ".join(f"select '{t}' t, count(*) n from public.{t}" for t in tables))}

    def load(t, rows):
        cols = manifest[t]
        db.executemany(f"insert into {t} ({','.join(c['col'] for c in cols)}) values ({','.join('?' * len(cols))})",
                       [[conv(c["kind"], r.get(c["col"])) for c in cols] for r in rows])

    def select_json(t):
        return ", ".join(f'"{c["col"]}"' for c in manifest[t])

    # users (ids/emails only)
    users = q("select id, email, banned_until, last_sign_in_at, created_at from auth.users")
    db.executemany("insert into users(id,email,banned_until,last_sign_in_at,created_at) values (?,?,?,?,?)",
                   [(u["id"], u["email"], conv("ts", u["banned_until"]), conv("ts", u["last_sign_in_at"]), conv("ts", u["created_at"])) for u in users])

    # big tables page alone; the rest are grouped so one CLI call covers many tables
    big = [t for t in tables if counts[t] > PAGE]
    small = [t for t in tables if 0 < counts[t] <= PAGE]
    for t in big:
        # keep each response ~300 KB of row data: JSON overhead makes big pages unreadable for the CLI
        avg = int(q(f"select coalesce(avg(pg_column_size(x)),100)::int a from public.{t} x")[0]["a"])
        page = max(20, min(PAGE, 300_000 // max(avg, 1)))
        for off in range(0, counts[t], page):
            j = q(f"select coalesce(json_agg(x),'[]'::json) j from (select {select_json(t)} from public.{t} order by ctid limit {page} offset {off}) x")[0]["j"]
            load(t, j)
        print(f"  {t}: {counts[t]}", flush=True)
    group, rows_in_group = [], 0
    for t in small + [None]:
        if t is None or rows_in_group + counts[t] > GROUP_ROWS:
            if group:
                parts = ", ".join(f"'{g}', (select coalesce(json_agg(x),'[]'::json) from (select {select_json(g)} from public.{g} order by ctid) x)" for g in group)
                res = q(f"select json_build_object({parts}) j")[0]["j"]
                for g in group: load(g, res[g])
                print(f"  group of {len(group)} tables / {rows_in_group} rows", flush=True)
            group, rows_in_group = [], 0
        if t: group.append(t); rows_in_group += counts[t]
    db.commit()

    # ---- verification
    bad = []
    for t in tables:
        n = db.execute(f"select count(*) from {t}").fetchone()[0]
        if n != counts[t]: bad.append(f"count {t}: postgres {counts[t]} sqlite {n}")
    for t, cols in manifest.items():
        for c in cols:
            if c["kind"] != "money": continue
            pg = q(f"select coalesce(sum({c['col']}),0) s from public.{t}")[0]["s"]
            lite = db.execute(f"select coalesce(sum({c['col']}),0) from {t}").fetchone()[0]
            if int(Decimal(pg) * 100) != lite: bad.append(f"money sum {t}.{c['col']}: postgres {pg} baht, sqlite {lite} satang")
    fk = db.execute("pragma foreign_key_check").fetchall()
    for tbl, _, parent, _ in fk[:20]: bad.append(f"FK violation in {tbl} -> {parent}")
    if len(fk) > 20: bad.append(f"... {len(fk)} FK violations total")
    ic = db.execute("pragma integrity_check").fetchone()[0]
    if ic != "ok": bad.append(f"integrity_check: {ic}")
    total = sum(counts.values())
    print(f"loaded {len(tables)} tables, {total} rows, {len(users)} users -> {out} ({out_p.stat().st_size // 1024} KB)")
    print("VERIFIED: counts, money totals, foreign keys, integrity all match" if not bad else "PROBLEMS:\n  " + "\n  ".join(bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
