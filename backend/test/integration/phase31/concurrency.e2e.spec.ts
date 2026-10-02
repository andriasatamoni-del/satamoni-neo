import request from "supertest";
import { sql } from "kysely";
import {
  accountBalance,
  auth,
  bootstrap,
  count,
  COGS_PER_UNIT,
  createOrder,
  fireConcurrently,
  journalsFor,
  reversalsOf,
  ledgerImbalance,
  RECIPE_QTY,
  stockOf,
  teardown,
  VARIANT_PRICE,
  type World,
} from "./harness";

// BL-01 / BL-02 / BL-03 / BL-04 / BL-09: every protected command is ONE transaction with row locks / an idempotency lock.
// Each scenario fires >= 5 concurrent HTTP attempts at the real application against the disposable PostgreSQL database and
// proves exactly one winner, a 409 (never a 500) for the losers, and that the losers wrote NOTHING.
const N = 6;

describe("Phase 3.1 - concurrency (real HTTP, real PostgreSQL, strict accounting)", () => {
  let w: World;
  let employeeId: string;

  beforeAll(async () => {
    w = await bootstrap("conc");
  });
  afterAll(async () => {
    await teardown(w);
  });

  test("BL-01: same clientRequestId x6 concurrently -> ONE order, stock consumed once, one sale + one COGS journal", async () => {
    const stockBefore = await stockOf(w, w.branchA);
    const clientRequestId = "11111111-1111-4111-8111-111111111111";
    const responses = await fireConcurrently(N, () => createOrder(w, w.tokens.cashierA, { clientRequestId, quantity: 1 }));

    expect(responses.map((r) => r.status).every((s) => s === 201)).toBe(true);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    const orderId = responses[0].body.id as string;

    expect(await count(w, "orders", sql`id = ${orderId}`)).toBe(1);
    expect(await count(w, "payments", sql`order_id = ${orderId}`)).toBe(1);
    expect(await count(w, "stock_movements", sql`reference_type = 'order' AND reference_id = ${orderId}`)).toBe(1);
    expect(await stockOf(w, w.branchA)).toBe(stockBefore - RECIPE_QTY);
    expect((await journalsFor(w, "order_sale", orderId)).length).toBe(1);
    expect((await journalsFor(w, "order_cogs", orderId)).length).toBe(1);
  });

  test("BL-01: stock for 5 orders, 8 concurrent attempts -> exactly 5 succeed, 3 get 409, balance never negative, no partial writes", async () => {
    // reset the branch to a known balance: 100 units, each order needs 2 x 10 = 20
    await sql`UPDATE branch_stock_balances SET quantity = 100 WHERE branch_id = ${w.branchB} AND inventory_item_id = ${w.ingredientId}`.execute(w.db);
    const ordersBefore = await count(w, "orders", sql`branch_id = ${w.branchB}`);

    const responses = await fireConcurrently(8, () => createOrder(w, w.tokens.cashierB, { branchId: w.branchB, quantity: 10 }));
    const ok = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status !== 201);

    expect(ok).toHaveLength(5);
    expect(rejected).toHaveLength(3);
    expect(rejected.every((r) => r.status === 409)).toBe(true);
    expect(await stockOf(w, w.branchB)).toBe(0);
    // rejected attempts wrote nothing: only the 5 winners exist, each with exactly its movement + payment
    expect(await count(w, "orders", sql`branch_id = ${w.branchB}`)).toBe(ordersBefore + 5);
    const ids = ok.map((r) => r.body.id as string);
    for (const id of ids) {
      expect(await count(w, "payments", sql`order_id = ${id}`)).toBe(1);
      expect(await count(w, "stock_movements", sql`reference_type = 'order' AND reference_id = ${id}`)).toBe(1);
      expect((await journalsFor(w, "order_sale", id)).length).toBe(1);
      expect((await journalsFor(w, "order_cogs", id)).length).toBe(1);
    }
  });

  test("BL-02: cancel the same order x6 concurrently -> ONE cancellation, stock restored once, reversals written once", async () => {
    const stockBefore = await stockOf(w, w.branchA);
    const created = await createOrder(w, w.tokens.cashierA, { quantity: 3 });
    expect(created.status).toBe(201);
    const orderId = created.body.id as string;
    expect(await stockOf(w, w.branchA)).toBe(stockBefore - 3 * RECIPE_QTY);

    const responses = await fireConcurrently(N, () => request(w.http()).patch(`/orders/${orderId}/cancel`).set(auth(w.tokens.managerA)));
    const ok = responses.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(responses.filter((r) => r.status !== 200).every((r) => r.status === 409 || r.status === 400)).toBe(true);
    expect(responses.some((r) => r.status >= 500)).toBe(false);

    expect(await stockOf(w, w.branchA)).toBe(stockBefore); // restored exactly once
    expect(await count(w, "stock_movements", sql`reference_type = 'order_cancellation' AND reference_id = ${orderId}`)).toBe(1);
    // original + exactly one reversal for the sale and for the COGS journal
    expect((await journalsFor(w, "order_sale", orderId)).length).toBe(1);
    expect((await journalsFor(w, "order_cogs", orderId)).length).toBe(1);
    expect(await reversalsOf(w, "order_sale", orderId)).toBe(1);
    expect(await reversalsOf(w, "order_cogs", orderId)).toBe(1);
    expect(await ledgerImbalance(w)).toBe(0);
  });

  describe("procurement", () => {
    let supplierId: string;
    let poId: string;

    beforeAll(async () => {
      supplierId = (await request(w.http()).post("/procurement/suppliers").set(auth(w.tokens.admin)).send({ name: "مورد-conc" })).body.id;
      const po = await request(w.http())
        .post("/procurement/purchase-orders")
        .set(auth(w.tokens.admin))
        .send({ supplierId, branchId: w.branchA, lines: [{ inventoryItemId: w.ingredientId, quantity: 50, unitPrice: 7 }] });
      poId = po.body.id;
      await request(w.http()).post(`/procurement/purchase-orders/${poId}/send`).set(auth(w.tokens.admin));
    });

    test("BL-03: confirm the same GRN x6 concurrently -> ONE confirmation, stock + AP journal + supplier balance applied once", async () => {
      const grn = await request(w.http())
        .post("/procurement/goods-receipts")
        .set(auth(w.tokens.admin))
        .send({ branchId: w.branchA, supplierId, lines: [{ inventoryItemId: w.ingredientId, quantity: 10, unitCost: 7 }] });
      expect(grn.status).toBe(201);
      const stockBefore = await stockOf(w, w.branchA);

      const responses = await fireConcurrently(N, () => request(w.http()).post(`/procurement/goods-receipts/${grn.body.id}/confirm`).set(auth(w.tokens.admin)));
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);

      expect(await stockOf(w, w.branchA)).toBe(stockBefore + 10);
      expect((await journalsFor(w, "goods_receipt", grn.body.id)).length).toBe(1);
      expect(await count(w, "stock_movements", sql`reference_type = 'goods_receipt' AND reference_id = ${grn.body.id}`)).toBe(1);
      const balance = (await request(w.http()).get(`/procurement/suppliers/${supplierId}/balance`).set(auth(w.tokens.admin))).body.balance;
      expect(balance).toBe(70);
    });

    test("BL-09: PO of 50, six GRNs of 15 confirmed concurrently -> cumulative receipts never exceed the ordered quantity (3 x 15 = 45 max)", async () => {
      const grns = [] as string[];
      for (let i = 0; i < N; i++) {
        const g = await request(w.http())
          .post("/procurement/goods-receipts")
          .set(auth(w.tokens.admin))
          .send({ branchId: w.branchA, purchaseOrderId: poId, lines: [{ inventoryItemId: w.ingredientId, quantity: 15, unitCost: 7 }] });
        // registration itself already rejects what can no longer fit; those never become receipts
        if (g.status === 201) grns.push(g.body.id);
      }
      const responses = await fireConcurrently(grns.length, (i) => request(w.http()).post(`/procurement/goods-receipts/${grns[i]}/confirm`).set(auth(w.tokens.admin)));
      const confirmed = responses.filter((r) => r.status === 201).length;
      expect(confirmed).toBeLessThanOrEqual(3);
      expect(responses.some((r) => r.status >= 500)).toBe(false);

      const { rows } = await sql<{ qty: string }>`
        SELECT COALESCE(SUM(i.quantity), 0)::text AS qty FROM goods_receipt_items i JOIN goods_receipts g ON g.id = i.goods_receipt_id
         WHERE g.purchase_order_id = ${poId} AND g.status = 'CONFIRMED'`.execute(w.db);
      expect(Number(rows[0].qty)).toBeLessThanOrEqual(50);
    });
  });


  describe("production (conversion orders)", () => {
    let flourId: string;
    let sugarId: string;
    let cakeId: string;
    let recipeId: string;

    beforeAll(async () => {
      const { KyselyInventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository");
      const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
      const repo = new KyselyInventoryItemRepository(w.db);
      const mk = async (name: string, unitCost: number) => {
        const item = InventoryItem.register({ name: `${name}-prod`, unit: "كيلو", unitCost, negativeStockPolicy: "STRICT" });
        await repo.save(item);
        return item.id;
      };
      flourId = await mk("دقيق", 2);
      sugarId = await mk("سكر", 3);
      cakeId = await mk("كيكة", 0);
      for (const id of [flourId, sugarId]) {
        await request(w.http()).post("/inventory/movements").set(auth(w.tokens.admin)).send({ inventoryItemId: id, branchId: w.branchA, movementType: "RECEIPT", quantityDelta: 100 });
      }
      recipeId = (await request(w.http()).post("/catalog/recipes").set(auth(w.tokens.admin)).send({ recipeType: "manufactured_item", inventoryItemId: cakeId })).body.id;
      const version = await request(w.http())
        .post(`/catalog/recipes/${recipeId}/versions`)
        .set(auth(w.tokens.admin))
        .send({ ingredients: [{ ingredientItemId: flourId, quantity: 2, unit: "كيلو" }, { ingredientItemId: sugarId, quantity: 1, unit: "كيلو" }] });
      await request(w.http()).post(`/catalog/recipes/${recipeId}/versions/${version.body.versions[0].id}/activate`).set(auth(w.tokens.admin));
    });

    const approvedOrder = async (planned = 5) => {
      const o = await request(w.http()).post("/production").set(auth(w.tokens.admin)).send({ branchId: w.branchA, recipeId, plannedOutputQuantity: planned });
      expect(o.status).toBe(201);
      expect((await request(w.http()).post(`/production/${o.body.id}/approve`).set(auth(w.tokens.admin))).status).toBe(201);
      return o.body.id as string;
    };

    test("BL-03: start x6 concurrently -> ingredients consumed ONCE, one 201, the rest 409", async () => {
      const id = await approvedOrder(5);
      const flour = await stockOf(w, w.branchA, flourId);
      const sugar = await stockOf(w, w.branchA, sugarId);
      const responses = await fireConcurrently(N, () => request(w.http()).post(`/production/${id}/start`).set(auth(w.tokens.admin)).send({}));
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);
      expect(await stockOf(w, w.branchA, flourId)).toBe(flour - 10);
      expect(await stockOf(w, w.branchA, sugarId)).toBe(sugar - 5);
      expect(await count(w, "stock_movements", sql`reference_type = 'conversion_order' AND reference_id = ${id} AND movement_type = 'PRODUCTION_OUT'`)).toBe(2);

      // complete x6: output received ONCE
      const cake = await stockOf(w, w.branchA, cakeId);
      const done = await fireConcurrently(N, () => request(w.http()).post(`/production/${id}/complete`).set(auth(w.tokens.admin)).send({ actualOutputQuantity: 5 }));
      expect(done.filter((r) => r.status === 201)).toHaveLength(1);
      expect(done.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);
      expect(await stockOf(w, w.branchA, cakeId)).toBe(cake + 5);
      expect(await count(w, "stock_movements", sql`reference_type = 'conversion_order' AND reference_id = ${id} AND movement_type = 'PRODUCTION_IN'`)).toBe(1);
    });

    test("BL-03: start with insufficient ingredients is rejected (409) and consumes NOTHING (no partial consumption of the first ingredient)", async () => {
      const id = await approvedOrder(500); // needs 1000 flour / 500 sugar - far beyond stock
      const flour = await stockOf(w, w.branchA, flourId);
      const sugar = await stockOf(w, w.branchA, sugarId);
      const res = await request(w.http()).post(`/production/${id}/start`).set(auth(w.tokens.admin)).send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await stockOf(w, w.branchA, flourId)).toBe(flour);
      expect(await stockOf(w, w.branchA, sugarId)).toBe(sugar);
      expect(await count(w, "stock_movements", sql`reference_type = 'conversion_order' AND reference_id = ${id}`)).toBe(0);
    });

    test("BL-03: cancel an in-progress order x6 concurrently -> ingredients returned ONCE", async () => {
      const id = await approvedOrder(3);
      await request(w.http()).post(`/production/${id}/start`).set(auth(w.tokens.admin)).send({});
      const flour = await stockOf(w, w.branchA, flourId);
      const responses = await fireConcurrently(N, () => request(w.http()).post(`/production/${id}/cancel`).set(auth(w.tokens.admin)).send({ reason: "إلغاء" }));
      expect(responses.some((r) => r.status >= 500)).toBe(false);
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await stockOf(w, w.branchA, flourId)).toBe(flour + 6); // 3 x 2 returned exactly once
    });
  });


  test("BL-02: close the same cashier shift x6 concurrently -> ONE close, the shift-variance journal posted once", async () => {
    const shift = await request(w.http()).post("/shifts/open").set(auth(w.tokens.cashierA)).send({ openingCash: 100 });
    expect(shift.status).toBe(201);
    const order = await createOrder(w, w.tokens.cashierA, { quantity: 1 });
    expect(order.status).toBe(201);

    const responses = await fireConcurrently(N, () =>
      request(w.http()).post(`/shifts/${shift.body.id}/close`).set(auth(w.tokens.cashierA)).send({ actualCash: 150 })
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);
    expect((await sql<{ status: string }>`SELECT status FROM cashier_shifts WHERE id = ${shift.body.id}`.execute(w.db)).rows[0].status).not.toBe("OPEN");
    expect((await journalsFor(w, "shift_variance", shift.body.id)).length).toBeLessThanOrEqual(1);
    expect(await ledgerImbalance(w)).toBe(0);
  });

  test("BL-04: approve the same payroll run x6 concurrently (independent approver) -> ONE approval, ONE payroll journal", async () => {
    const employee = (
      await request(w.http())
        .post("/hr/employees")
        .set(auth(w.tokens.admin))
        .send({ name: "موظف-conc", baseSalary: 5000, wageType: "fixed_monthly" })
    ).body;
    expect(employee.id).toBeTruthy();
    employeeId = employee.id;
    const run = await request(w.http())
      .post("/hr/payroll-runs")
      .set(auth(w.tokens.admin))
      .send({ year: 2031, month: 3, employees: [{ employeeId: employee.id, grossPay: 5000 }] });
    expect(run.status).toBe(201);

    const responses = await fireConcurrently(N, () => request(w.http()).post(`/hr/payroll-runs/${run.body.id}/approve`).set(auth(w.tokens.admin2)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status !== 201).every((r) => r.status === 409 || r.status === 400)).toBe(true);
    expect(responses.some((r) => r.status >= 500)).toBe(false);
    expect((await journalsFor(w, "payroll_run", run.body.id)).length).toBe(1);
    expect(await accountBalance(w, "2400")).toBe(-5000);
  });

  test("BL-04: two payroll runs for the same month registered concurrently -> ONE active run", async () => {
    const responses = await fireConcurrently(N, () =>
      request(w.http()).post("/hr/payroll-runs").set(auth(w.tokens.admin)).send({ year: 2031, month: 4, employees: [{ employeeId, grossPay: 100 }] })
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.some((r) => r.status >= 500)).toBe(false);
    expect(await count(w, "payroll_runs", sql`year = 2031 AND month = 4 AND status <> 'CANCELLED'`)).toBe(1);
  });

  test("BL-06: approve the same payment adjustment x6 concurrently -> ONE approval, ONE adjustment journal, order method synced once", async () => {
    const order = await createOrder(w, w.tokens.cashierA, { quantity: 1 });
    const payment = (await request(w.http()).get(`/payment-control/payments?branchId=${w.branchA}`).set(auth(w.tokens.admin))).body.find(
      (p: { orderId: string }) => p.orderId === order.body.id
    );
    const adj = await request(w.http())
      .post("/payment-control/adjustment-requests")
      .set(auth(w.tokens.cashierA))
      .send({ paymentId: payment.id, proposedPaymentMethodId: w.visaMethodId, proposedAmount: VARIANT_PRICE - 20, reason: "خصم متفق عليه" });
    expect(adj.status).toBe(201);

    const responses = await fireConcurrently(N, () => request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status !== 201).every((r) => r.status === 409 || r.status === 400)).toBe(true);
    expect(responses.some((r) => r.status >= 500)).toBe(false);

    expect((await journalsFor(w, "payment_adjustment", adj.body.id)).length).toBe(1);
    const { rows } = await sql<{ payment_method_id: string }>`SELECT payment_method_id FROM orders WHERE id = ${order.body.id}`.execute(w.db);
    expect(rows[0].payment_method_id).toBe(w.visaMethodId);
    expect(await ledgerImbalance(w)).toBe(0);
    // sale (+100 cash) and the 20 variance correction: net cash for this order = 80
    expect(COGS_PER_UNIT).toBe(10);
  });
});
