import request from "supertest";
import { sql } from "kysely";
import {
  accountBalance,
  auth,
  bootstrap,
  COGS_PER_UNIT,
  count,
  createOrder,
  journalsFor,
  ledgerImbalance,
  reversalsOf,
  stockOf,
  teardown,
  VARIANT_PRICE,
  INGREDIENT_UNIT_COST,
  RECIPE_QTY,
  type World,
} from "./harness";

// BL-06 (payment adjustments), BL-07 (COGS), BL-10 (payroll cancellation + adjustments <-> runs) and the accounting reconciliation
// invariants: every business fact has exactly the journal(s) it should, reversals mirror originals, the ledger always balances.

/** Net (debit - credit) on an account code produced by the journals of the given (sourceType, sourceId) pairs - reversals included. */
async function netFor(w: World, code: string, sources: Array<[string, string]>): Promise<number> {
  let total = 0;
  for (const [type, id] of sources) {
    const { rows } = await sql<{ n: string | null }>`
      SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS n
        FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journal_entry_id JOIN accounts a ON a.id = l.account_id
       WHERE a.code = ${code} AND j.status IN ('POSTED','REVERSED')
         AND (j.id IN (SELECT id FROM journal_entries WHERE source_type = ${type} AND source_id = ${id})
              OR j.reversal_of_entry_id IN (SELECT id FROM journal_entries WHERE source_type = ${type} AND source_id = ${id}))`.execute(w.db);
    total += Number(rows[0].n ?? 0);
  }
  return total;
}

