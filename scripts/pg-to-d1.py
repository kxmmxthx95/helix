#!/usr/bin/env python3
"""Reads the live (linked) Supabase `public` schema and writes SQLite/D1 DDL.

    python3 scripts/pg-to-d1.py            # -> worker/d1/schema.sql  (+ prints a report of everything it could not translate)

Read-only against Postgres (pg_catalog queries through `supabase db query --linked`). Re-run any time the schema changes;
nothing here is hand-edited. Decisions (docs/cloudflare-migration.md, phase 4):
  uuid/text/enum/jsonb/arrays/timestamps -> TEXT (ISO-8601 UTC, JSON), boolean -> INTEGER 0/1, enum -> CHECK (... IN (...)),
  now()/gen_random_uuid() defaults -> SQLite expressions, auth.users -> our own `users`. numeric stays NUMERIC and is
  REPORTED: money must become integer satang when the card/POS/tuition code is ported (REAL drifts).
"""
import json, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "worker" / "d1" / "schema.sql"
report: list[str] = []


def q(sql: str):
    p = subprocess.run(["supabase", "db", "query", "--linked", sql], capture_output=True, text=True, stdin=subprocess.DEVNULL)
    t = p.stdout + p.stderr
    try:
        return json.loads(t[t.index("{"): t.rindex("}") + 1])["rows"]
    except Exception:
        sys.exit(f"query failed:\n{t[:800]}")


tables = [r["t"] for r in q("select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1")]
cols = q("""select c.relname t, a.attname col, format_type(a.atttypid,a.atttypmod) typ, t.typtype ttype, a.attnotnull nn,
  pg_get_expr(d.adbin,d.adrelid) def, a.attgenerated gen
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname, a.attnum""")
cons = q("""select c.relname t, con.conname name, con.contype ctype, pg_get_constraintdef(con.oid) def
  from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 1,2""")
idxs = q("select tablename t, indexname name, indexdef def from pg_indexes where schemaname='public' order by 1,2")
enums = {r["name"]: r["vals"] for r in q("select t.typname name, array_agg(e.enumlabel order by e.enumsortorder) vals from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by 1")}
views = {r["viewname"]: r["definition"] for r in q("select viewname, definition from pg_views where schemaname='public'")}

NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
UUID4 = "(lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))))"
CAST = re.compile(r"::(?:double precision|[a-z_]+(?: (?:with(?:out)? time zone|varying))?)(?:\(\d+(?:,\d+)?\))?(?:\[\])?")


def expr(e: str) -> str:
    """Postgres boolean/scalar expression -> SQLite (the subset the schema actually uses)."""
    e = re.sub(r"(\w+) = ANY \(ARRAY\[(.*?)\]\)", r"\1 IN (\2)", e)
    e = CAST.sub("", e).replace("public.", "")
    e = e.replace("char_length(", "length(").replace("btrim(", "trim(")
    e = re.sub(r"cardinality\(([^()]*)\)", r"json_array_length(\1)", e)
    e = re.sub(r"array_length\(([^(),]*), 1\)", r"json_array_length(\1)", e)
    # `col ~ '^LIT[0-9]{n,}$'` -> GLOB (can't say "digits only after n"; slightly weaker than the Postgres check)
    def rx(m):
        report.append(f"regex check weakened to GLOB: {m.group(0)}")
        return f"{m.group(1)} GLOB '{m.group(2)}" + "[0-9]" * int(m.group(3)) + "*'"
    e = re.sub(r"(\w+) ~ '\^([^\[\]$]*)\[0-9\]\{(\d+),\}\$'", rx, e)
    return e


def sqltype(c):
    t, base = c["typ"], re.sub(r"\(.*\)", "", c["typ"])
    if t.endswith("[]") or base in ("jsonb", "json"): return "TEXT"
    if c["ttype"] == "e" or base in ("uuid", "text", "character varying", "citext", "date", "time without time zone", "timestamp with time zone", "timestamp without time zone"): return "TEXT"
    if base in ("integer", "smallint", "bigint", "boolean"): return "INTEGER"
    if base == "double precision": return "REAL"
    if base == "numeric": return "NUMERIC"
    report.append(f"unmapped type {c['t']}.{c['col']}: {t}")
    return "TEXT"


def default(c):
    d, base = c["def"], re.sub(r"\(.*\)", "", c["typ"])
    if d is None: return ""
    if d == "now()": return f" DEFAULT {NOW}"
    if d == "CURRENT_DATE": return " DEFAULT (date('now'))"
    if d == "gen_random_uuid()": return f" DEFAULT {UUID4}"
    if d in ("true", "false"): return f" DEFAULT {1 if d == 'true' else 0}"
    if "nextval(" in d or "auth.uid()" in d:
        report.append(f"default set app-side: {c['t']}.{c['col']} = {d}")
        return ""
    if re.fullmatch(r"-?\d+(\.\d+)?", d): return f" DEFAULT {d}"
    m = re.fullmatch(r"'(.*)'::(?:[a-z_ ]+)(\[\])?", d)
    if m:
        v = m.group(1)
        if m.group(2) or c["typ"].endswith("[]"): return " DEFAULT '[]'" if v == "{}" else f" DEFAULT '{v}'"
        return f" DEFAULT '{v}'"
    report.append(f"default NOT translated: {c['t']}.{c['col']} = {d}")
    return ""


