/** Wire format between src/lib/db.ts and the API worker. Pure types: both sides import this file. */
export type Scalar = string | number | boolean | null;
export type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in";

export interface Filter {
  col: string;
  op: Op;
  val: Scalar | Scalar[];
  /** `.not(col, op, val)` */
  neg?: boolean;
}

export interface SelectRequest {
  table: string;
  /** "*" or plain column names (embedded selects are not supported yet). */
  columns: "*" | string[];
  filters: Filter[];
  /** Each entry is one `.or(...)`: rows matching ANY filter in it. */
  ors: Filter[][];
  order: { col: string; asc: boolean; nullsFirst?: boolean }[];
  limit?: number;
  offset?: number;
  /** `{ count: "exact" }` */
  count?: boolean;
  /** `{ head: true }`: return only the count. */
  head?: boolean;
  single?: "one" | "maybe";
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
}

export type ApiResponse<T = unknown> = { data: T; count: number | null; error: null } | { data: null; count: null; error: ApiError };
