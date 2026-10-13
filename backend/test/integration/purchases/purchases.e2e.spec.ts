import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { accounts, journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { goodsReceiptItems, goodsReceipts, suppliers } from "../../../src/contexts/procurement/infrastructure/persistence/procurement.tables";
import { purchaseLines, purchases } from "../../../src/contexts/purchases/infrastructure/persistence/purchases.tables";
import { truncate } from "../helpers/db";

// e2e للمشتريات النقدية الطارئة (purchases/purchase_lines) - راجع تعليق purchase.aggregate.ts للفلسفة.
// محاسب/مدير فرع بيسجّلوا CONFIRMED مباشرة، كاشير مقفول على فرعه/النهاردة وحالته دايمًا PENDING
// (محتاج مراجعة عبر /confirm أو /reject)
describe("Purchases - المشتريات النقدية الطارئة (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let branchId: string;
  let rawItemId: string;
  let supplierId: string;
  let inventoryAccountId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { InventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { SupplierRepository } = await import("../../../src/contexts/procurement/infrastructure/persistence/supplier.repository");
    const { Supplier } = await import("../../../src/contexts/procurement/domain/supplier.aggregate");
    const { AccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مشتريات-جست", email: "admin-purchases@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-purchases@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع-مشتريات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const cashier = User.register({
      name: "كاشير-مشتريات-جست", email: "cashier-purchases@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier", branchId,
    });
    await userRepo.save(cashier);
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-purchases@jest.test", password: "12345678" })
    ).body.token;

    const itemRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const rawItem = InventoryItem.register({ name: "دقيق-مشتريات-جست", unit: "kg" });
    await itemRepo.save(rawItem);
    rawItemId = rawItem.id;

    const supplierRepo = new SupplierRepository(app.get<Database>(DATABASE));
    const supplier = Supplier.register({ name: "مورد-مشتريات-جست" });
    await supplierRepo.save(supplier);
    supplierId = supplier.id;

    // حسابات النظام الحقيقية اللي PostPurchaseJournalEntryHandler بيعتمد عليها (1400 مخزون، 1100 كاش)
    // - نفس نمط expenses.e2e.spec.ts بالظبط
    const accountRepo = new AccountRepository(app.get<Database>(DATABASE));
    const inventoryAccount = Account.register({ code: "1400", name: "المخزون", accountType: "ASSET", isSystemAccount: true });
    const cash = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET", isSystemAccount: true });
    await accountRepo.save(inventoryAccount);
    await accountRepo.save(cash);
    inventoryAccountId = inventoryAccount.id;
    cashAccountId = cash.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(goodsReceiptItems).where(inArray(goodsReceiptItems.goods_receipt_id, db.select({ id: goodsReceipts.id }).from(goodsReceipts).where(eq(goodsReceipts.branch_id, branchId))));
    await db.delete(goodsReceipts).where(eq(goodsReceipts.branch_id, branchId));
    await db.delete(purchaseLines).where(inArray(purchaseLines.purchase_id, db.select({ id: purchases.id }).from(purchases).where(eq(purchases.branch_id, branchId))));
    await db.delete(purchases).where(eq(purchases.branch_id, branchId));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.inventory_item_id, rawItemId));
    await truncate(db, journalEntryLines, journalEntries);
    await db.delete(suppliers).where(eq(suppliers.id, supplierId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, rawItemId));
    await db.delete(accounts).where(inArray(accounts.id, [inventoryAccountId, cashAccountId]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(inArray(users.email, ["admin-purchases@jest.test", "cashier-purchases@jest.test"]));
    await app.close();
  });

  test("POST /purchases بمبلغ حر (من غير بنود) - أدمن -> CONFIRMED فورًا، ومفيش أي ترحيل مخزون أو قيد محاسبي خالص", async () => {
    const journalBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 300, notes: "مشترى نقدي حر" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.postedToInventory).toBe(false);
    expect(res.body.items).toHaveLength(0);

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(journalBefore);
  });

  test("POST /purchases ببنود حقيقية - أدمن -> CONFIRMED فورًا، بيترحّل حركة مخزون RECEIPT وقيد محاسبي (1400/1100)", async () => {
    const journalBefore = (
      await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)
    ).body.length;

    const res = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", items: [{ inventoryItemId: rawItemId, quantity: 10, unitPrice: 5 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.postedToInventory).toBe(true);
    expect(res.body.amount).toBe(50);

    const balanceRes = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${rawItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceRes.body.quantity).toBeGreaterThanOrEqual(10);

    const journalAfter = await request(app.getHttpServer())
      .get("/accounting/journal-entries")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(journalAfter.body.length).toBe(journalBefore + 1);
    const entry = journalAfter.body.find((e: { sourceId: string }) => e.sourceId === res.body.id);
    expect(entry).toBeDefined();
    expect(entry.sourceType).toBe("purchase");
    const debitLine = entry.lines.find((l: { debit: number }) => l.debit > 0);
    const creditLine = entry.lines.find((l: { credit: number }) => l.credit > 0);
    expect(debitLine.accountId).toBe(inventoryAccountId);
    expect(creditLine.accountId).toBe(cashAccountId);
  });

  test("POST /purchases ببند صنف مش raw أو مش موجود -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", items: [{ inventoryItemId: "00000000-0000-0000-0000-000000000000", quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(400);
  });

  test("مورد+رقم مستند مكرر -> 409، وacknowledgeDuplicate=true بيتخطّى الفحص", async () => {
    const first = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 100, supplierId, supplierDocumentNumber: "INV-001" });
    expect(first.status).toBe(201);

    const duplicate = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 100, supplierId, supplierDocumentNumber: "INV-001" });
    expect(duplicate.status).toBe(409);

    const acknowledged = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 100, supplierId, supplierDocumentNumber: "INV-001", acknowledgeDuplicate: true });
    expect(acknowledged.status).toBe(201);
  });

  test("SAFE-1: نفس المورد+رقم المستند مسجل كـGRN بالفعل -> مشترى نقدي بنفس المرجع بيرجّع 409 كمان (فحص متقاطع بين المسارين)", async () => {
    const grn = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, supplierDocumentNumber: "GRN-CROSS-001",
        lines: [{ inventoryItemId: rawItemId, quantity: 5, unitCost: 4 }],
      });
    expect(grn.status).toBe(201);

    const duplicate = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 20, supplierId, supplierDocumentNumber: "GRN-CROSS-001" });
    expect(duplicate.status).toBe(409);

    const acknowledged = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 20, supplierId, supplierDocumentNumber: "GRN-CROSS-001", acknowledgeDuplicate: true });
    expect(acknowledged.status).toBe(201);
  });

  test("SAFE-1: نفس المورد+رقم المستند مسجل كمشترى نقدي بالفعل -> تسجيل GRN بنفس المرجع بيرجّع 409 كمان", async () => {
    const purchase = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 30, supplierId, supplierDocumentNumber: "PURCHASE-CROSS-001" });
    expect(purchase.status).toBe(201);

    const duplicateGrn = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, supplierDocumentNumber: "PURCHASE-CROSS-001",
        lines: [{ inventoryItemId: rawItemId, quantity: 3, unitCost: 4 }],
      });
    expect(duplicateGrn.status).toBe(409);

    const acknowledgedGrn = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, supplierDocumentNumber: "PURCHASE-CROSS-001", acknowledgeDuplicate: true,
        lines: [{ inventoryItemId: rawItemId, quantity: 3, unitCost: 4 }],
      });
    expect(acknowledgedGrn.status).toBe(201);
  });

  test("كاشير: تسجيل مشترى بيتفرض PENDING وتاريخ النهاردة بغض النظر عن اللي اتبعت، ومتجاهل المورد، وفرع تاني -> 403 (BL-11)", async () => {
    const foreign = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId: "00000000-0000-0000-0000-000000000000", businessDate: "2020-01-01", amount: 40 });
    expect(foreign.status).toBe(403);

    const res = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        branchId,
        businessDate: "2020-01-01",
        amount: 40,
        supplierId,
        supplierDocumentNumber: "SHOULD-IGNORE",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.branchId).toBe(branchId);
    expect(res.body.supplierId).toBeNull();
  });

  test("كاشير معندوش purchases.review -> 403 لو حاول يعتمد مشترى", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId, businessDate: "2026-02-01", amount: 15 });

    const res = await request(app.getHttpServer())
      .post(`/purchases/${createRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  test("مسار المراجعة الكامل: كاشير يسجّل PENDING -> أدمن يعدّل (PATCH) ثم يعتمد (confirm) فبيترحّل", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId, businessDate: "2026-02-05", amount: 60 });
    expect(createRes.body.status).toBe("PENDING");

    const editRes = await request(app.getHttpServer())
      .patch(`/purchases/${createRes.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "اتراجعت" });
    expect(editRes.status).toBe(200);
    expect(editRes.body.notes).toBe("اتراجعت");

    const confirmRes = await request(app.getHttpServer())
      .post(`/purchases/${createRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.status).toBe("CONFIRMED");

    const reconfirm = await request(app.getHttpServer())
      .post(`/purchases/${createRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(reconfirm.status).toBe(409);
  });

  test("POST .../reject - أدمن بيرفض مشترى PENDING بسبب، وميتعملوش عليه confirm بعد كده", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/purchases")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId, businessDate: "2026-02-06", amount: 10 });

    const rejectRes = await request(app.getHttpServer())
      .post(`/purchases/${createRes.body.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "مبلغ غير موثّق" });
    expect(rejectRes.status).toBe(201);
    expect(rejectRes.body.status).toBe("REJECTED");
    expect(rejectRes.body.rejectionReason).toBe("مبلغ غير موثّق");

    const confirmAfterReject = await request(app.getHttpServer())
      .post(`/purchases/${createRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(confirmAfterReject.status).toBe(409);
  });

  test("GET /purchases?branchId= بيرجّع سجل الفرع، وكاشير بيشوف فرعه بس، وbranchId لفرع تاني -> 403 (BL-11)", async () => {
    const adminRes = await request(app.getHttpServer())
      .get(`/purchases?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.length).toBeGreaterThan(0);

    const foreign = await request(app.getHttpServer())
      .get("/purchases?branchId=00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(foreign.status).toBe(403);

    const cashierRes = await request(app.getHttpServer()).get("/purchases").set("Authorization", `Bearer ${cashierToken}`);
    expect(cashierRes.status).toBe(200);
    expect(cashierRes.body.every((p: { branchId: string }) => p.branchId === branchId)).toBe(true);
  });
});
