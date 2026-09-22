import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e حقيقي بيغطي الحلقة الكاملة: قفل دفعة تلقائي وقت تسجيل الطلب (event bus - LockPaymentForOrderHandler)،
// طلب تعديل + اعتماد (بيغيّر سنابشوت الدفعة فعليًا)، وإدخال + مطابقة يدوية لسطر كشف حساب خارجي
describe("Payment Control - الحلقة الكاملة (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;
  let cashMethodId: string;
  let visaMethodId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-دفعات-e2e", email: "admin-payment-control-e2e@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-payment-control-e2e@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع دفعات-e2e" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف دفعات-e2e" });
    const variant = item.addVariant({ label: "عادي", price: 100 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const cashMethod = await request(app.getHttpServer())
      .post("/payment-control/payment-methods")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "كاش-دفعات-e2e", kind: "cash" });
    cashMethodId = cashMethod.body.id;

    const visaMethod = await request(app.getHttpServer())
      .post("/payment-control/payment-methods")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فيزا-دفعات-e2e", kind: "card_or_wallet", settlementChannel: "visa_pos" });
    visaMethodId = visaMethod.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM payment_adjustment_requests`.execute(db);
    await sql`DELETE FROM payment_reconciliation_records`.execute(db);
    await sql`DELETE FROM payments`.execute(db);
    await sql`DELETE FROM print_jobs`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders`.execute(db);
    await sql`DELETE FROM payment_methods WHERE id IN (${sql.join([cashMethodId, visaMethodId])})`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-payment-control-e2e@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /orders بـpaymentMethodId بيقفل Payment تلقائي عن طريق event bus", async () => {
    const order = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 2 }], paymentMethodId: cashMethodId });
    expect(order.status).toBe(201);
    expect(order.body.total).toBe(200);

    const payments = await request(app.getHttpServer())
      .get(`/payment-control/payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const locked = payments.body.find((p: { orderId: string }) => p.orderId === order.body.id);
    expect(locked).toBeTruthy();
    expect(locked.methodKind).toBe("cash");
    expect(locked.amount).toBe(200);
  });

  test("POST /orders من غير paymentMethodId - مفيش Payment خالص (نفس القيد الموروث)", async () => {
    const order = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] });
    expect(order.status).toBe(201);

    const payments = await request(app.getHttpServer())
      .get(`/payment-control/payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(payments.body.find((p: { orderId: string }) => p.orderId === order.body.id)).toBeUndefined();
  });

  test("طلب تعديل + اعتماد بيغيّر سنابشوت الدفعة فعليًا (كاش -> فيزا)", async () => {
    const order = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }], paymentMethodId: cashMethodId });

    const paymentsRes = await request(app.getHttpServer())
      .get(`/payment-control/payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const payment = paymentsRes.body.find((p: { orderId: string }) => p.orderId === order.body.id);

    const adjustmentReq = await request(app.getHttpServer())
      .post("/payment-control/adjustment-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ paymentId: payment.id, proposedPaymentMethodId: visaMethodId, proposedAmount: 100, reason: "تصحيح طريقة الدفع" });
    expect(adjustmentReq.status).toBe(201);
    expect(adjustmentReq.body.amountDelta).toBe(100); // إعادة تصنيف قناة كاملة (cash -> visa_pos) = المبلغ كله

    const approved = await request(app.getHttpServer())
      .post(`/payment-control/adjustment-requests/${adjustmentReq.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("APPROVED");

    const paymentsAfter = await request(app.getHttpServer())
      .get(`/payment-control/payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const updatedPayment = paymentsAfter.body.find((p: { id: string }) => p.id === payment.id);
    expect(updatedPayment.methodKind).toBe("card_or_wallet");
    expect(updatedPayment.settlementChannel).toBe("visa_pos");
  });

  test("تسجيل ومطابقة سطر كشف حساب خارجي يدويًا", async () => {
    const order = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }], paymentMethodId: cashMethodId });

    const paymentsRes = await request(app.getHttpServer())
      .get(`/payment-control/payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const payment = paymentsRes.body.find((p: { orderId: string }) => p.orderId === order.body.id);

    const record = await request(app.getHttpServer())
      .post("/payment-control/reconciliation-records")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, source: "talabat_statement", externalAmount: 100, externalDate: "2026-01-01" });
    expect(record.status).toBe(201);
    expect(record.body.matchStatus).toBe("UNMATCHED");

    const matched = await request(app.getHttpServer())
      .patch(`/payment-control/reconciliation-records/${record.body.id}/match`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ paymentId: payment.id });
    expect(matched.status).toBe(200);
    expect(matched.body.matchStatus).toBe("MATCHED");
    expect(matched.body.matchedPaymentId).toBe(payment.id);
  });

  test("POST /reconciliation-records/import/commit بيسجّل عدة سطور بدفعة واحدة", async () => {
    const commit = await request(app.getHttpServer())
      .post("/payment-control/reconciliation-records/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        source: "instapay",
        branchId,
        rows: [
          { externalDate: "2026-02-01", externalAmount: 50, externalReference: "ref-1" },
          { externalDate: "2026-02-02", externalAmount: 75, externalReference: "ref-2" },
        ],
      });
    expect(commit.status).toBe(201);
    expect(commit.body.count).toBe(2);
    expect(commit.body.batchId).toBeTruthy();

    const records = await request(app.getHttpServer())
      .get(`/payment-control/reconciliation-records?branchId=${branchId}&source=instapay`)
      .set("Authorization", `Bearer ${adminToken}`);
    const imported = records.body.filter((r: { importBatchId: string | null }) => r.importBatchId === commit.body.batchId);
    expect(imported).toHaveLength(2);
    expect(imported.every((r: { matchStatus: string }) => r.matchStatus === "UNMATCHED")).toBe(true);

    // إلغاء الدفعة كلها - لسه كل سطورها UNMATCHED
    const cancel = await request(app.getHttpServer())
      .delete(`/payment-control/reconciliation-records/import-batches/${commit.body.batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.deleted).toBe(2);

    const afterCancel = await request(app.getHttpServer())
      .get(`/payment-control/reconciliation-records?branchId=${branchId}&source=instapay`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(afterCancel.body.filter((r: { importBatchId: string | null }) => r.importBatchId === commit.body.batchId)).toHaveLength(0);
  });

  test("DELETE على دفعة استيراد فيها سطر اتطابق بالفعل -> 400، مبيتلغيش خالص", async () => {
    const order = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }], paymentMethodId: cashMethodId });
    const paymentsRes = await request(app.getHttpServer())
      .get(`/payment-control/payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const payment = paymentsRes.body.find((p: { orderId: string }) => p.orderId === order.body.id);

    const commit = await request(app.getHttpServer())
      .post("/payment-control/reconciliation-records/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ source: "orange_cash", branchId, rows: [{ externalDate: "2026-02-03", externalAmount: 100 }] });
    const batchId = commit.body.batchId;

    const records = await request(app.getHttpServer())
      .get(`/payment-control/reconciliation-records?branchId=${branchId}&source=orange_cash`)
      .set("Authorization", `Bearer ${adminToken}`);
    const recordId = records.body.find((r: { importBatchId: string | null }) => r.importBatchId === batchId).id;

    await request(app.getHttpServer())
      .patch(`/payment-control/reconciliation-records/${recordId}/match`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ paymentId: payment.id });

    const cancel = await request(app.getHttpServer())
      .delete(`/payment-control/reconciliation-records/import-batches/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancel.status).toBe(400);

    const stillThere = await request(app.getHttpServer())
      .get(`/payment-control/reconciliation-records?branchId=${branchId}&source=orange_cash`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(stillThere.body.some((r: { id: string }) => r.id === recordId)).toBe(true);
  });

  test("GET /reports/daily-owner بيلخّص مدفوعات اليوم صح", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const order = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 3 }], paymentMethodId: cashMethodId });
    expect(order.status).toBe(201);

    const report = await request(app.getHttpServer())
      .get(`/payment-control/reports/daily-owner?date=${today}&branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(report.status).toBe(200);
    expect(report.body.date).toBe(today);
    const cashTotal = report.body.totalsByChannel.find((t: { channel: string }) => t.channel === "cash");
    expect(cashTotal).toBeTruthy();
    expect(cashTotal.totalAmount).toBeGreaterThanOrEqual(300);
    expect(typeof report.body.pendingAdjustmentRequests).toBe("number");
    expect(Array.isArray(report.body.unmatchedReconciliationRecords)).toBe(true);
  });
});
