// Test helper only: a D1Database look-alike over node:sqlite, so the real handler runs against the real generated schema.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: never[]): unknown[]; get(...p: never[]): unknown; run(...p: never[]): unknown };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (file: string) => RawDb };

export function sqliteD1(file?: string): { d1: D1Database; raw: RawDb } {
  const raw = new DatabaseSync(file ?? ":memory:");
  const stmt = (sql: string, params: unknown[] = []) => ({
    bind: (...p: unknown[]) => stmt(sql, p),
    all: async () => ({ results: raw.prepare(sql).all(...(params as never[])) }),
    first: async () => raw.prepare(sql).get(...(params as never[])) ?? null,
    run: async () => ({ meta: raw.prepare(sql).run(...(params as never[])) }),
  });
  const d1 = {
    prepare: (sql: string) => stmt(sql),
    // D1 runs a batch as one transaction: all statements apply or none do.
    batch: async (list: ReturnType<typeof stmt>[]) => {
      raw.exec("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.all());
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { d1: d1 as unknown as D1Database, raw };
}

/** Empty database with the full generated schema (foreign keys off so fixtures stay small). */
export function schemaDb() {
  const t = sqliteD1();
  t.raw.exec("PRAGMA foreign_keys = OFF");
  t.raw.exec(readFileSync(new URL("../../d1/schema.sql", import.meta.url), "utf8"));
  // As in production: triggers come after the data. Tests insert fixtures directly, so they are loaded here, before the API writes.
  t.raw.exec(readFileSync(new URL("../../d1/triggers.sql", import.meta.url), "utf8"));
  return t;
}
