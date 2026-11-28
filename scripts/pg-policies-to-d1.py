#!/usr/bin/env python3
"""Translates the live Postgres RLS policies (public schema) into SQLite predicates for the D1 API.

    pip install sqlglot            # build-time only
    python3 scripts/pg-policies-to-d1.py        # -> worker/d1/policies.json + a report of what could not be translated

Every policy of role `authenticated`/`public` is parsed with sqlglot, the SQL-language helper functions it calls (is_org_wide(),
auth_department(), can_write_exam_session(p_id) ...) are INLINED as scalar subqueries (recursively), Postgres-isms are rewritten
(ANY(ARRAY[..]) -> IN, casts dropped, now()/current_date, AT TIME ZONE 'Asia/Bangkok'), and `auth.uid()` / the JWT session id become the
tokens __UID__ / __SID__ that the worker binds per request. Nothing is hand-edited: correctness is checked by
scripts/rls-diff.py, which compares the rows each policy lets through in Postgres and in SQLite for real users.
Read-only against Postgres.
"""
from __future__ import annotations

import json, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

import sqlglot
from sqlglot import exp

OUT = Path(__file__).resolve().parent.parent / "worker" / "d1" / "policies.json"
problems: list[str] = []


def q(sql):
    p = subprocess.run(["supabase", "db", "query", "--linked", sql], capture_output=True, text=True, stdin=subprocess.DEVNULL)
    t = p.stdout + p.stderr
    try:
        return json.loads(t[t.index("{"): t.rindex("}") + 1])["rows"]
    except Exception:
        sys.exit(f"query failed:\n{t[:600]}")


policies = q("select tablename t, policyname p, cmd, roles::text r, qual, with_check from pg_policies where schemaname='public' order by 1,2")
functions = q("""select p.proname n, l.lanname lang, pg_get_function_arguments(p.oid) args, pg_get_function_result(p.oid) res, p.prosrc src
  from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='public'::regnamespace and p.prokind='f'""")
fn = {f["n"]: f for f in functions if f["lang"] == "sql"}
fn_other = {f["n"] for f in functions if f["lang"] != "sql"}

TZ_BKK = "date('now','+7 hours')"
BUILTIN = {"coalesce", "exists", "lower", "upper", "length", "trim", "date", "strftime", "datetime", "abs", "min", "max", "count", "sum", "nullif", "json_each", "json_array_length", "substr", "ifnull", "julianday", "cast", "like", "glob", "typeof", "round", "replace", "instr", "random", "date_trunc", "extract", "row_number"}


def pre(text: str) -> str:
    """Text-level swaps for things the parser would treat as ordinary names."""
    text = re.sub(r"auth\.jwt\(\)\s*->>\s*'session_id'", "__SID__", text)
    text = re.sub(r"auth\.uid\(\)", "__UID__", text)
    # JOIN LATERAL (a student's newest classroom enrollment) has no SQLite form: same rows via a ROW_NUMBER() derived table.
    text = re.sub(
        r"join\s+lateral\s*\(\s*select\s+classroom_id(?:\s*,\s*academic_year)?\s+from\s+student_classroom_enrollments\s+sce\s+where\s+sce\.student_id\s*=\s*(\w+)\.id\s+order\s+by\s+sce\.created_at\s+desc\s+limit\s+1\s*\)\s*cur\s+on\s+true",
        r"join (select student_id, classroom_id, academic_year from (select sce.student_id, sce.classroom_id, sce.academic_year, "
        r"row_number() over (partition by sce.student_id order by sce.created_at desc) as rn from student_classroom_enrollments sce) where rn = 1) cur on cur.student_id = \1.id",
        text,
        flags=re.I,
    )
    return text


def parse_expr(text: str) -> exp.Expression:
    return sqlglot.parse_one(f"SELECT 1 WHERE {pre(text)}", read="postgres").args["where"].this


def params_of(f) -> list[str]:
    out = []
    for a in [x.strip() for x in f["args"].split(",") if x.strip()]:
        out.append(re.sub(r"^(IN |OUT |INOUT |VARIADIC )", "", a).split()[0])
    return out


_uid = [0]
OUTER = "__row"  # alias of the queried table in the API (worker/src/api/compile.ts)


def _sources(select: exp.Select):
    f = select.args.get("from_") or select.args.get("from")
    out = [f.this] if f is not None and f.this is not None else []
    out += [j.this for j in (select.args.get("joins") or []) if j.this is not None]
    return out


