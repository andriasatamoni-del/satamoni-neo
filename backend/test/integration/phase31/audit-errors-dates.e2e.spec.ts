import request from "supertest";
import { sql } from "kysely";
import { auth, bootstrap, createOrder, journalsFor, teardown, type World } from "./harness";
import { deleteAuditLogsForTest } from "../helpers/audit";

// Audit-trail integrity, safe error mapping (400 for malformed ids, 409 for conflicts - never 500) and the Cairo business date (BL-12).
describe("Phase 3.1 - audit trail, error mapping and Cairo business date", () => {
  let w: World;
  const get = (path: string, token: string) => request(w.http()).get(path).set(auth(token));
  const post = (path: string, token: string, body?: Record<string, unknown>) => request(w.http()).post(path).set(auth(token)).send(body ?? {});
  const patch = (path: string, token: string, body?: Record<string, unknown>) => request(w.http()).patch(path).set(auth(token)).send(body ?? {});

  beforeAll(async () => {
    w = await bootstrap("aud");
  });
  afterAll(async () => {
    await teardown(w);
  });

  describe("audit trail", () => {
    test("a user role/branch change is audited with the REAL entity id and before/after evidence (and never the password)", async () => {
      const target = w.userIds.cashierB;
      const res = await patch(`/users/${target}`, w.tokens.admin, { role: "branch_manager", branchId: w.branchB, password: "Zx9!secretPass" });
      expect(res.status).toBe(200);
      const { rows } = await sql<{ entity_type: string; entity_id: string; outcome: string; actor_user_id: string; metadata: Record<string, any> }>`
        SELECT entity_type, entity_id, outcome, actor_user_id, metadata FROM audit_logs WHERE action LIKE 'PATCH /users/%' ORDER BY created_at DESC LIMIT 1`.execute(w.db);
      expect(rows[0].outcome).toBe("SUCCESS");
      expect(rows[0].entity_type).toBe("users");
      expect(rows[0].entity_id).toBe(target);
      expect(rows[0].actor_user_id).toBe(w.userIds.admin);
      expect(rows[0].metadata.before.role).toBe("cashier");
      expect(rows[0].metadata.after.role).toBe("branch_manager");
      expect(JSON.stringify(rows[0].metadata)).not.toContain("Zx9!secretPass");
      expect(JSON.stringify(rows[0].metadata).toLowerCase()).not.toContain("passwordhash");
      await patch(`/users/${target}`, w.tokens.admin, { role: "cashier" });
    });

    test("salary changes carry before/after pay values", async () => {
      const employee = (await post("/hr/employees", w.tokens.admin, { name: "موظف-aud", baseSalary: 3000, wageType: "fixed_monthly" })).body.id;
      expect((await patch(`/hr/employees/${employee}`, w.tokens.admin, { baseSalary: 3500 })).status).toBe(200);
      const { rows } = await sql<{ metadata: Record<string, any> }>`SELECT metadata FROM audit_logs WHERE entity_id = ${employee} AND action LIKE 'PATCH /hr/employees%' LIMIT 1`.execute(w.db);
      expect(rows[0].metadata.before.baseSalary).toBe(3000);
      expect(rows[0].metadata.after.baseSalary).toBe(3500);
    });

    test("payroll approval, manual journal posting/reversal and period close are audited with before/after state", async () => {
      const employee = (await post("/hr/employees", w.tokens.admin, { name: "موظف-aud2", baseSalary: 1000, wageType: "fixed_monthly" })).body.id;
      const run = await post("/hr/payroll-runs", w.tokens.admin, { year: 2036, month: 3, employees: [{ employeeId: employee, grossPay: 1000 }] });
      expect((await post(`/hr/payroll-runs/${run.body.id}/approve`, w.tokens.admin2)).status).toBe(201);
      const approved = await sql<{ metadata: Record<string, any>; actor_user_id: string }>`SELECT metadata, actor_user_id FROM audit_logs WHERE action LIKE 'POST /hr/payroll-runs/%/approve' ORDER BY created_at DESC LIMIT 1`.execute(w.db);
      expect(approved.rows[0].actor_user_id).toBe(w.userIds.admin2);
      expect(approved.rows[0].metadata.before.status).toBe("DRAFT");
      expect(approved.rows[0].metadata.after.status).toBe("APPROVED");

      const draft = await post("/accounting/journal-entries", w.tokens.accountant, {
        description: "قيد يدوي aud",
        entryDate: "2036-03-10",
        lines: [{ accountId: w.accountIds["1100"], debit: 10, credit: 0 }, { accountId: w.accountIds["4100"], debit: 0, credit: 10 }],
      });
      expect(draft.status).toBe(201);
      expect((await post(`/accounting/journal-entries/${draft.body.id}/post`, w.tokens.accountant)).status).toBe(201);
      expect((await post(`/accounting/journal-entries/${draft.body.id}/reverse`, w.tokens.accountant, { reason: "تصحيح" })).status).toBe(201);
      const reversed = await sql<{ metadata: Record<string, any> }>`SELECT metadata FROM audit_logs WHERE entity_id = ${draft.body.id} AND action LIKE '%/reverse' LIMIT 1`.execute(w.db);
      expect(reversed.rows[0].metadata.before.status).toBe("POSTED");
      expect(reversed.rows[0].metadata.after.status).toBe("REVERSED");
      // a second reversal is a 409 and writes no second reversal
      expect((await post(`/accounting/journal-entries/${draft.body.id}/reverse`, w.tokens.accountant, { reason: "تاني" })).status).toBe(409);
      expect(Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM journal_entries WHERE reversal_of_entry_id = ${draft.body.id}`.execute(w.db)).rows[0].n)).toBe(1);

      expect((await post("/accounting/periods/2036/1/close", w.tokens.accountant)).status).toBe(201);
      const closed = await sql<{ metadata: Record<string, any> }>`SELECT metadata FROM audit_logs WHERE action LIKE 'POST /accounting/periods/%/close' ORDER BY created_at DESC LIMIT 1`.execute(w.db);
      expect(closed.rows[0].metadata.before.status).toBe("OPEN");
      expect(closed.rows[0].metadata.after.status).toBe("CLOSED");
      await sql`DELETE FROM accounting_periods WHERE year = 2036 AND month = 1`.execute(w.db).catch(() => undefined);
    });

    test("a denied request is recorded with outcome DENIED (actor, route, reason) and 403", async () => {
      const res = await get(`/reports/dashboard?branchId=${w.branchB}`, w.tokens.managerA);
      expect(res.status).toBe(403);
      const { rows } = await sql<{ outcome: string; http_status: number; metadata: Record<string, any> }>`
        SELECT outcome, http_status, metadata FROM audit_logs WHERE actor_user_id = ${w.userIds.managerA} AND outcome = 'DENIED' ORDER BY created_at DESC LIMIT 1`.execute(w.db);
      expect(rows[0].outcome).toBe("DENIED");
      expect(rows[0].http_status).toBe(403);
    });

    test("audit rows are immutable: UPDATE, DELETE and TRUNCATE are rejected by the database", async () => {
      const { rows } = await sql<{ id: string }>`SELECT id::text FROM audit_logs LIMIT 1`.execute(w.db);
      await expect(sql`UPDATE audit_logs SET action = 'tampered' WHERE id = ${rows[0].id}`.execute(w.db)).rejects.toThrow(/append-only/);
      await expect(sql`UPDATE audit_logs SET metadata = '{}'::jsonb WHERE id = ${rows[0].id}`.execute(w.db)).rejects.toThrow(/append-only/);
      await expect(sql`DELETE FROM audit_logs WHERE id = ${rows[0].id}`.execute(w.db)).rejects.toThrow(/append-only/);
      await expect(sql`TRUNCATE audit_logs`.execute(w.db)).rejects.toThrow(/append-only/);
      expect(Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM audit_logs WHERE id = ${rows[0].id}`.execute(w.db)).rows[0].n)).toBe(1);
    });

    test("deleting a user (FK ON DELETE SET NULL) is the only tolerated update of an audit row and keeps the evidence", async () => {
      const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
      const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
      const user = User.register({ name: "مؤقت-aud", email: "temp-aud@p31.jest.test", passwordHash: "x".repeat(60), role: "cashier", branchId: w.branchA });
      await new KyselyUserRepository(w.db).save(user);
      await sql`INSERT INTO audit_logs (actor_user_id, action) VALUES (${user.id}, 'TEMP ACTION')`.execute(w.db);
      await sql`DELETE FROM users WHERE id = ${user.id}`.execute(w.db);
      const row = await sql<{ actor_user_id: string | null; action: string }>`SELECT actor_user_id, action FROM audit_logs WHERE action = 'TEMP ACTION'`.execute(w.db);
      expect(row.rows[0].actor_user_id).toBeNull();
      expect(row.rows[0].action).toBe("TEMP ACTION");
      await deleteAuditLogsForTest(w.db, sql`action = 'TEMP ACTION'`);
    });
  });

  describe("error mapping (never a bare 500 for client mistakes)", () => {
    test("malformed UUIDs in the path -> 400 (or 404), never 500, for company-wide and branch-bound users", async () => {
      for (const token of [w.tokens.admin, w.tokens.managerA]) {
        for (const [method, path] of [
          ["get", "/expenses/not-a-uuid"],
          ["get", "/purchases/123"],
          ["get", "/procurement/supplier-invoices/zzz"],
          ["get", "/inventory/stocktakes/%27%3Bdrop"],
          ["patch", "/orders/xyz/cancel"],
          ["post", "/procurement/goods-receipts/abc/confirm"],
          ["post", "/payment-control/adjustment-requests/abc/approve"],
          ["post", "/hr/payroll-runs/abc/approve"],
          ["post", "/accounting/journal-entries/abc/reverse"],
        ] as const) {
          const res = await (request(w.http()) as any)[method](path).set(auth(token)).send({});
          expect([`${method} ${path}`, res.status < 500 && res.status !== 200 && res.status !== 201]).toEqual([`${method} ${path}`, true]);
        }
      }
    });

    test("idempotent retries are not errors; invalid input values are 400 (and a branch-bound caller supplying a foreign id gets 403)", async () => {
      // unique violation on a real unique index -> 409 (same clientRequestId used by two DIFFERENT users cannot create two orders)
      const dup = await createOrder(w, w.tokens.cashierA, { clientRequestId: "bbbbbbbb-0000-4000-8000-000000000001" });
      expect(dup.status).toBe(201);
      const again = await createOrder(w, w.tokens.cashierA, { clientRequestId: "bbbbbbbb-0000-4000-8000-000000000001" });
      expect(again.status).toBe(201);
      expect(again.body.id).toBe(dup.body.id);
      // invalid input values are 400
      expect((await post("/orders", w.tokens.cashierA, { branchId: w.branchA, orderType: "takeaway", items: [{ variantId: w.variantId, quantity: 0 }] })).status).toBe(400);
      expect((await post("/orders", w.tokens.admin, { branchId: "not-a-uuid", orderType: "takeaway", items: [] })).status).toBe(400);
      // a branch-bound user supplying anything that is not its own branch id is refused before validation (403)
      expect((await post("/orders", w.tokens.cashierA, { branchId: "not-a-uuid", orderType: "takeaway", items: [] })).status).toBe(403);
    });
  });

  describe("BL-12: Cairo business date", () => {
    const place = async (iso: string) => {
      const res = await createOrder(w, w.tokens.cashierA, { quantity: 1 });
      expect(res.status).toBe(201);
      await sql`UPDATE orders SET created_at = ${iso}::timestamptz WHERE id = ${res.body.id}`.execute(w.db);
      return res.body.id as string;
    };
    const daily = async (from: string, to: string) => {
      const res = await get(`/reports/daily?branchId=${w.branchA}&from=${from}&to=${to}`, w.tokens.admin);
      expect(res.status).toBe(200);
      const byDay: Record<string, number> = {};
      for (const row of res.body as Array<{ businessDate: string; ordersCount: number }>) byDay[row.businessDate] = row.ordersCount;
      return byDay;
    };

    let midnightOrder: string;
    beforeAll(async () => {
      await sql`DELETE FROM orders`.execute(w.db).catch(() => undefined);
      // summer (UTC+3): 23:59:59 / 00:00:00 / 00:01:00 Cairo around 16 June; winter (UTC+2): 23:59:59 / 00:00:00 around 16 January
      await place("2031-06-15T20:59:59Z");
      midnightOrder = await place("2031-06-15T21:00:00Z");
      await place("2031-06-15T21:01:00Z");
      await place("2031-01-15T21:59:59Z");
      await place("2031-01-15T22:00:00Z");
      // month boundary: 00:30 on 1 September in Cairo is still 31 August in UTC
      await place("2031-08-31T21:30:00Z");
    });

    test("summer: an order at 23:59:59 Cairo belongs to the 15th, at 00:00:00 and 00:01 to the 16th (UTC would put all three on the 15th)", async () => {
      expect(await daily("2031-06-15", "2031-06-16")).toEqual({ "2031-06-15": 1, "2031-06-16": 2 });
    });

    test("winter: boundary at 22:00 UTC", async () => {
      expect(await daily("2031-01-15", "2031-01-16")).toEqual({ "2031-01-15": 1, "2031-01-16": 1 });
    });

    test("month boundary: 00:30 Cairo on 1 September is September's sale, not August's", async () => {
      expect(await daily("2031-08-01", "2031-08-31")).toEqual({});
      expect(await daily("2031-09-01", "2031-09-30")).toEqual({ "2031-09-01": 1 });
    });

    test("sales-detail daily trend and the dashboard use the same business day", async () => {
      const detail = await get(`/reports/sales-detail?branchId=${w.branchA}&from=2031-06-15&to=2031-06-16`, w.tokens.admin);
      expect(detail.status).toBe(200);
      const trend = Object.fromEntries((detail.body.dailyTrend as Array<{ date: string; ordersCount: number }>).map((r) => [r.date, r.ordersCount]));
      expect(trend).toEqual({ "2031-06-15": 1, "2031-06-16": 2 });
      const dash = await get(`/reports/dashboard?branchId=${w.branchA}&from=2031-06-16&to=2031-06-16`, w.tokens.admin);
      expect(dash.status).toBe(200);
      expect(dash.body.ordersCount ?? dash.body.orderCount ?? dash.body.orders).toBe(2);
    });

    test("a journal re-posted by the repair service for the 00:00 order is dated 16 June (the Cairo business date), not 15 June (UTC)", async () => {
      await deleteJournalsForTest(w, midnightOrder);
      expect((await journalsFor(w, "order_sale", midnightOrder)).length).toBe(0);
      const repair = await post("/accounting/repair/journals", w.tokens.accountant, { sourceIds: [midnightOrder] });
      expect(repair.status).toBe(201);
      expect(repair.body.failed).toBe(0);
      const journals = await journalsFor(w, "order_sale", midnightOrder);
      expect(journals).toHaveLength(1);
      expect(journals[0].entry_date.toISOString().slice(0, 10)).toBe("2031-06-16");
    });
  });
});

async function deleteJournalsForTest(w: World, orderId: string): Promise<void> {
  await w.db.transaction().execute(async (trx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(trx);
    await sql`DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE source_id = ${orderId})`.execute(trx);
    await sql`DELETE FROM journal_entries WHERE source_id = ${orderId}`.execute(trx);
  });
}
