#!/usr/bin/env python3
"""Differential test: for every translated RLS policy and a sample of real users, the rows a policy lets through must be the same in
Postgres (the original expression, evaluated with that user's JWT claims) and in SQLite (worker/d1/policies.json on the shadow copy).

    python3 scripts/rls-diff.py /path/to/helix-shadow.sqlite     # needs worker/d1/policies.json and `supabase` linked; read-only

Compares count + md5 of the primary keys per (user, policy, using|check). Prints mismatches and exits 1 if there are any.
"""
import hashlib, json, re, sqlite3, subprocess, sys
from pathlib import Path

D1 = Path(__file__).resolve().parent.parent / "worker" / "d1"
SID = "11111111-2222-3333-4444-555555555555"
policies = json.loads((D1 / "policies.json").read_text())
kinds = {t: {c["col"]: c["kind"] for c in cols} for t, cols in json.loads((D1 / "columns.json").read_text()).items()}


def q(sql, file=False):
    p = subprocess.run(["supabase", "db", "query", "--linked"] + (["-f", sql] if file else [sql]), capture_output=True, text=True, stdin=subprocess.DEVNULL)
    return p.stdout + p.stderr


def rows(sql):
    t = q(sql)
    try:
        return json.loads(t[t.index("{"): t.rindex("}") + 1])["rows"]
    except Exception:
        sys.exit("query failed:\n" + t[:500])


# --- the work list: (table, policy, kind, sqlite sql)
work = {}
for table, d in policies.items():
    for key, kind in (("select", "u"), ("delete", "u"), ("update_using", "u"), ("insert", "c"), ("update_check", "c")):
        for e in d.get(key, []):
            # the same Postgres expression can appear under several commands; compare each (policy, kind) once
            work.setdefault((table, e["policy"], kind), e["sql"])

users = rows("""
  (select distinct on (role) profile_id id, role::text tag from profile_roles order by role, profile_id)
  union all (select profile_id, 'student' from students where profile_id is not null order by profile_id limit 3)
  union all (select profile_id, 'student-b' from (select distinct on (department_id) profile_id from students where profile_id is not null order by department_id, profile_id) z limit 3)
  union all (select profile_id, 'teacher-x' from profile_roles where role = 'teacher' order by profile_id limit 4)
""")
seen, sample = set(), []
for u in users:
    if u["id"] not in seen:
        seen.add(u["id"]); sample.append(u)

pk = {r["t"]: r["cols"] for r in rows("""select c.relname t, string_agg(a.attname, ',' order by array_position(i.indkey::int2[], a.attnum)) cols
  from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey) where i.indisprimary and n.nspname = 'public' group by 1""")}


