import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { lastValueFrom, of } from "rxjs";
import { PgDialect, pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  cappedPage,
  DEFAULT_PAGE_LIMIT,
  listResponse,
  ListQueryDto,
  MAX_PAGE_LIMIT,
  pageRequestOf,
  splitListQuery,
} from "../../../src/shared/http/list-query.dto";
import {
  businessDayRangeCondition,
  dateRangeCondition,
  escapeLike,
  groupBy,
  inListChunks,
  orderByOf,
  paginate,
  searchCondition,
  totalOf,
} from "../../../src/shared/database/pagination";
import { BranchListFilterInterceptor, scopedBranchId } from "../../../src/shared/authorization/branch-scope";

const things = pgTable("things", {
  id: uuid().primaryKey(),
  name: text(),
  note: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }),
  day: date(),
});
const dialect = new PgDialect();
const render = (fragment: SQL | undefined) => (fragment ? dialect.sqlToQuery(fragment) : undefined);
const renderOrder = (parts: SQL[]) => parts.map((p) => dialect.sqlToQuery(p).sql);

// NEO-6: the shared list contract and its building blocks
describe("list query contract", () => {
  const validate = (plain: Record<string, unknown>) => {
    const dto = plainToInstance(ListQueryDto, plain);
    return { dto, errors: validateSync(dto, { whitelist: true }) };
  };

  test("query-string values are converted and validated", () => {
    const { dto, errors } = validate({ paginate: "1", limit: "20", offset: "40", q: "x", order: "desc", from: "2030-01-01", to: "2030-01-31" });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ paginate: true, limit: 20, offset: 40, order: "desc" });
    expect(validate({ paginate: "false" }).dto.paginate).toBe(false);
  });

  test("bad input is rejected", () => {
    for (const plain of [{ limit: "0" }, { limit: "abc" }, { offset: "-1" }, { paginate: "maybe" }, { order: "up" }, { from: "01-01-2030" }, { to: "2030-1-1" }, { from: "2026-02-31" }, { to: "2026-13-01" }, { q: "x".repeat(101) }]) {
      expect([plain, validate(plain).errors.length > 0]).toEqual([plain, true]);
    }
  });

  test("pageRequestOf: only when paginate is asked for; default limit, clamped to the maximum", () => {
    expect(pageRequestOf({})).toBeUndefined();
    expect(pageRequestOf({ limit: 10 })).toBeUndefined();
    expect(pageRequestOf({ paginate: true })).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
    expect(pageRequestOf({ paginate: true, limit: 5000, offset: 7 })).toEqual({ limit: MAX_PAGE_LIMIT, offset: 7 });
  });

  test("cappedPage keeps the historical unpaged caps and passes a real page through", () => {
    expect(cappedPage({}, undefined, 100, 500)).toEqual({ limit: 100, offset: 0 });
    expect(cappedPage({ limit: 9999 }, undefined, 100, 500)).toEqual({ limit: 500, offset: 0 });
    expect(cappedPage({ limit: 50 }, { limit: 50, offset: 600 }, 100, 500)).toEqual({ limit: 50, offset: 600 });
  });

  test("splitListQuery separates paging from filters; listResponse picks envelope or bare array", () => {
    const { page, filter } = splitListQuery(Object.assign(new ListQueryDto(), { paginate: true, limit: 2, offset: 4, q: "a", from: "2030-01-01" }));
    expect(page).toEqual({ limit: 2, offset: 4 });
    expect(filter).toEqual({ q: "a", from: "2030-01-01" });
    expect(listResponse([1, 2], 9, page)).toEqual({ items: [1, 2], total: 9, limit: 2, offset: 4 });
    expect(listResponse([1, 2], 9, undefined)).toEqual([1, 2]);
  });
});

