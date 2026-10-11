import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE, KYSELY } from "../../../src/shared/database/database.module";
import { createSecondUser } from "../helpers/second-user";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { accounts, journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { goodsReceiptItems, goodsReceipts, supplierInvoiceLines, supplierInvoices, supplierPayments, suppliers } from "../../../src/contexts/procurement/infrastructure/persistence/procurement.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import { truncate } from "../helpers/db";

describe("Procurement - فواتير وسدادات الموردين (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let approverToken: string; // BL-05: invoice approver must differ from the user who registered it
  let branchId: string;
  let treasuryId: string;
  let inventoryItemId: string;
  let supplierId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const { InventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { KyselyAccountRepository } = await import(
      "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository"
    );
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-فواتير-موردين-جست", email: "admin-supplier-invoices@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-supplier-invoices@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    approverToken = (await createSecondUser(app, "approver-supplier-invoices@jest.test", "accountant")).token;

    // POST /branches بينشر BranchRegisteredEvent -> Treasury بيعمل خزينة رئيسية تلقائيًا
    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع فواتير-موردين-جست" });
    branchId = branchRes.body.id;
    const treasuriesRes = await request(app.getHttpServer())
      .get(`/treasuries?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    treasuryId = treasuriesRes.body[0].id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const item = InventoryItem.register({ name: "أرز-فواتير-موردين-جست", unit: "كيلو" });
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
      .send({ name: "مورد-فواتير-جست" });
    supplierId = supplierRes.body.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(supplierPayments);
    await db.delete(supplierInvoiceLines);
    await db.delete(supplierInvoices);
    await db.delete(goodsReceiptItems);
    await db.delete(goodsReceipts);
    await db.delete(suppliers);
    await truncate(db, journalEntryLines, journalEntries);
    await db.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    await db.delete(accounts).where(inArray(accounts.code, ["1400", "2100"]));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(inArray(users.email, ["admin-supplier-invoices@jest.test", "approver-supplier-invoices@jest.test"]));
    await app.close();
  });

  test("تأكيد استلام بضاعة بمورد -> بيرحّل قيد AP تلقائي ويزوّد رصيد المورد (اللي واجبنا ليه)", async () => {
    const balanceBefore = await request(app.getHttpServer())
      .get(`/procurement/suppliers/${supplierId}/balance`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceBefore.body.balance).toBe(0);

    const receipt = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 100, unitCost: 10 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receipt.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);

    const balanceAfter = await request(app.getHttpServer())
      .get(`/procurement/suppliers/${supplierId}/balance`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceAfter.body.balance).toBe(1000); // 100 × 10
  });

  test("فاتورة مورد مطابقة تمامًا لاستلام (فرق صفر) - بتتسجل MATCHED وبتتاعتمد من غير أي قيد إضافي", async () => {
    const receipt = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 20, unitCost: 10 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receipt.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);

    const invoice = await request(app.getHttpServer())
      .post("/procurement/supplier-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, goodsReceiptId: receipt.body.id, supplierInvoiceNumber: "INV-MATCHED-1",
        lines: [{ inventoryItemId, invoicedQuantity: 20, unitPrice: 10 }],
      });
    expect(invoice.status).toBe(201);
    expect(invoice.body.status).toBe("MATCHED");
    expect(invoice.body.varianceAmount).toBe(0);

    const balanceBeforeApprove = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;

    const approved = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${approverToken}`);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("APPROVED");

    const balanceAfterApprove = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;
    expect(balanceAfterApprove).toBe(balanceBeforeApprove); // فرق صفر - مفيش قيد إضافي اترحّل
  });

  test("فاتورة مورد بسعر أعلى من الاستلام (فرق موجب) - بتتسجل VARIANCE_PENDING وبيترحّل قيد الفرق وقت الاعتماد", async () => {
    const receipt = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 10, unitCost: 10 }] }); // قيمة الاستلام 100
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receipt.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);

    const invoice = await request(app.getHttpServer())
      .post("/procurement/supplier-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, goodsReceiptId: receipt.body.id, supplierInvoiceNumber: "INV-VARIANCE-1",
        lines: [{ inventoryItemId, invoicedQuantity: 10, unitPrice: 12 }], // فاتورة المورد 120 - فرق +20
      });
    expect(invoice.body.status).toBe("VARIANCE_PENDING");
    expect(invoice.body.varianceAmount).toBe(20);

    const balanceBeforeApprove = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;

    const approved = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${approverToken}`);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("APPROVED");

    const balanceAfterApprove = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;
    expect(balanceAfterApprove).toBe(balanceBeforeApprove + 20); // فرق الـ20 اترحّل فعليًا كزيادة في اللي واجبنا ليه

    // اعتماد تاني على نفس الفاتورة - idempotent، مفيش قيد تاني يترحّل
    const secondApprove = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${approverToken}`);
    expect(secondApprove.status).toBe(201);
    const balanceAfterSecondApprove = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;
    expect(balanceAfterSecondApprove).toBe(balanceAfterApprove);
  });

  test("سداد المورد بالكامل من الخزينة الرئيسية - بيقفل الفاتورة PAID ويقلل رصيد المورد ورصيد الخزينة", async () => {
    const receipt = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 5, unitCost: 10 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receipt.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    const invoice = await request(app.getHttpServer())
      .post("/procurement/supplier-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, goodsReceiptId: receipt.body.id, supplierInvoiceNumber: "INV-PAY-1",
        lines: [{ inventoryItemId, invoicedQuantity: 5, unitPrice: 10 }],
      });
    await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${approverToken}`);

    const treasuryBalanceBefore = (
      await request(app.getHttpServer()).get(`/treasuries?branchId=${branchId}`).set("Authorization", `Bearer ${adminToken}`)
    ).body.find((t: { id: string }) => t.id === treasuryId).balance;

    // زيادة عن قيمة الفاتورة -> مرفوض
    const overpay = await request(app.getHttpServer())
      .post("/procurement/supplier-payments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, supplierInvoiceId: invoice.body.id, treasuryId, amount: 100 });
    expect(overpay.status).toBe(400);

    const payment = await request(app.getHttpServer())
      .post("/procurement/supplier-payments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, supplierInvoiceId: invoice.body.id, treasuryId, amount: 50 });
    expect(payment.status).toBe(201);

    const invoiceAfter = await request(app.getHttpServer())
      .get(`/procurement/supplier-invoices/${invoice.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(invoiceAfter.body.invoice.status).toBe("PAID");

    const treasuryBalanceAfter = (
      await request(app.getHttpServer()).get(`/treasuries?branchId=${branchId}`).set("Authorization", `Bearer ${adminToken}`)
    ).body.find((t: { id: string }) => t.id === treasuryId).balance;
    expect(treasuryBalanceAfter).toBe(treasuryBalanceBefore - 50);

    // فيها سداد بالفعل - مينفعش تتلغي
    const cancelAttempt = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(cancelAttempt.status).toBe(400);
  });

  test("إلغاء فاتورة معتمدة من غير سدادات - بيعكس قيد الفرق (لو موجود)", async () => {
    const receipt = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 3, unitCost: 10 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receipt.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    const invoice = await request(app.getHttpServer())
      .post("/procurement/supplier-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId, goodsReceiptId: receipt.body.id, supplierInvoiceNumber: "INV-CANCEL-1",
        lines: [{ inventoryItemId, invoicedQuantity: 3, unitPrice: 15 }], // فرق +15
      });
    await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/approve`)
      .set("Authorization", `Bearer ${approverToken}`);

    const balanceBeforeCancel = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;

    const cancelled = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "خطأ في التسجيل" });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe("CANCELLED");

    const balanceAfterCancel = (
      await request(app.getHttpServer()).get(`/procurement/suppliers/${supplierId}/balance`).set("Authorization", `Bearer ${adminToken}`)
    ).body.balance;
    expect(balanceAfterCancel).toBe(balanceBeforeCancel - 15); // قيد الفرق اتعكس
  });

  test("كاشير معندوش purchasing.view -> 403", async () => {
    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get<Database>(DATABASE);
    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({
      name: "كاشير-فواتير-موردين-جست", email: "cashier-supplier-invoices@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-supplier-invoices@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer())
      .get("/procurement/supplier-invoices")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(403);

    await db.delete(users).where(eq(users.email, "cashier-supplier-invoices@jest.test"));
  });
});
