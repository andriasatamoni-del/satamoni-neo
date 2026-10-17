import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export const DEFAULT_PAGE_SIZE = 50;

export interface ListState<F extends string> {
  /** current filter values from the URL ("" when unset) */
  filters: Record<F, string>;
  /** 1-based page number */
  page: number;
  limit: number;
  offset: number;
  setFilter: (name: F, value: string) => void;
  setPage: (page: number) => void;
  /** filters plus limit/offset, ready for usePaginatedQuery */
  params: Record<F | "limit" | "offset", string | number>;
}

/**
 * NEO-6: list filters and the page live in the URL search params, so they survive a reload and can be shared.
 * `prefix` keeps the params of several lists on one page apart (e.g. "po." and "gr." on the procurement page).
 * Changing a filter goes back to page 1; URL updates replace the history entry instead of adding one per keystroke.
 */
export function useListState<F extends string>(filterNames: readonly F[], options: { prefix?: string; pageSize?: number } = {}): ListState<F> {
  const prefix = options.prefix ?? "";
  const limit = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const [searchParams, setSearchParams] = useSearchParams();

  const namesKey = filterNames.join(",");
  const filters = useMemo(
    () => Object.fromEntries(namesKey.split(",").filter(Boolean).map((name) => [name, searchParams.get(prefix + name) ?? ""])) as Record<F, string>,
    [searchParams, prefix, namesKey]
  );
  const page = Math.max(1, Number(searchParams.get(`${prefix}page`)) || 1);

  const setFilter = useCallback(
    (name: F, value: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(prefix + name, value);
          else next.delete(prefix + name);
          next.delete(`${prefix}page`);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams, prefix]
  );

  const setPage = useCallback(
    (nextPage: number) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextPage > 1) next.set(`${prefix}page`, String(nextPage));
          else next.delete(`${prefix}page`);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams, prefix]
  );

  const offset = (page - 1) * limit;
  const params = useMemo(() => ({ ...filters, limit, offset }), [filters, limit, offset]);
  return { filters, page, limit, offset, setFilter, setPage, params };
}
