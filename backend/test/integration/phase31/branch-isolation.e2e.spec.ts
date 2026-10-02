import request from "supertest";
import { sql } from "kysely";
import { auth, bootstrap, createOrder, purge, stockOf, teardown, type World } from "./harness";

// BL-11 - server-side branch isolation. A branch-bound user (branch A) must never read or change branch B data, no matter which
// identifier is supplied (query / path / body / nested), and a custom permission grant must not widen the branch scope.
// Foreign branchId supplied by the client -> 403 (+ DENIED audit). Foreign resource addressed by id -> 404 (existence not revealed).
// Collections are filtered. Company-wide roles (admin, accountant) keep full access. Every denial is proven to leave the data untouched.
describe("Phase 3.1 - branch isolation matrix", () => {
  let w: World;
  let branchC: string;
  const ids: Record<string, string> = {};

  const get = (path: string, token: string) => request(w.http()).get(path).set(auth(token));
  const post = (path: string, token: string, body?: Record<string, unknown>) => request(w.http()).post(path).set(auth(token)).send(body ?? {});
  const patch = (path: string, token: string, body?: Record<string, unknown>) => request(w.http()).patch(path).set(auth(token)).send(body ?? {});
  const denied = (res: request.Response) => {
    if (![403, 404].includes(res.status)) throw new Error(`NOT DENIED: ${res.request.method} ${res.request.url} -> ${res.status} ${JSON.stringify(res.body)}`);
  };

  beforeAll(async () => {
    w = await bootstrap("iso");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const c = Branch.register({ name: "فرع-C-iso" });
    await new KyselyBranchRepository(w.db).save(c);
    branchC = c.id;

    // ---- branch B owns: order+payment, adjustment request, expense, purchase, PO, GRN, invoice, stocktake, shift, driver, employee ----
    const order = await createOrder(w, w.tokens.cashierB, { branchId: w.branchB });
    ids.orderB = order.body.id;
    const payment = (await get(`/payment-control/payments?branchId=${w.branchB}`, w.tokens.admin)).body.find((p: { orderId: string }) => p.orderId === ids.orderB);
    ids.paymentB = payment.id;
    ids.adjB = (await post("/payment-control/adjustment-requests", w.tokens.admin, { paymentId: ids.paymentB, proposedAmount: 90, reason: "iso" })).body.id;

    const category = (await post("/expenses/categories", w.tokens.admin, { name: "فئة-iso" })).body.id;
    ids.expenseB = (await post("/expenses", w.tokens.admin, { branchId: w.branchB, businessDate: "2030-01-05", categoryId: category, amount: 12, status: "DRAFT" })).body.id;
    ids.categoryId = category;
    ids.purchaseB = (await post("/purchases", w.tokens.cashierB, { branchId: w.branchB, businessDate: "2030-01-05", amount: 25 })).body.id;

    ids.supplierId = (await post("/procurement/suppliers", w.tokens.admin, { name: "مورد-iso" })).body.id;
    ids.poB = (await post("/procurement/purchase-orders", w.tokens.admin, { supplierId: ids.supplierId, branchId: w.branchB, lines: [{ inventoryItemId: w.ingredientId, quantity: 20, unitPrice: 4 }] })).body.id;
    ids.grnB = (await post("/procurement/goods-receipts", w.tokens.admin, { supplierId: ids.supplierId, branchId: w.branchB, lines: [{ inventoryItemId: w.ingredientId, quantity: 5, unitCost: 4 }] })).body.id;
    const grnConfirmed = (await post("/procurement/goods-receipts", w.tokens.admin, { supplierId: ids.supplierId, branchId: w.branchB, lines: [{ inventoryItemId: w.ingredientId, quantity: 5, unitCost: 4 }] })).body.id;
    await post(`/procurement/goods-receipts/${grnConfirmed}/confirm`, w.tokens.admin);
    ids.invoiceB = (
      await post("/procurement/supplier-invoices", w.tokens.admin, {
        supplierId: ids.supplierId,
        branchId: w.branchB,
        goodsReceiptId: grnConfirmed,
        supplierInvoiceNumber: "ISO-1",
        lines: [{ inventoryItemId: w.ingredientId, invoicedQuantity: 5, unitPrice: 4 }],
      })
    ).body.id;
    // counted quantity == system quantity: no variance, so no variance journal is needed
    ids.stocktakeB = (await post("/inventory/stocktakes", w.tokens.admin, { branchId: w.branchB, lines: [{ inventoryItemId: w.ingredientId, actualQuantity: await stockOf(w, w.branchB) }] })).body.id;
    ids.shiftB = (await post("/shifts/open", w.tokens.cashierB, { openingCash: 100 })).body.id;
    ids.driverB = (await post("/delivery/drivers", w.tokens.admin, { name: "سائق-B", branchId: w.branchB })).body.id;
    ids.employeeB = (await post("/hr/employees", w.tokens.admin, { name: "موظف-B", baseSalary: 7777, wageType: "fixed_monthly", restrictedBranchId: w.branchB })).body.id;
    ids.employeeC = (await post("/hr/employees", w.tokens.admin, { name: "موظف-C", baseSalary: 8888, wageType: "fixed_monthly", restrictedBranchId: branchC })).body.id;
    ids.transferBC = (await post("/inventory/transfer-requests", w.tokens.admin, { fromBranchId: w.branchB, toBranchId: branchC, lines: [{ inventoryItemId: w.ingredientId, requestedQuantity: 1 }] })).body.id;
  });

  afterAll(async () => {
    await purge(w.db, "branches", [branchC]);
    await teardown(w);
  });

  test("fixture sanity: every branch-B record exists and is visible to company-wide roles", async () => {
    for (const [path, key] of [
      [`/expenses/${ids.expenseB}`, "expense"],
      [`/purchases/${ids.purchaseB}`, "purchase"],
      [`/procurement/supplier-invoices/${ids.invoiceB}`, "invoice"],
      [`/inventory/stocktakes/${ids.stocktakeB}`, "stocktake"],
    ] as const) {
      expect([key, (await get(path, w.tokens.accountant)).status]).toEqual([key, 200]);
      expect([key, (await get(path, w.tokens.admin)).status]).toEqual([key, 200]);
    }
  });

  describe("reading branch-B data as a branch-A manager", () => {
    test("single resources addressed by id -> 404 (existence not revealed)", async () => {
      for (const path of [
        `/expenses/${ids.expenseB}`,
        `/purchases/${ids.purchaseB}`,
        `/procurement/supplier-invoices/${ids.invoiceB}`,
        `/procurement/purchase-orders/${ids.poB}/receipt-progress`,
        `/inventory/stocktakes/${ids.stocktakeB}`,
        `/shifts/${ids.shiftB}/preview`,
        `/shifts/${ids.shiftB}/cash-drawer-entries`,
        `/hr/employees/${ids.employeeB}/history`,
      ]) {
        const res = await get(path, w.tokens.managerA);
        expect([path, res.status]).toEqual([path, 404]);
      }
    });

    test("an explicit foreign branchId (query) -> 403 on every branch-scoped read", async () => {
      for (const path of [
        `/orders?branchId=${w.branchB}`,
        `/orders/kitchen-board?branchId=${w.branchB}`,
        `/expenses?branchId=${w.branchB}`,
        `/purchases?branchId=${w.branchB}`,
        `/procurement/goods-receipts?branchId=${w.branchB}`,
        `/procurement/supplier-invoices?branchId=${w.branchB}`,
        `/procurement/supplier-payments?branchId=${w.branchB}`,
        `/payment-control/payments?branchId=${w.branchB}`,
        `/payment-control/reconciliation-records?branchId=${w.branchB}`,
        `/payment-control/exceptions?branchId=${w.branchB}`,
        `/payment-control/reports/daily-owner?date=2030-01-05&branchId=${w.branchB}`,
        `/inventory/balances?branchId=${w.branchB}&inventoryItemId=${w.ingredientId}`,
        `/inventory/low-stock?branchId=${w.branchB}`,
        `/inventory/stocktakes?branchId=${w.branchB}`,
        `/shifts?branchId=${w.branchB}`,
        `/delivery/drivers?branchId=${w.branchB}`,
        `/reports/dashboard?branchId=${w.branchB}`,
        `/reports/inventory-valuation?branchId=${w.branchB}`,
        `/accounting/reports/trial-balance?branchId=${w.branchB}`,
        `/branch-days/${w.branchB}/status`,
        `/branch-days/${w.branchB}/history`,
      ]) {
        const res = await get(path, w.tokens.managerA);
        expect([path, res.status]).toEqual([path, 403]);
      }
    });

    test("collections without a branchId are filtered to the caller's own branch (no branch-B row ever leaks)", async () => {
      const leaks = async (path: string, field = "branchId") => {
        const res = await get(path, w.tokens.managerA);
        expect([path, res.status]).toEqual([path, 200]);
        const rows: Array<Record<string, unknown>> = Array.isArray(res.body) ? res.body : res.body.items ?? [];
        return rows.filter((r) => r[field] !== undefined && r[field] !== w.branchA);
      };
      for (const path of ["/orders", "/expenses", "/purchases", "/procurement/goods-receipts", "/procurement/purchase-orders", "/procurement/supplier-invoices", "/payment-control/payments", "/inventory/stocktakes", "/shifts", "/delivery/drivers"]) {
        expect([path, await leaks(path)]).toEqual([path, []]);
      }
      const requests = (await get("/payment-control/adjustment-requests", w.tokens.managerA)).body as Array<{ id: string }>;
      expect(requests.some((r) => r.id === ids.adjB)).toBe(false);
      const transfers = (await get("/inventory/transfer-requests", w.tokens.managerA)).body as Array<{ id: string }>;
      expect(transfers.some((t) => t.id === ids.transferBC)).toBe(false); // B -> C: branch A is neither side
    });

    test("employees: only the manager's own branch, WITHOUT salary data; payroll & adjustments are company-wide only (403)", async () => {
      const list = await get("/hr/employees", w.tokens.managerA);
      expect(list.status).toBe(200);
      expect(list.body.find((e: { id: string }) => e.id === ids.employeeB)).toBeUndefined();
      expect(list.body.find((e: { id: string }) => e.id === ids.employeeC)).toBeUndefined();

      // an employee of branch A exists for the manager: salary fields must be hidden
      const own = (await post("/hr/employees", w.tokens.admin, { name: "موظف-A-iso", baseSalary: 5555, wageType: "fixed_monthly", restrictedBranchId: w.branchA })).body;
      expect(own.id).toBeTruthy();
      const again = (await get("/hr/employees", w.tokens.managerA)).body.find((e: { id: string }) => e.id === own.id);
      expect(again).toBeTruthy();
      expect(again.baseSalary).toBeNull();
      expect(again.hourlyRate).toBeNull();
      expect(JSON.stringify(list.body)).not.toContain("7777");
      expect(JSON.stringify(list.body)).not.toContain("8888");
      expect(JSON.stringify((await get("/hr/employees", w.tokens.managerA)).body)).not.toContain("5555");

      // even with the HR-management permission granted, a branch-bound user can not set pay or touch other branches' staff
      await sql`UPDATE users SET permission_grants = ${JSON.stringify(["hr.employees.manage", "hr.employees.view"])}::jsonb WHERE id = ${w.userIds.managerA}`.execute(w.db);
      expect((await patch(`/hr/employees/${own.id}`, w.tokens.managerA, { baseSalary: 99999 })).status).toBe(403);
      expect((await patch(`/hr/employees/${ids.employeeB}`, w.tokens.managerA, { phone: "01000000000" })).status).toBe(404);
      expect((await post("/hr/employees", w.tokens.managerA, { name: "x", restrictedBranchId: w.branchB })).status).toBe(403);
      expect((await get(`/hr/employees/${ids.employeeB}/history`, w.tokens.managerA)).status).toBe(404);
      const unchanged = await sql<{ base_salary: string }>`SELECT base_salary FROM employees WHERE id = ${own.id}`.execute(w.db);
      expect(Number(unchanged.rows[0].base_salary)).toBe(5555);
      await sql`UPDATE users SET permission_grants = '[]'::jsonb WHERE id = ${w.userIds.managerA}`.execute(w.db);

      for (const path of ["/hr/payroll-runs", "/hr/adjustments"]) expect([path, (await get(path, w.tokens.managerA)).status]).toEqual([path, 403]);
      expect((await post("/hr/payroll-runs", w.tokens.managerA, { year: 2035, month: 1, employees: [] })).status).toBe(403);
      expect((await get(`/procurement/suppliers/${ids.supplierId}/balance`, w.tokens.managerA)).status).toBe(403);
      expect((await get("/accounting/reports/business-date-drift", w.tokens.managerA)).status).toBe(403);
    });
  });

  describe("changing branch-B data as a branch-A user: denied AND nothing changes", () => {
    test("orders, payments, procurement, inventory, expenses, shifts", async () => {
      const orderStatus = async () => (await sql<{ status: string }>`SELECT status FROM orders WHERE id = ${ids.orderB}`.execute(w.db)).rows[0].status;
      const stockB = await stockOf(w, w.branchB);
      const before = {
        order: await orderStatus(),
        adj: (await sql<{ status: string }>`SELECT status FROM payment_adjustment_requests WHERE id = ${ids.adjB}`.execute(w.db)).rows[0].status,
        grn: (await sql<{ status: string }>`SELECT status FROM goods_receipts WHERE id = ${ids.grnB}`.execute(w.db)).rows[0].status,
        orders: (await sql<{ n: string }>`SELECT count(*)::text AS n FROM orders`.execute(w.db)).rows[0].n,
        movements: (await sql<{ n: string }>`SELECT count(*)::text AS n FROM stock_movements`.execute(w.db)).rows[0].n,
      };

      denied(await createOrder(w, w.tokens.managerA, { branchId: w.branchB }));
      denied(await patch(`/orders/${ids.orderB}/cancel`, w.tokens.managerA));
      denied(await patch(`/orders/${ids.orderB}/status`, w.tokens.managerA, { status: "completed" }));
      denied(await post(`/payment-control/adjustment-requests/${ids.adjB}/approve`, w.tokens.managerA));
      denied(await post(`/payment-control/adjustment-requests/${ids.adjB}/reject`, w.tokens.managerA));
      denied(await post("/payment-control/adjustment-requests", w.tokens.managerA, { paymentId: ids.paymentB, proposedAmount: 1, reason: "x" }));
      denied(await post(`/procurement/goods-receipts/${ids.grnB}/confirm`, w.tokens.managerA));
      denied(await post("/procurement/goods-receipts", w.tokens.managerA, { branchId: w.branchB, supplierId: ids.supplierId, lines: [{ inventoryItemId: w.ingredientId, quantity: 1, unitCost: 1 }] }));
      denied(await post("/procurement/purchase-orders", w.tokens.managerA, { branchId: w.branchB, supplierId: ids.supplierId, lines: [{ inventoryItemId: w.ingredientId, quantity: 1, unitPrice: 1 }] }));
      denied(await post(`/procurement/supplier-invoices/${ids.invoiceB}/approve`, w.tokens.managerA));
      denied(await post(`/procurement/purchase-orders/${ids.poB}/cancel`, w.tokens.managerA));
      denied(await post("/inventory/movements", w.tokens.managerA, { inventoryItemId: w.ingredientId, branchId: w.branchB, movementType: "RECEIPT", quantityDelta: 999 }));
      denied(await post("/inventory/stocktakes", w.tokens.managerA, { branchId: w.branchB, lines: [{ inventoryItemId: w.ingredientId, actualQuantity: 0 }] }));
      denied(await patch("/inventory/stock-thresholds", w.tokens.managerA, { branchId: w.branchB, inventoryItemId: w.ingredientId, reorderPoint: 1 }));
      denied(await post("/expenses", w.tokens.managerA, { branchId: w.branchB, businessDate: "2030-01-06", categoryId: ids.categoryId, amount: 5, status: "DRAFT" }));
      denied(await post(`/expenses/${ids.expenseB}/cancel`, w.tokens.managerA, { reason: "x" }));
      denied(await post(`/purchases/${ids.purchaseB}/confirm`, w.tokens.managerA));
      denied(await post(`/shifts/${ids.shiftB}/close`, w.tokens.managerA, { actualCash: 1 }));
      denied(await post("/shifts/open", w.tokens.managerA, { branchId: w.branchB, openingCash: 1 }));
      denied(await post(`/branch-days/${w.branchB}/close`, w.tokens.managerA, {}));
      denied(await post("/delivery/attendance-shifts/check-in", w.tokens.managerA, { driverId: ids.driverB, branchId: w.branchB }));
      denied(await post("/inventory/transfer-requests", w.tokens.managerA, { fromBranchId: w.branchA, toBranchId: w.branchB, lines: [{ inventoryItemId: w.ingredientId, requestedQuantity: 1 }] }));

      expect(await orderStatus()).toBe(before.order);
      expect(await stockOf(w, w.branchB)).toBe(stockB);
      expect((await sql<{ status: string }>`SELECT status FROM payment_adjustment_requests WHERE id = ${ids.adjB}`.execute(w.db)).rows[0].status).toBe(before.adj);
      expect((await sql<{ status: string }>`SELECT status FROM goods_receipts WHERE id = ${ids.grnB}`.execute(w.db)).rows[0].status).toBe(before.grn);
      expect((await sql<{ n: string }>`SELECT count(*)::text AS n FROM orders`.execute(w.db)).rows[0].n).toBe(before.orders);
      expect((await sql<{ n: string }>`SELECT count(*)::text AS n FROM stock_movements`.execute(w.db)).rows[0].n).toBe(before.movements);
    });

    test("every refusal is audited as DENIED with the actor and branch", async () => {
      const rows = await sql<{ n: string }>`SELECT count(*)::text AS n FROM audit_logs WHERE outcome = 'DENIED' AND actor_user_id = ${w.userIds.managerA}`.execute(w.db);
      expect(Number(rows.rows[0].n)).toBeGreaterThanOrEqual(20);
    });
  });

  describe("a branch-bound user can still work normally in its own branch", () => {
    test("own orders, own expenses, own stock, own transfers (as receiver)", async () => {
      expect((await createOrder(w, w.tokens.managerA)).status).toBe(201);
      expect((await get("/orders", w.tokens.managerA)).body.length).toBeGreaterThan(0);
      expect((await get(`/inventory/balances?branchId=${w.branchA}&inventoryItemId=${w.ingredientId}`, w.tokens.managerA)).status).toBe(200);
      expect((await post("/expenses", w.tokens.managerA, { branchId: w.branchA, businessDate: "2030-01-07", categoryId: ids.categoryId, amount: 3, status: "DRAFT" })).status).toBe(201);
      // a transfer request B -> A is visible to A (receiver) and A can create requests for itself
      const transfer = await post("/inventory/transfer-requests", w.tokens.managerA, { fromBranchId: w.branchB, toBranchId: w.branchA, lines: [{ inventoryItemId: w.ingredientId, requestedQuantity: 2 }] });
      expect(transfer.status).toBe(201);
      expect(((await get("/inventory/transfer-requests", w.tokens.managerA)).body as Array<{ id: string }>).some((t) => t.id === transfer.body.id)).toBe(true);
      // ... but A (the requester) can not approve the sender's side
      denied(await post(`/inventory/transfer-requests/${transfer.body.id}/approve`, w.tokens.managerA, { approvedQuantities: {} }));
    });
  });

  describe("custom permissions can never widen the branch scope", () => {
    test("granting accounting.view / reports.* / hr.payroll.* to a branch-A manager still yields 403 for branch B and company-level data", async () => {
      await sql`UPDATE users SET permission_grants = ${JSON.stringify(["accounting.view", "accounting.manage", "reports.view", "reports.branch_health", "hr.payroll.view", "hr.payroll.manage", "treasuries.view", "purchasing.view"])}::jsonb WHERE id = ${w.userIds.managerA}`.execute(w.db);
      for (const path of [
        `/accounting/reports/trial-balance?branchId=${w.branchB}`,
        `/accounting/journal-entries?branchId=${w.branchB}`,
        `/reports/dashboard?branchId=${w.branchB}`,
        "/reports/branch-health",
        "/reports/inventory-comparison",
        "/hr/payroll-runs",
        "/hr/adjustments",
        `/treasuries?branchId=${w.branchB}`,
        `/procurement/supplier-invoices?branchId=${w.branchB}`,
        `/procurement/suppliers/${ids.supplierId}/balance`,
      ]) {
        const res = await get(path, w.tokens.managerA);
        expect([path, res.status]).toEqual([path, 403]);
      }
      // the general ledger spans branches: company-wide only
      const gl = await get(`/accounting/reports/general-ledger?accountId=${w.accountIds["1100"]}`, w.tokens.managerA);
      expect(gl.status).toBe(403);
      // pinned reads still work and only contain the own branch
      const tb = await get("/accounting/reports/trial-balance", w.tokens.managerA);
      expect(tb.status).toBe(200);
      expect(tb.body.branchId).toBe(w.branchA);
      await sql`UPDATE users SET permission_grants = '[]'::jsonb WHERE id = ${w.userIds.managerA}`.execute(w.db);
    });

    test("a branch-bound user WITHOUT an assigned branch has no access to branch-owned data at all (fail closed)", async () => {
      await sql`UPDATE users SET branch_id = NULL WHERE id = ${w.userIds.managerA}`.execute(w.db);
      for (const path of ["/orders", "/expenses", "/inventory/stocktakes", "/reports/dashboard"]) {
        const res = await get(path, w.tokens.managerA);
        expect([path, res.status]).toEqual([path, 403]);
      }
      await sql`UPDATE users SET branch_id = ${w.branchA} WHERE id = ${w.userIds.managerA}`.execute(w.db);
    });
  });

  describe("company-wide roles keep full access", () => {
    test("accountant and admin read every branch", async () => {
      for (const token of [w.tokens.accountant, w.tokens.admin]) {
        expect((await get(`/expenses?branchId=${w.branchB}`, token)).status).toBe(200);
        if (token === w.tokens.admin) expect((await get(`/orders?branchId=${w.branchB}`, token)).status).toBe(200);
        expect((await get(`/inventory/stocktakes/${ids.stocktakeB}`, token)).status).toBe(200);
        expect((await get(`/accounting/reports/trial-balance?branchId=${w.branchB}`, token)).status).toBe(200);
        expect((await get("/hr/payroll-runs", token)).status).toBe(200);
      }
      const all = (await get("/hr/employees", w.tokens.admin)).body as Array<{ id: string; baseSalary: number | null }>;
      expect(all.find((e) => e.id === ids.employeeB)?.baseSalary).toBe(7777);
    });
  });
});