by_table = defaultdict(list)
for c in cols: by_table[c["t"]].append(c)
cons_by = defaultdict(list)
for k in cons: cons_by[k["t"]].append(k)
backed = {k["name"] for k in cons if k["ctype"] in ("p", "u")}  # indexes created by a constraint

ddl = ["-- GENERATED by scripts/pg-to-d1.py from the live Supabase schema. Do not edit; re-run the script.",
       "-- Our own auth table (phase 5 fills it from auth.users). profiles.id references it.",
       f"CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, banned_until TEXT, last_sign_in_at TEXT, created_at TEXT NOT NULL DEFAULT {NOW});", ""]
money = []
for t in tables:
    lines, pk = [], next((k for k in cons_by[t] if k["ctype"] == "p"), None)
    pk_cols = re.findall(r"\((.*)\)", pk["def"])[0].split(", ") if pk else []
    for c in by_table[t]:
        ty = sqltype(c)
        if ty == "NUMERIC": money.append(f"{t}.{c['col']} {c['typ']}")
        if c["gen"]:
            m = re.fullmatch(r"\(\((\w+) - (\w+)\) \+ 1\)", c["def"])
            if m: lines.append(f"  {c['col']} INTEGER GENERATED ALWAYS AS (CAST(julianday({m.group(1)}) - julianday({m.group(2)}) + 1 AS INTEGER)) VIRTUAL")
            else:
                report.append(f"generated column NOT translated: {t}.{c['col']} = {c['def']}")
            continue
        if pk_cols == [c["col"]] and ty == "INTEGER" and c["def"] and "nextval" in c["def"]:
            lines.append(f"  {c['col']} INTEGER PRIMARY KEY AUTOINCREMENT"); pk_cols = []; continue
        s = f"  {c['col']} {ty}" + ("" if not c["nn"] else " NOT NULL") + default(c)
        if c["typ"] == "boolean": s += f" CHECK ({c['col']} IN (0,1))"
        if c["ttype"] == "e": s += f" CHECK ({c['col']} IN ({', '.join(repr(v) for v in enums[c['typ']])}))"
        lines.append(s)
    if pk_cols: lines.append(f"  PRIMARY KEY ({', '.join(pk_cols)})")
    for k in cons_by[t]:
        d = k["def"]
        if k["ctype"] == "u":
            if "NULLS NOT DISTINCT" in d: report.append(f"UNIQUE NULLS NOT DISTINCT lost: {t}.{k['name']}")
            cols_ = re.search(r"\(.*\)", d).group(0)
            lines.append(f"  UNIQUE {cols_}")
        elif k["ctype"] == "f":
            d = re.sub(r" (NOT VALID|DEFERRABLE.*|MATCH \w+)", "", d.replace("public.", "").replace("auth.users", "users"))
            lines.append(f"  {d}")
        elif k["ctype"] == "c":
            lines.append(f"  CHECK {expr(d[len('CHECK '):])}")
        elif k["ctype"] != "p":
            report.append(f"constraint skipped ({k['ctype']}): {t}.{k['name']} {d[:80]}")
    ddl.append(f"CREATE TABLE {t} (\n" + ",\n".join(lines) + "\n);")

ddl.append("")
for i in idxs:
    if i["name"] in backed: continue
    m = re.fullmatch(r"CREATE (UNIQUE )?INDEX (\w+) ON public\.(\w+) USING btree \((.*?)\)(?: WHERE (.*))?", i["def"])
    if not m:
        report.append(f"index NOT translated: {i['name']} ({i['def'][i['def'].index('USING'):][:90]})")
        continue
    uq, name, t, cs, where = m.groups()
    ddl.append(f"CREATE {uq or ''}INDEX {name} ON {t} ({expr(cs)})" + (f" WHERE {expr(where)}" if where else "") + ";")

ddl.append("")
for v, d in views.items():
    body = expr(d.strip().rstrip(";"))
    if "(" in re.sub(r"\bCOALESCE\(|computed_grade_status\(", "", body) and "computed_grade_status" in body:
        report.append(f"view NOT translated (needs plpgsql port): {v}")
        continue
    ddl.append(f"CREATE VIEW {v} AS {body};")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(ddl) + "\n")
print(f"wrote {OUT.relative_to(Path.cwd()) if OUT.is_relative_to(Path.cwd()) else OUT}: {len(tables)} tables, {sum(1 for l in ddl if l.startswith('CREATE') and 'INDEX' in l)} indexes")
print(f"money-like NUMERIC columns ({len(money)}): " + "; ".join(money))
print("\n".join(["NOT TRANSLATED / DECISIONS NEEDED:"] + [f"  - {r}" for r in report]))