def rename(node: exp.Expression, env: dict, fresh: bool) -> None:
    """Scope-aware walk. fresh=True gives every table/derived table in the tree a unique alias (so an inlined helper body can never
    capture a name from the policy that calls it); fresh=False only remaps references to the outer table (env) and leaves shadowed names alone."""
    if isinstance(node, exp.Select):
        env = dict(env)
        for src in _sources(node):
            old = src.alias_or_name if isinstance(src, exp.Table) else (src.alias if isinstance(src, exp.Subquery) else "")
            if not old:
                continue
            if fresh:
                _uid[0] += 1
                new = f"{old}__h{_uid[0]}"
                src.set("alias", exp.TableAlias(this=exp.to_identifier(new)))
                env[old] = new
            else:
                env.pop(old, None)
    if isinstance(node, exp.Column) and node.table and node.table in env:
        node.set("table", exp.to_identifier(env[node.table]))
    for child in list(node.iter_expressions()):
        rename(child, env, fresh)


def scope_for(n: exp.Expression, default: str) -> str | None:
    """Table (or alias) that a bare column in `n` belongs to: the nearest enclosing SELECT's only FROM table, else the policy table."""
    a = n.parent
    while a is not None:
        if isinstance(a, exp.Select) and a.args.get("from_") or isinstance(a, exp.Select) and a.args.get("from"):
            tabs = list(a.find_all(exp.Table))
            direct = [t for t in tabs if t.parent is a.args.get("from_") or t.parent is a.args.get("from") or isinstance(t.parent, exp.From)]
            if a.args.get("joins") or len(direct) != 1:
                return None
            return direct[0].alias_or_name
        a = a.parent
    return default


def qualify(arg: exp.Expression, scope: str | None, who: str) -> exp.Expression:
    def f(c):
        if isinstance(c, exp.Column) and not c.table and c.name not in ("__UID__", "__SID__"):
            if scope:
                return exp.column(c.name, table=scope)
            problems.append(f"bare column '{c.name}' passed to {who}() with no single table in scope")
        return c
    return arg.transform(f)


def inline(node: exp.Expression, default_scope: str, depth=0) -> exp.Expression:
    """Replace calls of SQL-language helpers by scalar subqueries built from their bodies."""
    if depth > 12:
        problems.append("inline depth exceeded (recursive helper?)")
        return node

    def rewrite(n):
        if isinstance(n, (exp.Anonymous, exp.Func)):
            name = (n.name or "").lower() if isinstance(n, exp.Anonymous) else n.sql_name().lower()
            args = list(n.expressions) if isinstance(n, exp.Anonymous) else [a for a in n.args.values() if isinstance(a, exp.Expression)]
            if isinstance(n, exp.Anonymous) and name in fn:
                f = fn[name]
                if f["res"].lower().startswith(("table", "setof")):
                    problems.append(f"set-returning helper not inlined: {name}")
                    return n
                body = sqlglot.parse_one(pre(f["src"]).strip().rstrip(";"), read="postgres")
                rename(body, {}, fresh=True)
                names = params_of(f)
                sc = scope_for(n, default_scope)
                args = [qualify(inline(a, default_scope, depth + 1), sc, name) for a in args]
                mapping = {nm: a for nm, a in zip(names, args)}

                def sub(c):
                    if isinstance(c, exp.Column) and not c.table and c.name in mapping:
                        return mapping[c.name].copy()
                    if isinstance(c, exp.Parameter) and c.name.isdigit() and int(c.name) <= len(args):  # $1
                        return args[int(c.name) - 1].copy()
                    return c
                body = body.transform(sub)
                return exp.Subquery(this=inline(body, default_scope, depth + 1))
            if isinstance(n, exp.Anonymous) and name in fn_other:
                problems.append(f"plpgsql helper (cannot inline): {name}")
        return n

    return node.transform(rewrite)


def _strip_parens(n):
    while isinstance(n, exp.Paren):
        n = n.this
    return n