describe("Phase 3.1 - accounting integrity (COGS, payment adjustments, payroll)", () => {
  let w: World;

  beforeAll(async () => {
    w = await bootstrap("acct");
  });
  afterAll(async () => {
    await teardown(w);
  });

  describe("BL-07: COGS", () => {
    test("a sale posts the revenue journal AND a separate COGS journal from the ACTUAL consumption cost (Dr 5100 / Cr 1400)", async () => {
      const stock = await stockOf(w, w.branchA);
      const res = await createOrder(w, w.tokens.cashierA, { quantity: 3 });
      expect(res.status).toBe(201);
      const id = res.body.id as string;

      expect(await netFor(w, "1100", [["order_sale", id]])).toBe(3 * VARIANT_PRICE);
      expect(await netFor(w, "4100", [["order_sale", id]])).toBe(-3 * VARIANT_PRICE);
      expect(await netFor(w, "5100", [["order_cogs", id]])).toBe(3 * COGS_PER_UNIT);
      expect(await netFor(w, "1400", [["order_cogs", id]])).toBe(-3 * COGS_PER_UNIT);
      expect(await stockOf(w, w.branchA)).toBe(stock - 3 * RECIPE_QTY);
      // the COGS journal is NOT the sale journal (separate source types, one each)
      expect((await journalsFor(w, "order_sale", id)).length).toBe(1);
      expect((await journalsFor(w, "order_cogs", id)).length).toBe(1);
      expect(await ledgerImbalance(w)).toBe(0);
    });

    test("cancellation reverses sale + COGS and restores stock at the ORIGINAL consumption cost even if the item cost changed meanwhile", async () => {
      const stock = await stockOf(w, w.branchA);
      const res = await createOrder(w, w.tokens.cashierA, { quantity: 2 });
      const id = res.body.id as string;
      const cogsBefore = await accountBalance(w, "5100");

      await sql`UPDATE inventory_items SET unit_cost = ${INGREDIENT_UNIT_COST + 4} WHERE id = ${w.ingredientId}`.execute(w.db); // 9 now
      const cancelled = await request(w.http()).patch(`/orders/${id}/cancel`).set(auth(w.tokens.managerA));
      expect(cancelled.status).toBe(200);
      await sql`UPDATE inventory_items SET unit_cost = ${INGREDIENT_UNIT_COST} WHERE id = ${w.ingredientId}`.execute(w.db);

      expect(await stockOf(w, w.branchA)).toBe(stock);
      const restore = await sql<{ unit_cost: string; total_cost: string }>`
        SELECT unit_cost, total_cost FROM stock_movements WHERE reference_type = 'order_cancellation' AND reference_id = ${id}`.execute(w.db);
      expect(Number(restore.rows[0].unit_cost)).toBe(INGREDIENT_UNIT_COST); // original cost, not 9
      expect(await netFor(w, "5100", [["order_cogs", id]])).toBe(0);
      expect(await netFor(w, "1100", [["order_sale", id]])).toBe(0);
      expect(await accountBalance(w, "5100")).toBe(cogsBefore - 2 * COGS_PER_UNIT);
      expect(await ledgerImbalance(w)).toBe(0);
    });

    test("accounting REPORTS net a cancelled order to zero (a REVERSED original stays in the ledger and its mirror cancels it - never counted twice)", async () => {
      const tb = async () => {
        const res = await request(w.http()).get("/accounting/reports/trial-balance").set(auth(w.tokens.accountant));
        expect(res.status).toBe(200);
        const row = (code: string) => res.body.rows.find((r: { code: string }) => r.code === code)?.balance ?? 0;
        return { revenue: row("4100"), cash: row("1100"), cogs: row("5100"), inventory: row("1400"), balanced: res.body.totalDebit === res.body.totalCredit };
      };
      const before = await tb();
      const created = await createOrder(w, w.tokens.cashierA, { quantity: 4 });
      const during = await tb();
      expect(during.revenue).toBe(before.revenue + 4 * VARIANT_PRICE);
      expect((await request(w.http()).patch(`/orders/${created.body.id}/cancel`).set(auth(w.tokens.managerA))).status).toBe(200);
      const after = await tb();
      expect(after).toEqual(before); // revenue, cash, COGS and inventory are back where they were
      expect(after.balanced).toBe(true);

      const today = new Date().toISOString().slice(0, 10);
      const income = await request(w.http()).get(`/accounting/reports/income-statement?from=${today}&to=${today}`).set(auth(w.tokens.accountant));
      expect(income.status).toBe(200);
    });

    test("a variant WITHOUT a recipe consumes nothing and posts no COGS journal (no invented cost)", async () => {
      const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
      const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
      const item = MenuItem.register({ name: "صنف-بدون-وصفة-acct" });
      const variant = item.addVariant({ label: "عادي", price: 40 });
      await new KyselyMenuItemRepository(w.db).save(item);

      const res = await request(w.http())
        .post("/orders")
        .set(auth(w.tokens.cashierA))
        .send({ branchId: w.branchA, orderType: "takeaway", items: [{ variantId: variant.id, quantity: 1 }], paymentMethodId: w.cashMethodId });
      expect(res.status).toBe(201);
      expect((await journalsFor(w, "order_sale", res.body.id)).length).toBe(1);
      expect((await journalsFor(w, "order_cogs", res.body.id)).length).toBe(0);
    });

    test("two ingredients with different costs: COGS = sum(qty x unit cost) of the real movements", async () => {
      const { KyselyInventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository");
      const { KyselyStockMovementRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository");
      const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
      const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
      const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
      const { KyselyRecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository");
      const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
      const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");

      const second = InventoryItem.register({ name: "مكوّن2-acct", unit: "كيلو", unitCost: 3, negativeStockPolicy: "STRICT" });
      await new KyselyInventoryItemRepository(w.db).save(second);
      await new KyselyStockMovementRepository(w.db).recordMovement(
        StockMovement.register({ inventoryItemId: second.id, branchId: w.branchA, movementType: "RECEIPT", quantityDelta: 100 }),
        { allowNegativeBalance: true }
      );
      const item = MenuItem.register({ name: "صنف-مركب-acct" });
      const variant = item.addVariant({ label: "عادي", price: 90 });
      await new KyselyMenuItemRepository(w.db).save(item);
      const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: variant.id });
      const version = recipe.createDraftVersion({});
      recipe.addIngredient(version.id, { ingredientItemId: w.ingredientId, quantity: 1 }); // 1 x 5
      recipe.addIngredient(version.id, { ingredientItemId: second.id, quantity: 4 }); //      4 x 3
      recipe.activateVersion(version.id);
      await new KyselyRecipeRepository(w.db).save(recipe);

      const res = await request(w.http())
        .post("/orders")
        .set(auth(w.tokens.cashierA))
        .send({ branchId: w.branchA, orderType: "takeaway", items: [{ variantId: variant.id, quantity: 2 }], paymentMethodId: w.cashMethodId });
      expect(res.status).toBe(201);
      expect(await netFor(w, "5100", [["order_cogs", res.body.id]])).toBe(2 * (5 + 12));
    });
  });

  describe("BL-06: payment adjustments", () => {
    async function orderWithPayment() {
      const order = await createOrder(w, w.tokens.cashierA);
      const payment = (await request(w.http()).get(`/payment-control/payments?branchId=${w.branchA}`).set(auth(w.tokens.admin))).body.find(
        (p: { orderId: string }) => p.orderId === order.body.id
      );
      return { orderId: order.body.id as string, payment };
    }
    const requestAdjustment = (paymentId: string, body: Record<string, unknown>, token = w.tokens.cashierA) =>
      request(w.http()).post("/payment-control/adjustment-requests").set(auth(token)).send({ paymentId, reason: "اختبار", ...body });

    test("amount DECREASE + method change: posts the correction (Dr 6950 / Cr 1100), keeps before-values, syncs the order, reverses with the order", async () => {
      const { orderId, payment } = await orderWithPayment();
      const adj = await requestAdjustment(payment.id, { proposedAmount: 80, proposedPaymentMethodId: w.visaMethodId });
      expect(adj.status).toBe(201);
      const approved = await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin));
      expect(approved.status).toBe(201);

      expect(await netFor(w, "6950", [["payment_adjustment", adj.body.id]])).toBe(20);
      expect(await netFor(w, "1100", [["payment_adjustment", adj.body.id]])).toBe(-20);
      expect(await netFor(w, "1100", [["order_sale", orderId], ["payment_adjustment", adj.body.id]])).toBe(80); // net cash of the order
      const row = await sql<{ previous_amount: string; previous_payment_method_id: string }>`
        SELECT previous_amount, previous_payment_method_id FROM payment_adjustment_requests WHERE id = ${adj.body.id}`.execute(w.db);
      expect(Number(row.rows[0].previous_amount)).toBe(VARIANT_PRICE);
      expect(row.rows[0].previous_payment_method_id).toBe(w.cashMethodId);
      expect((await sql<{ payment_method_id: string }>`SELECT payment_method_id FROM orders WHERE id = ${orderId}`.execute(w.db)).rows[0].payment_method_id).toBe(w.visaMethodId);

      // cancelling the order reverses the sale, the COGS AND the adjustment correction
      const cancel = await request(w.http()).patch(`/orders/${orderId}/cancel`).set(auth(w.tokens.managerA));
      expect(cancel.status).toBe(200);
      expect(await reversalsOf(w, "payment_adjustment", adj.body.id)).toBe(1);
      expect(await netFor(w, "1100", [["order_sale", orderId], ["payment_adjustment", adj.body.id]])).toBe(0);
      expect(await ledgerImbalance(w)).toBe(0);
    });

    test("amount INCREASE posts the opposite correction (Dr 1100 / Cr 6950)", async () => {
      const { orderId, payment } = await orderWithPayment();
      const adj = await requestAdjustment(payment.id, { proposedAmount: VARIANT_PRICE + 15 });
      await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin));
      expect(await netFor(w, "1100", [["payment_adjustment", adj.body.id]])).toBe(15);
      expect(await netFor(w, "6950", [["payment_adjustment", adj.body.id]])).toBe(-15);
      expect(await netFor(w, "1100", [["order_sale", orderId], ["payment_adjustment", adj.body.id]])).toBe(VARIANT_PRICE + 15);
    });

    test("method-only change has no GL effect (all methods settle through the cash account) but the order's method is synced", async () => {
      const { orderId, payment } = await orderWithPayment();
      const adj = await requestAdjustment(payment.id, { proposedAmount: VARIANT_PRICE, proposedPaymentMethodId: w.visaMethodId });
      const approved = await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin));
      expect(approved.status).toBe(201);
      expect((await journalsFor(w, "payment_adjustment", adj.body.id)).length).toBe(0);
      expect((await sql<{ payment_method_id: string }>`SELECT payment_method_id FROM orders WHERE id = ${orderId}`.execute(w.db)).rows[0].payment_method_id).toBe(w.visaMethodId);
    });

    test("rejected request changes nothing; deciding twice (approve/approve, approve/reject, reject/approve) -> 409", async () => {
      const { orderId, payment } = await orderWithPayment();
      const adj = await requestAdjustment(payment.id, { proposedAmount: 50 });
      const rejected = await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/reject`).set(auth(w.tokens.admin));
      expect(rejected.status).toBe(201);
      expect((await journalsFor(w, "payment_adjustment", adj.body.id)).length).toBe(0);
      expect(await netFor(w, "1100", [["order_sale", orderId]])).toBe(VARIANT_PRICE);
      expect((await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/approve`).set(auth(w.tokens.admin))).status).toBe(409);
      expect((await request(w.http()).post(`/payment-control/adjustment-requests/${adj.body.id}/reject`).set(auth(w.tokens.admin))).status).toBe(409);

      const second = await requestAdjustment(payment.id, { proposedAmount: 60 });
      expect((await request(w.http()).post(`/payment-control/adjustment-requests/${second.body.id}/approve`).set(auth(w.tokens.admin))).status).toBe(201);
      expect((await request(w.http()).post(`/payment-control/adjustment-requests/${second.body.id}/approve`).set(auth(w.tokens.admin))).status).toBe(409);
      expect((await request(w.http()).post(`/payment-control/adjustment-requests/${second.body.id}/reject`).set(auth(w.tokens.admin))).status).toBe(409);
    });

    test("reconciliation: for the orders of a branch, SUM(payment amounts) equals the net cash of the sale + adjustment journals", async () => {
      const { rows: orders } = await sql<{ id: string }>`SELECT id::text FROM orders WHERE branch_id = ${w.branchA} AND status <> 'cancelled'`.execute(w.db);
      const { rows: payments } = await sql<{ total: string }>`
        SELECT COALESCE(SUM(p.amount), 0)::text AS total FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.branch_id = ${w.branchA} AND o.status <> 'cancelled'`.execute(w.db);
      let net = 0;
      for (const o of orders) {
        net += await netFor(w, "1100", [["order_sale", o.id]]);
        const { rows: adjs } = await sql<{ id: string }>`
          SELECT par.id::text FROM payment_adjustment_requests par JOIN payments p ON p.id = par.payment_id WHERE p.order_id = ${o.id} AND par.status = 'APPROVED'`.execute(w.db);
        for (const a of adjs) net += await netFor(w, "1100", [["payment_adjustment", a.id]]);
      }
      expect(net).toBe(Number(payments[0].total));
      expect(await ledgerImbalance(w)).toBe(0);
    });
  });

  describe("BL-10: payroll", () => {
    let employeeId: string;
    const adjust = (type: string, amount: number, entryDate: string) =>
      request(w.http()).post("/hr/adjustments").set(auth(w.tokens.admin)).send({ employeeId, adjustmentType: type, amount, entryDate });
    const registerRun = (year: number, month: number, line: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
      request(w.http())
        .post("/hr/payroll-runs")
        .set(auth(w.tokens.admin))
        .send({ year, month, employees: [{ employeeId, grossPay: 4000, ...line }], ...extra });

    beforeAll(async () => {
      employeeId = (await request(w.http()).post("/hr/employees").set(auth(w.tokens.admin)).send({ name: "موظف-acct", baseSalary: 4000, wageType: "fixed_monthly" })).body.id;
    });

    test("cancelling an APPROVED run reverses its payroll journal exactly once and frees the month", async () => {
      const run = await registerRun(2033, 1);
      expect(run.status).toBe(201);
      expect((await request(w.http()).post(`/hr/payroll-runs/${run.body.id}/approve`).set(auth(w.tokens.admin2))).status).toBe(201);
      expect(await netFor(w, "6100", [["payroll_run", run.body.id]])).toBe(4000);
      expect(await netFor(w, "2400", [["payroll_run", run.body.id]])).toBe(-4000);

      const cancel = await request(w.http()).post(`/hr/payroll-runs/${run.body.id}/cancel`).set(auth(w.tokens.admin2)).send({ reason: "خطأ" });
      expect(cancel.status).toBe(201);
      expect(await reversalsOf(w, "payroll_run", run.body.id)).toBe(1);
      expect(await netFor(w, "6100", [["payroll_run", run.body.id]])).toBe(0);
      expect((await request(w.http()).post(`/hr/payroll-runs/${run.body.id}/cancel`).set(auth(w.tokens.admin2)).send({ reason: "تاني" })).status).toBe(409);
      expect(await reversalsOf(w, "payroll_run", run.body.id)).toBe(1);
      expect((await registerRun(2033, 1)).status).toBe(201); // month is free again
    });

    test("registered adjustments are applied to the run line automatically and LINKED to it (never omitted, never applied twice)", async () => {
      await adjust("advance", 300, "2033-05-10");
      await adjust("penalty", 50, "2033-05-12");
      await adjust("bonus", 100, "2033-05-31"); // last day of the month still belongs to May
      await adjust("bonus", 999, "2033-06-01"); // next month - must NOT be consumed by the May run

      const run = await registerRun(2033, 5);
      expect(run.status).toBe(201);
      const line = run.body.employees[0];
      expect([line.advances, line.penalties, line.bonuses]).toEqual([300, 50, 100]);
      expect(line.netPay).toBe(4000 - 300 - 50 + 100);
      const linked = await sql<{ n: string }>`SELECT count(*)::text AS n FROM payroll_adjustments WHERE payroll_run_id = ${run.body.id}`.execute(w.db);
      expect(Number(linked.rows[0].n)).toBe(3);
      const june = await sql<{ payroll_run_id: string | null }>`SELECT payroll_run_id FROM payroll_adjustments WHERE amount = 999`.execute(w.db);
      expect(june.rows[0].payroll_run_id).toBeNull();

      // a consumed adjustment can not be cancelled behind the run's back
      const adjId = (await sql<{ id: string }>`SELECT id::text FROM payroll_adjustments WHERE amount = 300`.execute(w.db)).rows[0].id;
      expect((await request(w.http()).post(`/hr/adjustments/${adjId}/cancel`).set(auth(w.tokens.admin)).send({ reason: "تراجع" })).status).toBe(409);

      // deleting the draft frees them again
      expect((await request(w.http()).delete(`/hr/payroll-runs/${run.body.id}`).set(auth(w.tokens.admin))).status).toBe(200);
      const free = await sql<{ n: string }>`SELECT count(*)::text AS n FROM payroll_adjustments WHERE payroll_run_id IS NULL AND status = 'ACTIVE' AND entry_date < '2033-06-01'`.execute(w.db);
      expect(Number(free.rows[0].n)).toBe(3);
      expect((await request(w.http()).post(`/hr/adjustments/${adjId}/cancel`).set(auth(w.tokens.admin)).send({ reason: "تراجع" })).status).toBe(201);
    });

    test("typed values that contradict the registered adjustments need an explicit acknowledgement; without adjustments typed values are accepted as before", async () => {
      await adjust("penalty", 70, "2033-07-05");
      const rejected = await registerRun(2033, 7, { penalties: 10 });
      expect(rejected.status).toBe(409);
      const acknowledged = await registerRun(2033, 7, { penalties: 10 }, { acknowledgeAdjustmentMismatch: true });
      expect(acknowledged.status).toBe(201);
      expect(acknowledged.body.employees[0].penalties).toBe(10);
      const audit = await sql<{ metadata: unknown }>`SELECT metadata FROM audit_logs WHERE action LIKE 'POST /hr/payroll-runs%' ORDER BY created_at DESC LIMIT 1`.execute(w.db);
      expect(audit.rows.length).toBe(1);

      const plain = await registerRun(2033, 8, { advances: 25 }); // no adjustments in August: legacy behaviour
      expect(plain.status).toBe(201);
      expect(plain.body.employees[0].advances).toBe(25);
    });

    test("approval is refused while an eligible adjustment of the month was never applied (registered after the draft was built)", async () => {
      const run = await registerRun(2033, 9);
      expect(run.status).toBe(201);
      await adjust("advance", 120, "2033-09-15"); // arrives after the draft
      const blocked = await request(w.http()).post(`/hr/payroll-runs/${run.body.id}/approve`).set(auth(w.tokens.admin2));
      expect(blocked.status).toBe(409);
      expect((await sql<{ status: string }>`SELECT status FROM payroll_runs WHERE id = ${run.body.id}`.execute(w.db)).rows[0].status).toBe("DRAFT");
      expect((await journalsFor(w, "payroll_run", run.body.id)).length).toBe(0);

      // rebuild the draft: the adjustment is now applied and approval goes through
      await request(w.http()).delete(`/hr/payroll-runs/${run.body.id}`).set(auth(w.tokens.admin));
      const rebuilt = await registerRun(2033, 9);
      expect(rebuilt.body.employees[0].advances).toBe(120);
      expect((await request(w.http()).post(`/hr/payroll-runs/${rebuilt.body.id}/approve`).set(auth(w.tokens.admin2))).status).toBe(201);
      expect(await count(w, "journal_entries", sql`source_type = 'payroll_run' AND source_id = ${rebuilt.body.id}`)).toBe(1);
    });
  });
});