describe("pagination helpers", () => {
  test("escapeLike makes %, _ and \\ literal; searchCondition ORs an ILIKE per column and is skipped when empty", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(searchCondition(undefined, things.name)).toBeUndefined();
    expect(searchCondition("   ", things.name)).toBeUndefined();
    const q = render(searchCondition(" 100% ", things.name, things.note))!;
    expect(q.sql).toBe('("things"."name" ilike $1 or "things"."note" ilike $2)');
    expect(q.params).toEqual(["%100\\%%", "%100\\%%"]);
  });

  test("orderByOf accepts only whitelisted sort keys and always appends the tiebreaker", () => {
    const columns = { name: things.name, createdAt: things.created_at };
    const fallback = { key: "createdAt", order: "desc" as const };
    expect(renderOrder(orderByOf(columns, "name", undefined, fallback, things.id))).toEqual(['"things"."name" asc', '"things"."id" asc']);
    expect(renderOrder(orderByOf(columns, "name", "desc", fallback, things.id))).toEqual(['"things"."name" desc', '"things"."id" desc']);
    expect(renderOrder(orderByOf(columns, undefined, undefined, fallback, things.id))).toEqual(['"things"."created_at" desc', '"things"."id" desc']);
    // unknown or prototype keys never reach SQL
    for (const sort of ["password_hash", "__proto__", "constructor", "toString"]) {
      expect(renderOrder(orderByOf(columns, sort, undefined, fallback, things.id))).toEqual(['"things"."created_at" desc', '"things"."id" desc']);
    }
  });

  test("businessDayRangeCondition uses Cairo day bounds (summer and winter offsets)", () => {
    const summer = render(businessDayRangeCondition(things.created_at, "2030-06-14", "2030-06-14"))!;
    expect(summer.params).toEqual(["2030-06-13T21:00:00.000Z", "2030-06-14T21:00:00.000Z"]);
    expect(summer.sql).toBe('("things"."created_at" >= $1 and "things"."created_at" < $2)');
    const winter = render(businessDayRangeCondition(things.created_at, "2030-01-10", undefined))!;
    expect(winter.params).toEqual(["2030-01-09T22:00:00.000Z"]);
    expect(businessDayRangeCondition(things.created_at)).toBeUndefined();
  });

  test("dateRangeCondition compares a date column with inclusive calendar dates", () => {
    const q = render(dateRangeCondition(things.day, "2030-01-01", "2030-01-31"))!;
    expect(q.sql).toBe('("things"."day" >= $1::date and "things"."day" <= $2::date)');
    expect(q.params).toEqual(["2030-01-01", "2030-01-31"]);
  });

  test("inListChunks and groupBy", () => {
    const ids = Array.from({ length: 2501 }, (_, i) => i);
    expect(inListChunks(ids).map((c) => c.length)).toEqual([1000, 1000, 501]);
    expect(inListChunks([])).toEqual([]);
    expect([...groupBy([{ k: "a", v: 1 }, { k: "b", v: 2 }, { k: "a", v: 3 }], (r) => r.k)]).toEqual([
      ["a", [{ k: "a", v: 1 }, { k: "a", v: 3 }]],
      ["b", [{ k: "b", v: 2 }]],
    ]);
  });

  describe("paginate", () => {
    // a stand-in for a Drizzle dynamic select: awaitable, with limit/offset recording the page it was asked for
    const fakeQuery = (rows: number[]) => {
      const state = { limit: Infinity, offset: 0 };
      const query = {
        limit(n: number) {
          state.limit = n;
          return query;
        },
        offset(n: number) {
          state.offset = n;
          return query;
        },
        then(resolve: (v: number[]) => unknown, reject: (e: unknown) => unknown) {
          return Promise.resolve(rows.slice(state.offset, state.offset + state.limit)).then(resolve, reject);
        },
      };
      return query as never;
    };
    const rows = Array.from({ length: 7 }, (_, i) => i);

    test("a short first page knows its total without the count query", async () => {
      const count = jest.fn(async () => 7);
      expect(await paginate(fakeQuery(rows), { limit: 10, offset: 0 }, count)).toEqual({ rows, total: 7 });
      expect(count).not.toHaveBeenCalled();
    });

    test("a full page or an offset past the end runs the count", async () => {
      const count = jest.fn(async () => 7);
      expect(await paginate(fakeQuery(rows), { limit: 3, offset: 3 }, count)).toEqual({ rows: [3, 4, 5], total: 7 });
      expect(await paginate(fakeQuery(rows), { limit: 3, offset: 30 }, count)).toEqual({ rows: [], total: 7 });
      expect(count).toHaveBeenCalledTimes(2);
    });

    test("a short last page derives the total from the offset", async () => {
      const count = jest.fn(async () => 7);
      expect(await paginate(fakeQuery(rows), { limit: 3, offset: 6 }, count)).toEqual({ rows: [6], total: 7 });
      expect(count).not.toHaveBeenCalled();
    });

    test("without a page every row comes back", async () => {
      expect(await paginate(fakeQuery(rows), undefined, async () => -1)).toEqual({ rows, total: 7 });
    });

    test("totalOf reads Postgres' string counts", () => {
      expect(totalOf([{ total: "42" }])).toBe(42);
      expect(totalOf([])).toBe(0);
    });
  });
});

describe("branch scope of list queries", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  test("scopedBranchId: company-wide may narrow, branch-bound is pinned, no branch is refused", () => {
    expect(scopedBranchId({ kind: "all" })).toBeUndefined();
    expect(scopedBranchId({ kind: "all" }, B)).toBe(B);
    expect(scopedBranchId({ kind: "branch", branchId: A })).toBe(A);
    expect(scopedBranchId({ kind: "branch", branchId: A }, A)).toBe(A);
    expect(() => scopedBranchId({ kind: "none" })).toThrow(ForbiddenException);
  });

  test("BranchListFilterInterceptor filters a { items, total } envelope too, keeping the total consistent", async () => {
    const reflector = { get: () => "branchId" };
    const interceptor = new BranchListFilterInterceptor(reflector as never);
    const run = async (scope: unknown, data: unknown) => {
      const context = { getHandler: () => undefined, switchToHttp: () => ({ getRequest: () => ({ branchScope: scope }) }) };
      return lastValueFrom(interceptor.intercept(context as never, { handle: () => of(data) }));
    };
    const envelope = { items: [{ branchId: A }, { branchId: B }], total: 12, limit: 2, offset: 0 };
    expect(await run({ kind: "branch", branchId: A }, envelope)).toEqual({ items: [{ branchId: A }], total: 11, limit: 2, offset: 0 });
    expect(await run({ kind: "none" }, envelope)).toEqual({ items: [], total: 10, limit: 2, offset: 0 });
    expect(await run({ kind: "all" }, envelope)).toBe(envelope);
    expect(await run({ kind: "branch", branchId: A }, [{ branchId: A }, { branchId: B }])).toEqual([{ branchId: A }]);
    expect(await run({ kind: "none" }, [{ branchId: A }])).toEqual([]);
  });
});