def pg_batch(batch):
    body = ["do $t$ declare u record; pol record; r record; out text := ''; begin", "  set local statement_timeout = '280s';"]
    ids = ", ".join(f"'{u['id']}'" for u in batch)
    body.append(f"  for u in select unnest(array[{ids}]::uuid[]) id loop")
    body.append(f"    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated', 'session_id', '{SID}')::text, true);")
    body.append("    perform set_config('request.jwt.claim.sub', u.id::text, true);")
    body.append("    for pol in select tablename t, policyname p, qual, with_check from pg_policies where schemaname='public' and (roles::text like '%authenticated%' or roles::text like '%public%') loop")
    for col, label in (("qual", "u"), ("with_check", "c")):
        body.append(f"      if pol.{col} is not null then")
        body.append("        begin")
        body.append(f"          execute format('select count(*) n, coalesce(md5(string_agg(%s, '','' order by %s collate \"C\")), '''') h from public.%I where (%s)', "
                    f"(select 'concat_ws(''|'',' || pk.cols || ')' from (select string_agg(quote_ident(a.attname)||'::text', ',' order by array_position(i.indkey::int2[], a.attnum)) cols from pg_index i join pg_class c on c.oid=i.indrelid join pg_attribute a on a.attrelid=c.oid and a.attnum=any(i.indkey) where i.indisprimary and c.relname=pol.t and c.relnamespace='public'::regnamespace) pk), "
                    f"(select 'concat_ws(''|'',' || pk.cols || ')' from (select string_agg(quote_ident(a.attname)||'::text', ',' order by array_position(i.indkey::int2[], a.attnum)) cols from pg_index i join pg_class c on c.oid=i.indrelid join pg_attribute a on a.attrelid=c.oid and a.attnum=any(i.indkey) where i.indisprimary and c.relname=pol.t and c.relnamespace='public'::regnamespace) pk), "
                    f"pol.t, pol.{col}) into r;")
        body.append(f"          out := out || format(E'%s|%s|%s|{label}|%s|%s\\n', u.id, pol.t, pol.p, r.n, r.h);")
        body.append(f"        exception when others then out := out || format(E'%s|%s|%s|{label}|ERR|%s\\n', u.id, pol.t, pol.p, replace(sqlerrm, '|', '/')); end;")
        body.append("      end if;")
    body.append("    end loop; end loop;")
    body.append("  raise exception E'RESULT\\n%', out; end $t$;")
    path = Path("/tmp/rls-diff-batch.sql")
    path.write_text("\n".join(body))
    t = q(str(path), file=True)
    if "RESULT" not in t:
        sys.exit("batch failed:\n" + t[:700])
    raw = t[t.index("RESULT") + 6:].replace("\\n", "\n").replace("\\", "")
    return [l.split("|") for l in raw.split("\n") if l.count("|") == 5]


def lite_eval(db, table, sql, uid):
    params = []
    def sub(m):
        params.append(uid if m.group(0) == "__UID__" else SID)
        return "?"
    s = re.sub(r"__UID__|__SID__", sub, sql)
    cols = pk[table].split(",")
    cur = db.execute(f"SELECT {', '.join(cols)} FROM {table} AS __row WHERE {s}", params)
    out = []
    for r in cur:
        out.append("|".join(("true" if v else "false") if kinds[table].get(c) == "bool" else ("" if v is None else str(v)) for c, v in zip(cols, r)))
    out.sort(key=lambda x: x.encode())
    return len(out), hashlib.md5(",".join(out).encode()).hexdigest() if out else ""


db = sqlite3.connect(sys.argv[1])
pg = {}
for i in range(0, len(sample), 2):
    for uid, t, p, kind, n, h in pg_batch(sample[i:i + 2]):
        pg[(uid, t, p, kind)] = (n, h)
print(f"{len(sample)} users, {len(work)} (policy, using|check) pairs, {len(pg)} Postgres evaluations")

bad, ok = [], 0
for u in sample:
    for (table, pol, kind), sql in work.items():
        want = pg.get((u["id"], table, pol, kind))
        if want is None:
            continue  # policy not evaluated in Postgres for this kind
        if want[0] == "ERR":
            bad.append((u["tag"], table, pol, kind, f"postgres error: {want[1][:80]}")); continue
        try:
            got = lite_eval(db, table, sql, u["id"])
        except Exception as e:
            bad.append((u["tag"], table, pol, kind, f"sqlite error: {str(e)[:100]}")); continue
        if (int(want[0]), want[1]) == got:
            ok += 1
        else:
            bad.append((u["tag"], table, pol, kind, f"postgres {want[0]} rows, sqlite {got[0]}"))
print(f"identical: {ok}   different: {len(bad)}")
by = {}
for tag, t, p, k, why in bad:
    by.setdefault((t, p, k, why.split(",")[0] if "error" in why else "rows"), []).append((tag, why))
for (t, p, k, _), v in sorted(by.items()):
    print(f"  {t}.{p} [{k}] x{len(v)}: {v[0][1]}  (e.g. {v[0][0]})")
sys.exit(1 if bad else 0)
