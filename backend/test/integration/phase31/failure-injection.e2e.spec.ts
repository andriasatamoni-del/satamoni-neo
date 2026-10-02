import { randomUUID } from "node:crypto";
import request from "supertest";
import { sql } from "kysely";
import {
  accountBalance,
  auth,
  bootstrap,
  count,
  createOrder,
  injectInsertFailure,
  journalsFor,
  ledgerImbalance,
  orderWriteFootprint,
  stockOf,
  teardown,
  type World,
} from "./harness";

// BL-01 / BL-03 / BL-04 / BL-06 / BL-08: a failure in ANY step of a business command (stock movement, payment lock, journal posting,
// missing chart of accounts) rolls back the WHOLE command - no order without payment/stock/journal, no journal without its business
// event - and a client retry afterwards succeeds exactly once. Failures are injected with test-only triggers on the disposable DB.
describe("Phase 3.1 - failure injection & recovery (strict accounting)", () => {
  let w: World;
  let supplierId: string;

  beforeAll(async () => {
    w = await bootstrap("fail");
    supplierId = (await request(w.http()).post("/procurement/suppliers").set(auth(w.tokens.admin)).send({ name: "مورد-fail" })).body.id;
  });
  afterAll(async () => {
    await teardown(w);
  });

  describe.each([
    ["stock_movements", "stock movement"],
    ["payments", "payment lock"],
    ["journal_entries", "sale / COGS journal"],
  ] as const)("order registration - failure while writing the %s (%s)", (table: "stock_movements" | "payments" | "journal_entries", _label: string) => {
    test("nothing is persisted, the API answers 5xx (not a partial success), and a retry with the same clientRequestId succeeds once", async () => {
      const clientRequestId = randomUUID();
      const before = await orderWriteFootprint(w);
      const remove = await injectInsertFailure(w, table);
      let failed;
      try {
        failed = await createOrder(w, w.tokens.cashierA, { quantity: 2, clientRequestId });
      } finally {
        await remove();
      }
      expect(failed.status).toBeGreaterThanOrEqual(500);

      expect(await orderWriteFootprint(w)).toEqual(before); // ZERO writes anywhere

      const retry = await createOrder(w, w.tokens.cashierA, { quantity: 2, clientRequestId });
      expect(retry.status).toBe(201);
      const again = await createOrder(w, w.tokens.cashierA, { quantity: 2, clientRequestId });
      expect(again.status).toBe(201);
      expect(again.body.id).toBe(retry.body.id);
      expect(await count(w, "orders", sql`id = ${retry.body.id}`)).toBe(1);
      expect((await journalsFor(w, "order_sale", retry.body.id)).length).toBe(1);
      expect((await journalsFor(w, "order_cogs", retry.body.id)).length).toBe(1);
      expect(await stockOf(w, w.branchA)).toBe(before.stockA - 4);
    });
  });

  test("goods receipt confirmation: journal failure rolls back stock + movement; the receipt stays DRAFT and can be confirmed afterwards", async () => {
    const grn = await request(w.http())
      .post("/procurement/goods-receipts")
      .set(auth(w.tokens.admin))
      .send({ branchId: w.branchA, supplierId, lines: [{ inventoryItemId: w.ingredientId, quantity: 7, unitCost: 6 }] });
    expect(grn.status).toBe(201);
    const stock = await stockOf(w, w.branchA);

    const remove = await injectInsertFailure(w, "journal_entries");
    let failed;
    try {
      failed = await request(w.http()).post(`/procurement/goods-receipts/${grn.body.id}/confirm`).set(auth(w.tokens.admin));
    } finally {
      await remove();
    }
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(await stockOf(w, w.branchA)).toBe(stock);
    expect(await count(w, "stock_movements", sql`reference_type = 'goods_receipt' AND reference_id = ${grn.body.id}`)).toBe(0);
    const status = await sql<{ status: string }>`SELECT status FROM goods_receipts WHERE id = ${grn.body.id}`.execute(w.db);
    expect(status.rows[0].status).toBe("DRAFT");

    const ok = await request(w.http()).post(`/procurement/goods-receipts/${grn.body.id}/confirm`).set(auth(w.tokens.admin));
    expect(ok.status).toBe(201);
    expect(await stockOf(w, w.branchA)).toBe(stock + 7);
    expect((await journalsFor(w, "goods_receipt", grn.body.id)).length).toBe(1);
  });

  test("payroll approval: journal failure keeps the run DRAFT (no approved run without its journal), retry approves it once", async () => {
    const employee = (await request(w.http()).post("/hr/employees").set(auth(w.tokens.admin)).send({ name: "موظف-fail", baseSalary: 3000, wageType: "fixed_monthly" })).body;
    const run = await request(w.http()).post("/hr/payroll-runs").set(auth(w.tokens.admin)).send({ year: 2032, month: 1, employees: [{ employeeId: employee.id, grossPay: 3000 }] });
    expect(run.status).toBe(201);

    const remove = await injectInsertFailure(w, "journal_entries");
    let failed;
    try {
      failed = await request(w.http()).post(`/hr/payroll-runs/${run.body.id}/approve`).set(auth(w.tokens.admin2));
    } finally {
      await remove();
    }
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect((await sql<{ status: string }>`SELECT status FROM payroll_runs WHERE id = ${run.body.id}`.execute(w.db)).rows[0].status).toBe("DRAFT");
    expect((await journalsFor(w, "payroll_run", run.body.id)).length).toBe(0);

    const ok = await request(w.http()).post(`/hr/payroll-runs/${run.body.id}/approve`).set(auth(w.tokens.admin2));
    expect(ok.status).toBe(201);
    expect((await journalsFor(w, "payroll_run", run.body.id)).length).toBe(1);
  });

  test("payment adjustment approval: journal failure leaves the request PENDING and the order's payment method unchanged", async () => {
    const order = await createOrder(w, w.tokens.cashierA);
    const payment = (await request(w.http()).get(`/payment-control/payments?branchId=${w.branchA}`).set(auth(w.tokens.admin))).body.find(
      (p: { orderId: string }) => p.orderId === order.body.id
    );
    const adj = await request(w.http())
      .post("/payment-control/adjustment-requests")
      .set(auth(w.tokens.cashierA))
      .send({ paymentId: payment.id, proposedPaymentMethodId: w.visaMethodId, proposedAmount: 90, reason: "فرق" });
    expect(adj.status).toBe(201);

    const remove = await injectInsertFailure(w, "journal_entries");
    let failed;
    try {
      failed = await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin));
    } finally {
      await remove();
    }
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect((await sql<{ status: string }>`SELECT status FROM payment_adjustment_requests WHERE id = ${adj.body.id}`.execute(w.db)).rows[0].status).toBe("PENDING");
    expect((await sql<{ payment_method_id: string }>`SELECT payment_method_id FROM orders WHERE id = ${order.body.id}`.execute(w.db)).rows[0].payment_method_id).toBe(w.cashMethodId);

    const ok = await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin));
    expect(ok.status).toBe(201);
    expect((await journalsFor(w, "payment_adjustment", adj.body.id)).length).toBe(1);
  });

  test("audit trail is fail-closed: if the audit row can not be written the whole mutating request rolls back", async () => {
    const before = await orderWriteFootprint(w);
    const remove = await injectInsertFailure(w, "audit_logs");
    let failed;
    try {
      failed = await createOrder(w, w.tokens.cashierA);
    } finally {
      await remove();
    }
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(await orderWriteFootprint(w)).toEqual(before);
  });

  describe("missing chart of accounts", () => {
    test("STRICT: the order is rejected with 503 + a clear message, nothing is written, readiness reports the missing code; restoring the account fixes it", async () => {
      await sql`UPDATE accounts SET code = '5100-off' WHERE code = '5100'`.execute(w.db);
      try {
        const before = await orderWriteFootprint(w);
        const res = await createOrder(w, w.tokens.cashierA);
        expect(res.status).toBe(503);
        expect(String(res.body.error)).toContain("5100");
        expect(await orderWriteFootprint(w)).toEqual(before);

        const readiness = await request(w.http()).get("/accounting/readiness").set(auth(w.tokens.accountant));
        expect(readiness.status).toBe(200);
        expect(readiness.body.enforcement).toBe("strict");
        expect(readiness.body.ready).toBe(false);
        expect(readiness.body.missing).toContain("5100");
      } finally {
        await sql`UPDATE accounts SET code = '5100' WHERE code = '5100-off'`.execute(w.db);
      }
      const ok = await createOrder(w, w.tokens.cashierA);
      expect(ok.status).toBe(201);
    });

    test("DEFERRED (explicit, reported): the order is accepted, the missing journals are listed, alerted in the Action Center, and an idempotent repair posts them with the ORIGINAL Cairo business date", async () => {
      process.env.ACCOUNTING_ENFORCEMENT = "deferred";
      let orderId: string;
      await sql`UPDATE accounts SET code = code || '-off' WHERE code IN ('4100','5100')`.execute(w.db);
      try {
        const res = await createOrder(w, w.tokens.cashierA, { quantity: 2 });
        expect(res.status).toBe(201);
        orderId = res.body.id;
        expect((await journalsFor(w, "order_sale", orderId)).length).toBe(0);

        const cov = await request(w.http()).get("/accounting/reports/journal-coverage").set(auth(w.tokens.accountant));
        expect(cov.status).toBe(200);
        const mine = cov.body.gaps.filter((g: { sourceId: string }) => g.sourceId === orderId).map((g: { kind: string }) => g.kind).sort();
        expect(mine).toEqual(["order_cogs", "order_sale"]);

        const center = await request(w.http()).get("/reports/action-center").set(auth(w.tokens.admin));
        expect(center.status).toBe(200);
        const types = center.body.alerts.map((a: { type: string }) => a.type);
        expect(types).toContain("MISSING_JOURNALS");
        expect(types).toContain("ACCOUNTING_NOT_CONFIGURED");
      } finally {
        await sql`UPDATE accounts SET code = replace(code, '-off', '') WHERE code LIKE '%-off'`.execute(w.db);
        process.env.ACCOUNTING_ENFORCEMENT = "strict";
      }

      const repair = await request(w.http()).post("/accounting/repair/journals").set(auth(w.tokens.accountant)).send({ sourceIds: [orderId!] });
      expect(repair.status).toBe(201);
      expect(repair.body.posted).toBe(2);
      expect(repair.body.failed).toBe(0);
      expect((await journalsFor(w, "order_sale", orderId!)).length).toBe(1);
      expect((await journalsFor(w, "order_cogs", orderId!)).length).toBe(1);

      // the repost keeps the original Cairo business date of the order
      const orderRow = await sql<{ d: Date }>`SELECT (created_at AT TIME ZONE 'Africa/Cairo')::date AS d FROM orders WHERE id = ${orderId!}`.execute(w.db);
      const journal = await journalsFor(w, "order_sale", orderId!);
      expect(journal[0].entry_date.toISOString().slice(0, 10)).toBe(orderRow.rows[0].d.toISOString().slice(0, 10));

      // idempotent: running it again changes nothing
      const again = await request(w.http()).post("/accounting/repair/journals").set(auth(w.tokens.accountant)).send({ sourceIds: [orderId!] });
      expect(again.status).toBe(201);
      expect(again.body.posted).toBe(0);
      expect((await journalsFor(w, "order_sale", orderId!)).length).toBe(1);
      expect(await ledgerImbalance(w)).toBe(0);
      expect(await accountBalance(w, "4100")).toBeLessThan(0); // revenue is a credit balance
    });

    test("repair requires the accounting.repair permission and company-wide scope", async () => {
      const cashier = await request(w.http()).post("/accounting/repair/journals").set(auth(w.tokens.cashierA)).send({});
      expect(cashier.status).toBe(403);
      const manager = await request(w.http()).post("/accounting/repair/journals").set(auth(w.tokens.managerA)).send({});
      expect(manager.status).toBe(403);
    });
  });
});
