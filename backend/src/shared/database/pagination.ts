import { and, asc, desc, gte, ilike, lt, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";
import type { PageRequest, Paginated } from "../http/list-query.dto";
import { businessDayStartUtc, businessRangeUtc } from "../time/business-date";

// NEO-6: building blocks every paginated repository uses, so paging, search, sorting and date filters behave the same
// across contexts. Repositories build ONE `where` and hand it to both the page query and the count query, so `total`
// always matches the rows the caller can page through.

export interface ListResult<Row> {
  rows: Row[];
  total: number;
}

/**
 * Runs `query` for one page (or unpaged when `page` is undefined) and resolves the total row count.
 * The count query only runs when the page alone can't tell the total (a full page, or an offset past the end).
 */
export async function paginate<T extends PgSelect>(
  query: T,
  page: PageRequest | undefined,
  count: () => Promise<number>
): Promise<ListResult<Awaited<T>[number]>> {
  if (!page) {
    const rows = (await query) as Awaited<T>[number][];
    return { rows, total: rows.length };
  }
  const rows = (await query.limit(page.limit).offset(page.offset)) as Awaited<T>[number][];
  if (rows.length < page.limit && (rows.length > 0 || page.offset === 0)) return { rows, total: page.offset + rows.length };
  return { rows, total: await count() };
}

/** Reads the `count(*)` row a count query returns; Postgres sends bigint counts as strings. */
export function totalOf(rows: Array<{ total: number | string }>): number {
  return Number(rows[0]?.total ?? 0);
}

export function toPaginated<T>(result: ListResult<T>, page: PageRequest): Paginated<T> {
  return { items: result.rows, total: result.total, limit: page.limit, offset: page.offset };
}

/** Escapes LIKE wildcards so user input is matched literally (Postgres' default LIKE escape character is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Case-insensitive "contains" search over several columns; `undefined` (no condition) for an empty search. */
export function searchCondition(q: string | undefined, ...columns: SQLWrapper[]): SQL | undefined {
  const term = q?.trim();
  if (!term || columns.length === 0) return undefined;
  const pattern = `%${escapeLike(term)}%`;
  return or(...columns.map((column) => ilike(column as PgColumn, pattern)));
}

/** Cairo business-day bounds on a timestamptz column: `from`/`to` are inclusive YYYY-MM-DD Cairo calendar dates. */
export function businessDayRangeCondition(column: PgColumn, from?: string, to?: string): SQL | undefined {
  return and(
    from ? gte(column, businessDayStartUtc(from)) : undefined,
    to ? lt(column, businessRangeUtc(to, to).toExclusive) : undefined
  );
}

/** Inclusive bounds on a `date` column (already a calendar date, so no time zone conversion applies). */
export function dateRangeCondition(column: PgColumn, from?: string, to?: string): SQL | undefined {
  return and(from ? sql`${column} >= ${from}::date` : undefined, to ? sql`${column} <= ${to}::date` : undefined);
}

export type SortColumns = Record<string, PgColumn | SQL>;

/**
 * A stable ORDER BY from a client `sort` key: only keys in `columns` are accepted (anything else falls back to
 * `fallback`), and `tiebreaker` (normally the primary key) keeps rows from repeating or vanishing between pages.
 */
export function orderByOf(
  columns: SortColumns,
  sort: string | undefined,
  order: "asc" | "desc" | undefined,
  fallback: { key: string; order: "asc" | "desc" },
  tiebreaker: PgColumn
): SQL[] {
  const known = sort !== undefined && Object.prototype.hasOwnProperty.call(columns, sort);
  const key = known ? sort : fallback.key;
  const direction = order ?? (known ? "asc" : fallback.order);
  const by = direction === "desc" ? desc : asc;
  return [by(columns[key]), by(tiebreaker)];
}

// keeps an IN list well below Postgres' 65535 bind-parameter limit when an unpaged list batch-loads child rows
const IN_LIST_CHUNK = 1000;

/** Splits ids for `inArray` batch loads, so loading children of N parents costs one query per 1000 parents, not N. */
export function inListChunks<T>(values: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += IN_LIST_CHUNK) result.push(values.slice(i, i + IN_LIST_CHUNK));
  return result;
}

/** Groups rows by a key, keeping their order (for attaching batch-loaded children to their parents). */
export function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const list = map.get(keyOf(row));
    if (list) list.push(row);
    else map.set(keyOf(row), [row]);
  }
  return map;
}
