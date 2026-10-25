import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

// NEO-6: one list contract for every paginated endpoint.
//
// Opt-in during the transition: a caller that sends `paginate=1` gets a `Paginated<T>` envelope with the default limit
// applied; without it the endpoint keeps returning the bare array it always did (the POS menu, the offline cashier cache
// and the pickers on other pages need the full list). Filters (q, from/to, per-resource ones) apply in both modes.
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 200;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Query-string boolean: `1`/`true` are true, `0`/`false` are false, anything else is left for the validator to reject. */
export const QueryBoolean = () =>
  Transform(({ value }) => {
    if (value === true || value === "1" || value === "true") return true;
    if (value === false || value === "0" || value === "false") return false;
    return value;
  });

export class ListQueryDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  paginate?: boolean;

  // clamped to MAX_PAGE_LIMIT rather than rejected: a few pre-NEO-6 clients (the print agent, the audit page) send larger
  // `limit`s to capped lists that still honour their own caps in unpaged mode (see cappedPage)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sort?: string;

  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc";

  /** Cairo business date (YYYY-MM-DD), inclusive */
  @IsOptional()
  @Matches(DATE_ONLY, { message: "from must be YYYY-MM-DD" })
  @IsDateString({ strict: true }, { message: "from must be a real calendar date" })
  from?: string;

  /** Cairo business date (YYYY-MM-DD), inclusive */
  @IsOptional()
  @Matches(DATE_ONLY, { message: "to must be YYYY-MM-DD" })
  @IsDateString({ strict: true }, { message: "to must be a real calendar date" })
  to?: string;
}

/** A list query that also accepts a branch filter (still subject to the BranchScopeGuard rules). */
export class BranchListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageRequest {
  limit: number;
  offset: number;
}

/** The page a list query asks for; `undefined` means the caller did not opt in to pagination (legacy bare-array mode). */
export function pageRequestOf(query: Pick<ListQueryDto, "paginate" | "limit" | "offset">): PageRequest | undefined {
  if (!query.paginate) return undefined;
  return {
    limit: Math.min(Math.max(query.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT),
    offset: Math.max(query.offset ?? 0, 0),
  };
}

/**
 * For lists that always had a row cap (audit logs, shifts, print jobs, branch days): the requested page, or in unpaged
 * mode the first `limit` rows with the list's historical default and maximum, exactly as before NEO-6.
 */
export function cappedPage(query: Pick<ListQueryDto, "limit">, page: PageRequest | undefined, defaultLimit: number, maxLimit: number): PageRequest {
  return page ?? { limit: Math.min(Math.max(query.limit ?? defaultLimit, 1), maxLimit), offset: 0 };
}

/** Splits a list query into the page it asks for and the remaining filters (q, sort, from/to, per-resource ones). */
export function splitListQuery<Q extends ListQueryDto>(query: Q): { page: PageRequest | undefined; filter: Omit<Q, "paginate" | "limit" | "offset"> } {
  const { paginate: _paginate, limit: _limit, offset: _offset, ...filter } = query;
  return { page: pageRequestOf(query), filter };
}

/** The response of a list endpoint: the `Paginated<T>` envelope when the caller asked for a page, the bare array otherwise. */
export function listResponse<T>(items: T[], total: number, page: PageRequest | undefined): Paginated<T> | T[] {
  return page ? { items, total, limit: page.limit, offset: page.offset } : items;
}

export function pageOfRows<T>(rows: T[], page: PageRequest | undefined): T[] {
  return page ? rows.slice(page.offset, page.offset + page.limit) : rows;
}
