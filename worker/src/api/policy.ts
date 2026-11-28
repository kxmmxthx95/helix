import policies from "../../d1/policies.json";
import type { Pred, Sql } from "./compile";

/**
 * Row-level security, generated: worker/d1/policies.json comes from the live Postgres policies via scripts/pg-policies-to-d1.py
 * (helpers inlined, Postgres-isms rewritten) and is checked against Postgres for real users by scripts/rls-diff.py.
 * Never edit by hand; change the policy in Postgres and regenerate.
 *
 * Permissive policies combine with OR, exactly as in Postgres. The SQL refers to the queried table as `__row` and to the caller
 * through the tokens __UID__ (auth.uid()) and __SID__ (the JWT session id), bound per request.
 */
type Entry = { policy: string; sql: string };
type TablePolicies = { select?: Entry[]; insert?: Entry[]; update_using?: Entry[]; update_check?: Entry[]; delete?: Entry[] };
const P = policies as unknown as Record<string, TablePolicies>;

export interface Caller {
  uid: string;
  /** Session id from the access token (the exam single-device rule reads it); null if the token has none. */
  sid: string | null;
}

function render(sql: string, who: Caller): Sql {
  const params: unknown[] = [];
  const out = sql.replace(/__UID__|__SID__/g, (m) => {
    params.push(m === "__UID__" ? who.uid : who.sid);
    return "?";
  });
  return { sql: out, params };
}

function orOf(list: Entry[] | undefined, who: Caller): Pred {
  if (!list?.length) return false; // RLS on, no policy for this command: Postgres denies
  const parts = list.map((e) => render(e.sql, who));
  return { sql: parts.map((p) => `(${p.sql})`).join(" OR "), params: parts.flatMap((p) => p.params) };
}

/**
 * Condition a caller's SELECT must satisfy on `table`: the OR of its SELECT policies.
 * `undefined` = the table is not exposed through the API (no policies known: deny by default, the API never guesses).
 */
export function selectPredicate(table: string, who: Caller): Pred | undefined {
  const t = P[table];
  return t ? orOf(t.select, who) : undefined;
}

/** Predicates for writes: INSERT check, UPDATE using/check, DELETE using (and the SELECT predicate for RETURNING / row visibility). */
export function writePredicates(table: string, who: Caller) {
  const t = P[table];
  if (!t) return undefined;
  return { select: orOf(t.select, who), insert: orOf(t.insert, who), updateUsing: orOf(t.update_using, who), updateCheck: orOf(t.update_check, who), delete: orOf(t.delete, who) };
}
