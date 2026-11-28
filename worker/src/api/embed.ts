import relations from "../../d1/relations.json";
import { predSql, where, type Sql } from "./compile";
import { ApiFailure, columnKind, tableColumns, type Kind } from "./manifest";
import type { Caller } from "./policy";
import { selectPredicate } from "./policy";
import type { Embed } from "./protocol";

/**
 * Embedded selects, the PostgREST subset the app uses: `alias:table!fk_column!inner(cols, nested(...))`, `table(count)`, filters on embedded
 * columns. Each embed becomes a correlated scalar subquery that builds JSON (many-to-one = object or null, one-to-many = array), always
 * restricted by the embedded table's own SELECT policy, as PostgREST does.
 */
type Rel = { name: string; table: string; cols: string[]; ref: string; refCols: string[] };
const RELS = relations as Rel[];
const q = (id: string) => `"${id}"`;

/** Same JSON shapes as to_jsonb(): booleans true/false, JSON columns nested, money in baht. */
export function jsonValue(kind: Kind, ref: string): string {
  if (kind === "bool") return `CASE WHEN ${ref} IS NULL THEN NULL WHEN ${ref} THEN json('true') ELSE json('false') END`;
  if (kind === "json") return `CASE WHEN ${ref} IS NULL THEN NULL ELSE json(${ref}) END`;
  if (kind === "money") return `(${ref} / 100.0)`;
  return ref;
}

interface Link {
  kind: "one" | "many";
  /** SQL equality between the embedded table (child alias) and the parent alias */
  cond: (child: string, parent: string) => string;
}

function link(parent: string, e: Embed): Link {
  const one = RELS.filter((r) => r.table === parent && r.ref === e.table).map((r) => ({ kind: "one" as const, r }));
  const many = RELS.filter((r) => r.table === e.table && r.ref === parent).map((r) => ({ kind: "many" as const, r }));
  let c = [...one, ...many];
  if (e.hint) c = c.filter((x) => x.r.name === e.hint || x.r.cols.includes(e.hint!));
  if (c.length === 0) throw new ApiFailure(400, "PGRST200", `Could not find a relationship between '${parent}' and '${e.table}'`);
  if (c.length > 1) throw new ApiFailure(300, "PGRST201", `More than one relationship was found for '${parent}' and '${e.table}': use !<fk column> to choose`);
  const { kind, r } = c[0]!;
  return {
    kind,
    cond: (child, par) =>
      r.cols.map((col, i) => (kind === "one" ? `${child}.${q(r.refCols[i]!)} = ${par}.${q(col)}` : `${child}.${q(col)} = ${par}.${q(r.refCols[i]!)}`)).join(" AND "),
  };
}

let seq = 0;

/** WHERE conditions of one embedded table: join, its policy, its filters, and (for !inner children) their existence. */
function conditions(parent: string, parentAlias: string, e: Embed, alias: string, who: Caller): { l: Link; where: Sql; sub: Sql[] } {
  tableColumns(e.table);
  const l = link(parent, e);
  const pol = selectPredicate(e.table, who);
  if (pol === undefined) throw new ApiFailure(403, "42501", `table ${e.table} is not available through the API yet`);
  const p = predSql(pol);
  const f = where(e.table, { filters: e.filters ?? [], ors: e.ors ?? [] }, true);
  const inner = (e.embeds ?? []).filter((c) => c.inner).map((c) => innerExists(e.table, alias, c, who));
  const parts = [l.cond(alias, parentAlias), `(${p.sql.replaceAll("__row", alias)})`, `(${f.sql})`, ...inner.map((i) => i.sql)];
  return { l, where: { sql: parts.join(" AND "), params: [...p.params, ...f.params, ...inner.flatMap((i) => i.params)] }, sub: inner };
}

/** `EXISTS (...)` for a !inner embed: the parent row only survives if the embedded row exists. */
export function innerExists(parent: string, parentAlias: string, e: Embed, who: Caller): Sql {
  const alias = `__e${++seq}`;
  const c = conditions(parent, parentAlias, e, alias, who);
  return { sql: `EXISTS (SELECT 1 FROM ${q(e.table)} AS ${alias} WHERE ${c.where.sql})`, params: c.where.params };
}

/** The scalar subquery for one embed (JSON text, or NULL for an empty many-to-one). */
export function embedSelect(parent: string, parentAlias: string, e: Embed, who: Caller): Sql {
  const alias = `__e${++seq}`;
  const c = conditions(parent, parentAlias, e, alias, who);
  if (e.columns === "count") {
    return { sql: `(SELECT json_array(json_object('count', COUNT(*))) FROM ${q(e.table)} AS ${alias} WHERE ${c.where.sql})`, params: c.where.params };
  }
  const cols = e.columns === "*" ? [...tableColumns(e.table).keys()] : e.columns;
  const pairs: Sql[] = cols.map((col) => ({ sql: `'${col}', ${jsonValue(columnKind(e.table, col), `${alias}.${q(col)}`)}`, params: [] }));
  for (const child of e.embeds ?? []) {
    const s = embedSelect(e.table, alias, child, who);
    pairs.push({ sql: `'${child.alias}', json(${s.sql})`, params: s.params });
  }
  const obj = `json_object(${pairs.map((p) => p.sql).join(", ")})`;
  const params = [...pairs.flatMap((p) => p.params), ...c.where.params];
  return c.l.kind === "one"
    ? { sql: `(SELECT ${obj} FROM ${q(e.table)} AS ${alias} WHERE ${c.where.sql} LIMIT 1)`, params }
    : { sql: `(SELECT json_group_array(json(o)) FROM (SELECT ${obj} AS o FROM ${q(e.table)} AS ${alias} WHERE ${c.where.sql}))`, params };
}
