import columns from "../../d1/columns.json";

export type Kind = "text" | "ts" | "date" | "time" | "bool" | "json" | "int" | "real" | "money";

const tables = columns as Record<string, { col: string; kind: Kind }[]>;
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
