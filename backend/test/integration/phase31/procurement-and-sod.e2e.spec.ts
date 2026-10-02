import request from "supertest";
import { sql } from "kysely";
import { auth, bootstrap, count, journalsFor, stockOf, teardown, type World } from "./harness";

// BL-09 (goods receipt vs purchase order), BL-05 (segregation of duties - admins included) and the GRN supplier requirement.
describe("Phase 3.1 - procurement integrity & segregation of duties", () => {
  let w: World;
  let supplierId: string;
  let otherSupplierId: string;

  const post = (path: string, token: string, body?: Record<string, unknown>) => request(w.http()).post(path).set(auth(token)).send(body ?? {});
  const balance = async (id: string) => (await request(w.http()).get(`/procurement/suppliers/${id}/balance`).set(auth(w.tokens.admin))).body.balance as number;

  beforeAll(async () => {
    w = await bootstrap("proc");
    supplierId = (await post("/procurement/suppliers", w.tokens.admin, { name: "مورد-proc" })).body.id;
    otherSupplierId = (await post("/procurement/suppliers", w.tokens.admin, { name: "مورد-تاني-proc" })).body.id;
  });
  afterAll(async () => {
    await teardown(w);
  });

  describe("goods receipts against a purchase order", () => {
    let poId: string;
    beforeAll(async () => {
      const po = await post("/procurement/purchase-orders", w.tokens.admin, {
        supplierId,
        branchId: w.branchA,
        lines: [{ inventoryItemId: w.ingredientId, quantity: 50, unitPrice: 8 }],
      });
      expect(po.status).toBe(201);
      poId = po.body.id;
      await post(`/procurement/purchase-orders/${poId}/send`, w.tokens.admin);
    });
    const grn = (body: Record<string, unknown>) => post("/procurement/goods-receipts", w.tokens.admin, { branchId: w.branchA, purchaseOrderId: poId, ...body });

    test("over-receipt is rejected at REGISTRATION (409) and writes nothing", async () => {
      const before = await count(w, "goods_receipts");
      const res = await grn({ lines: [{ inventoryItemId: w.ingredientId, quantity: 60, unitCost: 8 }] });
      expect(res.status).toBe(409);
      expect(await count(w, "goods_receipts")).toBe(before);
    });

    test("a PO-linked GRN inherits the PO supplier; an explicitly different supplier, branch or item is rejected", async () => {
      const inherited = await grn({ lines: [{ inventoryItemId: w.ingredientId, quantity: 10, unitCost: 8 }] });
      expect(inherited.status).toBe(201);
      expect(inherited.body.supplierId).toBe(supplierId);

      expect((await grn({ supplierId: otherSupplierId, lines: [{ inventoryItemId: w.ingredientId, quantity: 1, unitCost: 8 }] })).status).toBe(400);
      expect((await post("/procurement/goods-receipts", w.tokens.admin, { branchId: w.branchB, purchaseOrderId: poId, lines: [{ inventoryItemId: w.ingredientId, quantity: 1, unitCost: 8 }] })).status).toBe(400);
      const strangerItem = (await sql<{ id: string }>`SELECT id::text FROM inventory_items WHERE id <> ${w.ingredientId} LIMIT 1`.execute(w.db)).rows[0];
      if (strangerItem) {
        expect((await grn({ lines: [{ inventoryItemId: strangerItem.id, quantity: 1, unitCost: 8 }] })).status).toBe(400);
      }
    });

    test("cumulative confirmed receipts can never exceed the ordered quantity: second 30 of a 50 PO is refused at CONFIRM (409) and stays DRAFT", async () => {
      // PO of 50 already has 10 in DRAFT from the previous test (not confirmed, so it does not count yet)
      const first = await grn({ lines: [{ inventoryItemId: w.ingredientId, quantity: 30, unitCost: 8 }] });
      const second = await grn({ lines: [{ inventoryItemId: w.ingredientId, quantity: 30, unitCost: 8 }] });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201); // both fit individually; the PO row lock decides at confirm time

      const stock = await stockOf(w, w.branchA);
      const supplierBalance = await balance(supplierId);
      expect((await post(`/procurement/goods-receipts/${first.body.id}/confirm`, w.tokens.admin)).status).toBe(201);
      const refused = await post(`/procurement/goods-receipts/${second.body.id}/confirm`, w.tokens.admin);
      expect(refused.status).toBe(409);

      expect(await stockOf(w, w.branchA)).toBe(stock + 30);
      expect((await sql<{ status: string }>`SELECT status FROM goods_receipts WHERE id = ${second.body.id}`.execute(w.db)).rows[0].status).toBe("DRAFT");
      expect((await journalsFor(w, "goods_receipt", second.body.id)).length).toBe(0);
      // accounts payable recognised once, for the confirmed receipt only
      expect(await balance(supplierId)).toBe(supplierBalance + 30 * 8);
      expect((await journalsFor(w, "goods_receipt", first.body.id)).length).toBe(1);
    });
  });

  describe("segregation of duties (BL-05) - no admin bypass", () => {
    let employeeId: string;
    beforeAll(async () => {
      employeeId = (await post("/hr/employees", w.tokens.admin, { name: "موظف-sod", baseSalary: 2500, wageType: "fixed_monthly" })).body.id;
    });

    test("payroll: the registering user can not approve (admin or not); an independent user can", async () => {
      const run = await post("/hr/payroll-runs", w.tokens.admin, { year: 2034, month: 2, employees: [{ employeeId, grossPay: 2500 }] });
      expect(run.status).toBe(201);
      const self = await post(`/hr/payroll-runs/${run.body.id}/approve`, w.tokens.admin);
      expect(self.status).toBe(403);
      expect(String(self.body.error)).toContain("مستخدم تاني");
      expect((await sql<{ status: string }>`SELECT status FROM payroll_runs WHERE id = ${run.body.id}`.execute(w.db)).rows[0].status).toBe("DRAFT");
      expect((await journalsFor(w, "payroll_run", run.body.id)).length).toBe(0);
      expect((await post(`/hr/payroll-runs/${run.body.id}/approve`, w.tokens.admin2)).status).toBe(201);
    });

    test("payment adjustment: requester can not approve their own request even as admin; another admin can", async () => {
      const order = await request(w.http())
        .post("/orders")
        .set(auth(w.tokens.admin))
        .send({ branchId: w.branchA, orderType: "takeaway", items: [{ variantId: w.variantId, quantity: 1 }], paymentMethodId: w.cashMethodId });
      const payment = (await request(w.http()).get(`/payment-control/payments?branchId=${w.branchA}`).set(auth(w.tokens.admin))).body.find(
        (p: { orderId: string }) => p.orderId === order.body.id
      );
      const adj = await post("/payment-control/adjustment-requests", w.tokens.admin, { paymentId: payment.id, proposedAmount: 70, reason: "فرق" });
      expect(adj.status).toBe(201);
      const self = await post(`/payment-control/adjustment-requests/${adj.body.id}/approve`, w.tokens.admin);
      expect(self.status).toBe(403);
      expect((await sql<{ status: string }>`SELECT status FROM payment_adjustment_requests WHERE id = ${adj.body.id}`.execute(w.db)).rows[0].status).toBe("PENDING");
      expect((await post(`/payment-control/adjustment-requests/${adj.body.id}/approve`, w.tokens.admin2)).status).toBe(201);
    });

    test("supplier invoice: registrar can not approve; an independent accountant can; the refusal is audited as DENIED", async () => {
      const receipt = await post("/procurement/goods-receipts", w.tokens.admin, { branchId: w.branchA, supplierId, lines: [{ inventoryItemId: w.ingredientId, quantity: 5, unitCost: 10 }] });
      await post(`/procurement/goods-receipts/${receipt.body.id}/confirm`, w.tokens.admin);
      const invoice = await post("/procurement/supplier-invoices", w.tokens.admin, {
        supplierId,
        branchId: w.branchA,
        goodsReceiptId: receipt.body.id,
        supplierInvoiceNumber: "SOD-1",
        lines: [{ inventoryItemId: w.ingredientId, invoicedQuantity: 5, unitPrice: 10 }],
      });
      expect(invoice.status).toBe(201);
      const self = await post(`/procurement/supplier-invoices/${invoice.body.id}/approve`, w.tokens.admin);
      expect(self.status).toBe(403);
      expect((await post(`/procurement/supplier-invoices/${invoice.body.id}/approve`, w.tokens.accountant)).status).toBe(201);

      const denied = await sql<{ n: string }>`
        SELECT count(*)::text AS n FROM audit_logs WHERE outcome = 'DENIED' AND actor_user_id = ${w.userIds.admin} AND http_status = 403`.execute(w.db);
      expect(Number(denied.rows[0].n)).toBeGreaterThanOrEqual(3); // payroll, adjustment and invoice attempts
    });
  });
});
