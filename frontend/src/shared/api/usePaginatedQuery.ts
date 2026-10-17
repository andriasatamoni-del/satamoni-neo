import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "./client";

// NEO-6: the envelope a list endpoint returns when it is asked for a page (`paginate=1`)
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type ListParams = Record<string, string | number | boolean | null | undefined>;

/** `?a=1&b=x` from the non-empty params (empty strings, null and undefined are left out) */
export function toQueryString(params: ListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * One page of a server-side paginated list. `key` is the query-key prefix the page's mutations already invalidate
 * (e.g. ["orders"]), so a refetch after a change still happens; the previous page stays on screen while the next loads.
 */
export function usePaginatedQuery<T>(key: QueryKey, path: string, params: ListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...key, "page", params],
    queryFn: () => apiRequest<Paginated<T>>(`${path}${toQueryString({ ...params, paginate: 1 })}`),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  });
}
