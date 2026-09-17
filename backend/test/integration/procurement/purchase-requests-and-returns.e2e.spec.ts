import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Procurement - طلبات ومرتجعات المشتريات (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let inventoryItemId: string;
  let supplierId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { KyselyAccountRepository } = await import(
      "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository"
    );
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-طلبات-موردين-جست", email: "admin-purchase-requests@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-purchase-requests@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع طلبات-موردين-جست" });
    branchId = branchRes.body.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const item = InventoryItem.register({ name: "زيت-طلبات-موردين-جست", unit: "لتر", unitCost: 30 });
    await inventoryRepo.save(item);
    inventoryItemId = item.id;

    const accountRepo = new KyselyAccountRepository(db);
    const inventoryAccount = Account.register({ code: "1400", name: "المخزون", accountType: "ASSET", isSystemAccount: true });
    const apAccount = Account.register({ code: "2100", name: "موردون (ذمم دائنة)", accountType: "LIABILITY", isSystemAccount: true });
    await accountRepo.save(inventoryAccount);
    await accountRepo.save(apAccount);

    const supplierRes = await request(app.getHttpServer())
      .post("/procurement/suppliers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مورد-طلبات-جست" });
    supplierId = supplierRes.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM purchase_return_items`.execute(db);
    await sql`DELETE FROM purchase_returns`.execute(db);
    await sql`DELETE FROM purchase_request_items`.execute(db);
    await sql`DELETE FROM purchase_requests`.execute(db);
    await sql`DELETE FROM purchase_order_items`.execute(db);
    await sql`DELETE FROM purchase_orders`.execute(db);
    await sql`DELETE FROM goods_receipt_items`.execute(db);
    await sql`DELETE FROM goods_receipts`.execute(db);
    await sql`DELETE FROM suppliers`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE code IN ('1400', '2100')`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${inventoryItemId}`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-purchase-requests@jest.test'`.execute(db);
    await app.close();
  });

  test("طلب شراء: تسجيل -> تقديم -> رفض من غير سبب (400) -> رفض بسبب -> REJECTED", async () => {
    const created = await request(app.getHttpServer())
      .post("/procurement/purchase-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, reason: "محتاجين زيت", lines: [{ inventoryItemId, requestedQuantity: 20 }] });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("DRAFT");

    const submitted = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/submit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(submitted.body.status).toBe("SUBMITTED");

    const editAfterSubmit = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/edit`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "تعديل ممنوع" });
    expect(editAfterSubmit.status).toBe(400);

    const rejectNoReason = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(rejectNoReason.status).toBe(400);

    const rejected = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "مفيش داعي دلوقتي" });
    expect(rejected.status).toBe(201);
    expect(rejected.body.status).toBe("REJECTED");

    const cancelAfterReject = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelAfterReject.status).toBe(400);
  });

  test("طلب شراء: تسجيل -> تعديل (لسه DRAFT) -> تقديم -> اعتماد -> تحويل لأمر شراء -> CONVERTED_TO_PO", async () => {
    const created = await request(app.getHttpServer())
      .post("/procurement/purchase-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, reason: "محتاجين زيت", lines: [{ inventoryItemId, requestedQuantity: 10 }] });

    const edited = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/edit`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ lines: [{ inventoryItemId, requestedQuantity: 15 }] });
    expect(edited.body.lines[0].requestedQuantity).toBe(15);

    await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/submit`)
      .set("Authorization", `Bearer ${adminToken}`);

    const poFromUnapproved = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, purchaseRequestId: created.body.id, lines: [{ inventoryItemId, quantity: 15, unitPrice: 28 }] });
    expect(poFromUnapproved.status).toBe(400); // SUBMITTED مش APPROVED لسه

    const approved = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approved.body.status).toBe("APPROVED");

    const po = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, purchaseRequestId: created.body.id, lines: [{ inventoryItemId, quantity: 15, unitPrice: 28 }] });
    expect(po.status).toBe(201);

    const requestAfter = await request(app.getHttpServer())
      .get(`/procurement/purchase-requests/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(requestAfter.body.status).toBe("CONVERTED_TO_PO");
    expect(requestAfter.body.convertedToPurchaseOrderId).toBe(po.body.id);
  });

  test("طلب شراء: إلغاء وهو DRAFT بينجح، إلغاء تاني بيترفض", async () => {
    const created = await request(app.getHttpServer())
      .post("/procurement/purchase-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, lines: [{ inventoryItemId, requestedQuantity: 5 }] });

    const cancelled = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelled.body.status).toBe("CANCELLED");

    const cancelAgain = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelAgain.status).toBe(400);
  });

  test("مرتجع مشتريات: استلام بضاعة -> ترحيل مرتجع -> ينقص المخزون ويرحّل قيد عكسي (DR AP/CR مخزون)", async () => {
    const receipt = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 50, unitCost: 30 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receipt.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);

    const balanceBefore = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${inventoryItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;

    const supplierBalanceBefore = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;

    const returnDraft = await request(app.getHttpServer())
      .post("/procurement/purchase-returns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        branchId, supplierId, goodsReceiptId: receipt.body.id, reason: "صنف تالف",
        lines: [{ inventoryItemId, quantity: 5, unit: "لتر" }], // مفيش unitCost صريح - هيتحل من inventory_items.unit_cost = 30
      });
    expect(returnDraft.status).toBe(201);
    expect(returnDraft.body.status).toBe("DRAFT");
    expect(returnDraft.body.totalValue).toBe(150); // 5 × 30

    const posted = await request(app.getHttpServer())
      .post(`/procurement/purchase-returns/${returnDraft.body.id}/post`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(posted.status).toBe(201);
    expect(posted.body.status).toBe("POSTED");

    const balanceAfter = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${inventoryItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(balanceAfter).toBe(balanceBefore - 5);

    const supplierBalanceAfter = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;
    expect(supplierBalanceAfter).toBe(supplierBalanceBefore - 150); // المرتجع بيقلل اللي واجبنا للمورد

    // إعادة ترحيل نفس المرتجع - idempotent، مفيش أثر تاني
    const repost = await request(app.getHttpServer())
      .post(`/procurement/purchase-returns/${returnDraft.body.id}/post`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(repost.status).toBe(201);
    const balanceAfterRepost = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${inventoryItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(balanceAfterRepost).toBe(balanceAfter);

    // POSTED - مينفعش يتلغي
    const cancelAttempt = await request(app.getHttpServer())
      .post(`/procurement/purchase-returns/${returnDraft.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelAttempt.status).toBe(400);
  });

  test("مرتجع مشتريات: DRAFT بينلغي بنجاح، وبعد كده مينفعش يترحّل", async () => {
    const returnDraft = await request(app.getHttpServer())
      .post("/procurement/purchase-returns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, reason: "غلط في الطلب", lines: [{ inventoryItemId, quantity: 2, unit: "لتر" }] });

    const cancelled = await request(app.getHttpServer())
      .post(`/procurement/purchase-returns/${returnDraft.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelled.body.status).toBe("CANCELLED");

    const postAttempt = await request(app.getHttpServer())
      .post(`/procurement/purchase-returns/${returnDraft.body.id}/post`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(postAttempt.status).toBe(400);
  });

  test("كاشير معندوش purchasing.view -> 403 على طلبات ومرتجعات المشتريات", async () => {
    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({
      name: "كاشير-طلبات-موردين-جست", email: "cashier-purchase-requests@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-purchase-requests@jest.test", password: "12345678" });

    const reqRes = await request(app.getHttpServer())
      .get("/procurement/purchase-requests")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(reqRes.status).toBe(403);

    const retRes = await request(app.getHttpServer())
      .get("/procurement/purchase-returns")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(retRes.status).toBe(403);

    await sql`DELETE FROM users WHERE email = 'cashier-purchase-requests@jest.test'`.execute(db);
  });
});
