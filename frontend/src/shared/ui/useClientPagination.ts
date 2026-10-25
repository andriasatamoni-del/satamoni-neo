import { useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "./useListState";

export interface ClientPage<T> {
  pageRows: T[];
  pager: { total: number; limit: number; offset: number; onPageChange: (page: number) => void };
}

export function useClientPagination<T>(rows: readonly T[] | undefined, pageSize: number = DEFAULT_PAGE_SIZE): ClientPage<T> {
  const [page, setPage] = useState(1);
  const total = rows?.length ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const offset = (Math.min(page, lastPage) - 1) * pageSize;
  const pageRows = useMemo(() => (rows ?? []).slice(offset, offset + pageSize), [rows, offset, pageSize]);
  return { pageRows, pager: { total, limit: pageSize, offset, onPageChange: setPage } };
}
