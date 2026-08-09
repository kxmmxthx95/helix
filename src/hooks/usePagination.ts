import { useEffect, useState } from "react";

/**
 * Client-side pagination — every table in the app fetches its full filtered
 * result set already (no server-side range queries), so this just slices.
 * resetDeps mirrors useEffect's dep array: pass whatever should snap the
 * page back to 1 (filters, picked department, ...) — NOT `rows` itself,
 * since that reference also changes on background refetches after an
 * unrelated edit and would otherwise kick the user off their page.
 */
export function usePagination<T>(rows: T[], resetDeps: unknown[], pageSize = 20) {
  const [page, setPage] = useState(1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(1), resetDeps);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page_ = Math.min(page, pageCount);
  const pageRows = rows.slice((page_ - 1) * pageSize, page_ * pageSize);

  return { page: page_, setPage, pageCount, pageRows };
}
