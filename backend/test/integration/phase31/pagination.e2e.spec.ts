import request from "supertest";
import { Client } from "pg";
import { eq, inArray } from "drizzle-orm";
import { auth, bootstrap, createOrder, teardown, type World } from "./harness";
import { orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { auditLogs } from "../../../src/shared/database/shared.tables";
import { cashierShifts } from "../../../src/contexts/shifts/infrastructure/persistence/shifts.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { DEFAULT_PAGE_LIMIT } from "../../../src/shared/http/list-query.dto";

// NEO-6: the shared list contract. `paginate=1` returns { items, total, limit, offset } with the default limit applied; without it
// the endpoints keep their bare-array responses. Filters run in SQL (Cairo business-day bounds for dates), totals match what the
// caller may see, list loading is a fixed number of queries, and the old row caps (audit 500, shifts 200, print jobs 300) can be
// paged past.
describe("NEO-6 - server-side pagination and filtering", () => {
  let w: World;
  const orderIds: string[] = [];

  const get = (path: string, token = w.tokens.admin) => request(w.http()).get(path).set(auth(token));

  beforeAll(async () => {
    w = await bootstrap("pg");
    for (let i = 0; i < 5; i++) {
      const res = await createOrder(w, w.tokens.admin, { branchId: w.branchA });
      expect(res.status).toBe(201);
      orderIds.push(res.body.id);
    }
    const b = await createOrder(w, w.tokens.admin, { branchId: w.branchB });
    expect(b.status).toBe(201);
  });

  afterAll(async () => {
    await teardown(w);
  });

  describe("orders", () => {
    test("without paginate the response is still the bare array (POS, offline cache and other consumers)", async () => {
      const res = await get(`/orders?branchId=${w.branchA}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(5);
    });

    test("paginate=1 returns the envelope with the default limit", async () => {
      const res = await get(`/orders?paginate=1&branchId=${w.branchA}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 5, limit: DEFAULT_PAGE_LIMIT, offset: 0 });
      expect(res.body.items).toHaveLength(5);
    });

    test("pages are stable: every order exactly once across pages, total on each page", async () => {
      const seen: string[] = [];
      for (const offset of [0, 2, 4]) {
        const res = await get(`/orders?paginate=1&branchId=${w.branchA}&limit=2&offset=${offset}`);
        expect(res.body.total).toBe(5);
        seen.push(...res.body.items.map((o: { id: string }) => o.id));
      }
      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(new Set(orderIds));
    });

    test("an offset past the end returns no rows but the real total", async () => {
      const res = await get(`/orders?paginate=1&branchId=${w.branchA}&limit=2&offset=40`);
      expect(res.body).toMatchObject({ items: [], total: 5, offset: 40 });
    });

    test("search, status and type filters run on the server; LIKE wildcards are matched literally", async () => {
      await w.db.update(orders).set({ customer_name: "Mona 100%" }).where(eq(orders.id, orderIds[0]));
      await w.db.update(orders).set({ status: "completed" }).where(eq(orders.id, orderIds[1]));

      const byName = await get(`/orders?paginate=1&branchId=${w.branchA}&q=mona`);
      expect(byName.body.items.map((o: { id: string }) => o.id)).toEqual([orderIds[0]]);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&q=${encodeURIComponent("100%")}`)).body.total).toBe(1);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&q=${encodeURIComponent("%")}`)).body.total).toBe(1);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&q=${encodeURIComponent("_")}`)).body.total).toBe(0);

      const completed = await get(`/orders?paginate=1&branchId=${w.branchA}&status=completed`);
      expect(completed.body.items.map((o: { id: string }) => o.id)).toEqual([orderIds[1]]);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&orderType=delivery`)).body.total).toBe(0);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&status=bogus`)).status).toBe(400);
    });

    test("date filters use the Cairo business day: 23:30 Cairo stays on that day, 00:30 Cairo is the next day", async () => {
      // 2030-06-14 is summer time (UTC+3): 20:30Z = 23:30 Cairo on the 14th, 21:30Z = 00:30 Cairo on the 15th
      await w.db.update(orders).set({ created_at: new Date("2030-06-14T20:30:00Z") }).where(eq(orders.id, orderIds[2]));
      await w.db.update(orders).set({ created_at: new Date("2030-06-14T21:30:00Z") }).where(eq(orders.id, orderIds[3]));

      const day14 = await get(`/orders?paginate=1&branchId=${w.branchA}&from=2030-06-14&to=2030-06-14`);
      expect(day14.body.items.map((o: { id: string }) => o.id)).toEqual([orderIds[2]]);
      const day15 = await get(`/orders?paginate=1&branchId=${w.branchA}&from=2030-06-15&to=2030-06-15`);
      expect(day15.body.items.map((o: { id: string }) => o.id)).toEqual([orderIds[3]]);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&from=2030-06-14`)).body.total).toBe(2);
      expect((await get(`/orders?paginate=1&branchId=${w.branchA}&from=14-06-2030`)).status).toBe(400);
    });

    test("loading a page costs the same number of queries for 1 order or 5 (no N+1 on items and modifiers)", async () => {
      const spy = jest.spyOn(Client.prototype, "query");
      try {
        const queriesFor = async (limit: number) => {
          spy.mockClear();
          const res = await get(`/orders?paginate=1&branchId=${w.branchA}&limit=${limit}`);
          expect(res.status).toBe(200);
          expect(res.body.items).toHaveLength(limit);
          expect(spy.mock.calls.length).toBeGreaterThan(0); // the spy really sees the app's queries
          return spy.mock.calls.length;
        };
        await queriesFor(1); // warm-up
        expect(await queriesFor(5)).toBe(await queriesFor(1));
      } finally {
        spy.mockRestore();
      }
    });

    test("a branch-bound manager gets only its branch, in SQL: the total counts branch A only", async () => {
      const res = await get("/orders?paginate=1&limit=1", w.tokens.managerA);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5);
      expect(res.body.items.every((o: { branchId: string }) => o.branchId === w.branchA)).toBe(true);
      expect((await get(`/orders?paginate=1&branchId=${w.branchB}`, w.tokens.managerA)).status).toBe(403);
      // admin sees both branches
      expect((await get("/orders?paginate=1&limit=1")).body.total).toBeGreaterThanOrEqual(6);
    });
  });

  describe("list query validation", () => {
    test("bad paging input is rejected; an oversized limit is clamped to 200", async () => {
      expect((await get("/orders?paginate=1&limit=0")).status).toBe(400);
      expect((await get("/orders?paginate=1&offset=-1")).status).toBe(400);
      expect((await get("/orders?paginate=maybe")).status).toBe(400);
      expect((await get("/orders?paginate=1&order=sideways")).status).toBe(400);
      const clamped = await get("/orders?paginate=1&limit=5000");
      expect(clamped.status).toBe(200);
      expect(clamped.body.limit).toBe(200);
    });
  });

  describe("catalog items", () => {
    test("paged, searchable and filterable by category (`none` = no category)", async () => {
      const legacy = await get("/catalog/items");
      expect(Array.isArray(legacy.body)).toBe(true);

      const res = await get(`/catalog/items?paginate=1&q=${encodeURIComponent(`صنف-${w.tag}`)}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].variants[0].id).toBe(w.variantId);

      const uncategorized = await get("/catalog/items?paginate=1&categoryId=none&limit=200");
      const [row] = await w.db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.name, `صنف-${w.tag}`));
      expect(uncategorized.body.items.some((i: { id: string }) => i.id === row.id)).toBe(true);
      expect((await get("/catalog/items?paginate=1&status=inactive&q=" + encodeURIComponent(`صنف-${w.tag}`))).body.total).toBe(0);
    });
  });

  describe("lists that used to stop at a fixed cap", () => {
    test("audit logs: unpaged keeps the 100/500 caps, paged reaches every row", async () => {
      const entityType = `neo6-audit-${w.tag}`;
      await w.db.insert(auditLogs).values(
        Array.from({ length: 510 }, (_, i) => ({ action: "NEO6_TEST", entity_type: entityType, entity_id: String(i), created_at: new Date(Date.UTC(2001, 0, 1, 0, 0, i)) }))
      );
      expect((await get(`/audit-logs?entityType=${entityType}`)).body).toHaveLength(100);
      expect((await get(`/audit-logs?entityType=${entityType}&limit=1000`)).body).toHaveLength(500);

      const tail = await get(`/audit-logs?entityType=${entityType}&paginate=1&limit=200&offset=500`);
      expect(tail.body.total).toBe(510);
      expect(tail.body.items.map((r: { entityId: string }) => r.entityId)).toEqual(["9", "8", "7", "6", "5", "4", "3", "2", "1", "0"]);
    });

    test("shifts: past the old 200 cap", async () => {
      await w.db.insert(cashierShifts).values(
        Array.from({ length: 205 }, (_, i) => ({
          branch_id: w.branchA,
          user_id: w.userIds.cashierA,
          status: "CLOSED",
          opening_cash: 0,
          opened_at: new Date(Date.UTC(2002, 0, 1, 0, i)),
        }))
      );
      expect((await get(`/shifts?branchId=${w.branchA}&status=CLOSED`)).body).toHaveLength(200);
      const tail = await get(`/shifts?branchId=${w.branchA}&status=CLOSED&paginate=1&limit=200&offset=200`);
      expect(tail.body.total).toBe(205);
      expect(tail.body.items).toHaveLength(5);
      // the business-day filter applies to opened_at
      expect((await get(`/shifts?branchId=${w.branchA}&status=CLOSED&paginate=1&from=2002-01-01&to=2002-01-01`)).body.total).toBe(205);
    });

    test("print jobs: past the old 300 cap, while the print agent's unpaged `limit` still works", async () => {
      await w.db.insert(printJobs).values(
        Array.from({ length: 305 }, (_, i) => ({
          id: crypto.randomUUID(),
          branch_id: w.branchA,
          print_type: "TEST_PRINT",
          status: "PRINTED",
          content_html: "<p>neo6</p>",
          idempotency_key: `neo6-${w.tag}-${i}`,
          created_at: new Date(Date.UTC(2003, 0, 1, 0, 0, i)),
        }))
      );
      expect((await get(`/printing/print-jobs?branchId=${w.branchA}&status=PRINTED`)).body).toHaveLength(100);
      expect((await get(`/printing/print-jobs?branchId=${w.branchA}&status=PRINTED&limit=300`)).body).toHaveLength(300);
      const tail = await get(`/printing/print-jobs?branchId=${w.branchA}&status=PRINTED&paginate=1&limit=200&offset=300`);
      expect(tail.body.total).toBe(305);
      expect(tail.body.items).toHaveLength(5);
      await w.db.delete(printJobs).where(inArray(printJobs.branch_id, [w.branchA]));
    });
  });
});
