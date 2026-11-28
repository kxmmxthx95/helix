#!/usr/bin/env python3
"""Turns the verified SQLite file from pg-to-d1-data.py into D1-importable SQL chunks (INSERTs only, FK-ordered).

    python3 scripts/sqlite-to-d1-sql.py helix-shadow.sqlite out_dir   # writes out_dir/NNN.sql, each < ~4 MB
    for f in out_dir/*.sql; do npx wrangler d1 execute helix-shadow --remote --file "$f" -y; done

Schema is loaded separately from worker/d1/schema.sql. Each chunk starts with PRAGMA defer_foreign_keys so order inside a
chunk never matters; tables are still ordered parents-first.
"""
import sqlite3, sys
from pathlib import Path

src, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for f in out.glob("*.sql"): f.unlink()
db = sqlite3.connect(src)
tables = [r[0] for r in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
deps = {t: {r[2] for r in db.execute(f"pragma foreign_key_list({t})") if r[2] != t} for t in tables}
order, left = [], set(tables)
while left:  # parents first; a cycle (none today) falls back to alphabetical
    ready = sorted(t for t in left if not (deps[t] & left)) or sorted(left)[:1]
    order += ready; left -= set(ready)

def lit(v):
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

CHUNK, STMT, n_files, buf, size = 4_000_000, 80_000, 0, [], 0
def flush():
    global n_files, buf, size
    if buf:
        n_files += 1
        (out / f"{n_files:03d}.sql").write_text("PRAGMA defer_foreign_keys = true;\n" + "\n".join(buf) + "\n")
        buf, size = [], 0
total = 0
for t in order:
    cols = [r[1] for r in db.execute(f"pragma table_xinfo({t})") if not r[6]]  # skip generated (hidden) columns
    head = f"INSERT INTO {t} ({', '.join(cols)}) VALUES\n"
    rows, rsize = [], 0
    def emit():
        global size
        if rows:
            s = head + ",\n".join(rows) + ";"
            buf.append(s); size += len(s)
            if size > CHUNK: flush()
    for row in db.execute(f"select {', '.join(cols)} from {t}"):
        r = "(" + ", ".join(lit(v) for v in row) + ")"
        if rows and (rsize + len(r) > STMT or len(rows) >= 50): emit(); rows, rsize = [], 0
        rows.append(r); rsize += len(r); total += 1
    emit()
flush()
print(f"{total} rows, {len(order)} tables -> {n_files} files in {out}")