def to_sqlite(node: exp.Expression) -> exp.Expression:
    def t(n):
        # x = ANY(ARRAY[..]) -> IN (..);  x <> ALL(ARRAY[..]) -> NOT IN (..)   (sqlglot parses ANY as Any but ALL as a plain function)
        if isinstance(n, exp.EQ) and isinstance(n.right, exp.Any) and isinstance(n.right.this, (exp.Array, exp.Tuple)):
            return exp.In(this=n.left, expressions=list(n.right.this.expressions))
        if isinstance(n, exp.NEQ) and isinstance(n.right, exp.Anonymous) and n.right.name.upper() == "ALL" and n.right.expressions and isinstance(n.right.expressions[0], exp.Array):
            return exp.Not(this=exp.In(this=n.left, expressions=list(n.right.expressions[0].expressions)))
        # now() AT TIME ZONE 'Asia/Bangkok'  (optionally ::date)
        if isinstance(n, exp.AtTimeZone):
            return sqlglot.parse_one("datetime('now','+7 hours')", read="sqlite")
        if isinstance(n, exp.Cast):
            to = n.to.sql().upper()
            inner = _strip_parens(n.this)
            if to == "DATE":
                if isinstance(inner, exp.AtTimeZone):
                    return sqlglot.parse_one("date('now','+7 hours')", read="sqlite")
                return exp.Anonymous(this="date", expressions=[inner])
            return n.this  # uuid/text/enum/int/numeric casts: SQLite is dynamically typed
        if isinstance(n, exp.CurrentTimestamp) or (isinstance(n, exp.Anonymous) and n.name.lower() == "now"):
            return sqlglot.parse_one("strftime('%Y-%m-%dT%H:%M:%fZ','now')", read="sqlite")
        if isinstance(n, exp.CurrentDate):
            return sqlglot.parse_one("date('now')", read="sqlite")
        if isinstance(n, exp.Extract):
            unit, src = str(n.this.name).upper(), n.expression
            if unit == "ISODOW":
                return sqlglot.parse_one(f"((CAST(strftime('%w', {src.sql(dialect='sqlite')}) AS INTEGER) + 6) % 7 + 1)", read="sqlite")
            if unit == "DOW":
                return sqlglot.parse_one(f"CAST(strftime('%w', {src.sql(dialect='sqlite')}) AS INTEGER)", read="sqlite")
            if unit == "YEAR":
                return sqlglot.parse_one(f"CAST(strftime('%Y', {src.sql(dialect='sqlite')}) AS INTEGER)", read="sqlite")
            problems.append(f"EXTRACT({unit}) not translated")
        return n
    return node.transform(t)


def settle(node: exp.Expression) -> exp.Expression:
    for _ in range(6):
        nxt = to_sqlite(node)
        if nxt.sql() == node.sql():
            break
        node = nxt
    return node


def render(node: exp.Expression) -> str:
    return node.sql(dialect="sqlite")


def translate(text: str, ctx: str, table: str):
    try:
        parsed = parse_expr(text)
        rename(parsed, {table: OUTER}, fresh=False)
        e = settle(inline(parsed, OUTER))
        s = render(e)
    except Exception as ex:  # parser limits: report, never guess
        problems.append(f"{ctx}: {type(ex).__name__}: {str(ex)[:120]}")
        return None
    for call in set(re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\(", s)):
        if call.lower() not in BUILTIN and call.lower() not in ("in", "and", "or", "not", "select", "from", "where", "on", "as", "when", "then", "else", "case", "is"):
            problems.append(f"{ctx}: unknown function {call}() in output")
    if re.search(r"::|\bANY\(|\bARRAY\b|\bILIKE\b|\bAT TIME ZONE\b|->>|\binterval\b", s, re.I):
        problems.append(f"{ctx}: postgres syntax left over: {s[:140]}")
    return s


tables: dict[str, dict] = defaultdict(lambda: {"select": [], "insert": [], "update_using": [], "update_check": [], "delete": []})
n_ok = n_bad = 0
for pol in policies:
    roles = pol["r"].strip("{}").split(",")
    if not ({"authenticated", "public"} & set(roles)):
        continue
    ctx = f"{pol['t']}.{pol['p']}"
    qual, chk, cmd = pol["qual"], pol["with_check"], pol["cmd"]
    using = translate(qual, ctx + " using", pol["t"]) if qual else None
    check = translate(chk, ctx + " check", pol["t"]) if chk else None
    if (qual and using is None) or (chk and check is None):
        n_bad += 1
        tables[pol["t"]].setdefault("untranslated", []).append(pol["p"])
        continue
    n_ok += 1
    t = tables[pol["t"]]
    entry = {"policy": pol["p"], "sql": None}
    if cmd in ("SELECT", "ALL") and using: t["select"].append({"policy": pol["p"], "sql": using})
    if cmd in ("DELETE", "ALL") and using: t["delete"].append({"policy": pol["p"], "sql": using})
    if cmd in ("UPDATE", "ALL"):
        if using: t["update_using"].append({"policy": pol["p"], "sql": using})
        if check or using: t["update_check"].append({"policy": pol["p"], "sql": check or using})
    if cmd in ("INSERT", "ALL"):
        if check or using: t["insert"].append({"policy": pol["p"], "sql": check or using})

OUT.write_text(json.dumps(tables, indent=1, ensure_ascii=False) + "\n")
print(f"wrote {OUT.name}: {n_ok} policies translated, {n_bad} NOT translated, {len(tables)} tables")
seen = set()
for p in problems:
    if p not in seen:
        seen.add(p)
        print("  -", p)
