import columns from "../../d1/columns.json";

export type Kind = "text" | "ts" | "date" | "time" | "bool" | "json" | "int" | "real" | "money";

export interface ColumnDef { col: string; kind: Kind; /** SQLite default expression; `__UID__` = the caller */ default?: string }
const tables = columns as unknown as Record<string, ColumnDef[]>;
const index = new Map(Object.entries(tables).map(([t, cols]) => [t, new Map(cols.map((c) => [c.col, c.kind]))]));

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Column → kind for a table; unknown table/column is a 400, so identifiers never reach SQL unchecked. */
export function tableColumns(table: string): Map<string, Kind> {
  const t = index.get(table);
  if (!t) throw new ApiFailure(404, "PGRST205", `Could not find the table 'public.${table}'`);
  return t;
}

export function columnKind(table: string, col: string): Kind {
  const k = tableColumns(table).get(col);
  if (!k) throw new ApiFailure(400, "42703", `column ${table}.${col} does not exist`);
  return k;
}

/** Every non-generated column of a table, in order, with its default (the INSERT candidate row is built from this). */
export function tableDefs(table: string): ColumnDef[] {
  tableColumns(table);
  return tables[table]!;
}
