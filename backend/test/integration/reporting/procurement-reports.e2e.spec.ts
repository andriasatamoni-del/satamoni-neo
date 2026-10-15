import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { goodsReceiptItems, goodsReceipts, purchaseOrderItems, purchaseOrders, suppliers } from "../../../src/contexts/procurement/infrastructure/persistence/procurement.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import { businessDateString } from "../../../src/shared/time/business-date";

describe("Reporting - تقارير المشتريات (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let branchId: string;
  let inventoryItemId: string;
  let supplierId: string;
  let poReceivedId: string;
  let poOutstandingId: string;
  const today = businessDateString();

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
    const { BranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { InventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تقارير-مشتريات-جست", email: "admin-procreports@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-procreports@jest.test", password: "12345678" })).body.token;

    const cashier = User.register({
      name: "كاشير-تقارير-مشتريات-جست", email: "cashier-procreports@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["cashier"],
    });
    await userRepo.save(cashier);
    cashierToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-procreports@jest.test", password: "12345678" })).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع-تقارير-مشتريات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const item = InventoryItem.register({ name: "دقيق-تقارير-مشتريات-جست", unit: "كيلو" });
    await inventoryRepo.save(item);
    inventoryItemId = item.id;

    const supplierRes = await request(app.getHttpServer())
      .post("/procurement/suppliers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مورد-تقارير-مشتريات-جست" });
    supplierId = supplierRes.body.id;

    // أمر شراء 1 - هيتبعت ويتأكد استلامه بالكامل (سعر 100)
    const po1Res = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 10, unitPrice: 100 }] });
    poReceivedId = po1Res.body.id;
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${poReceivedId}/send`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    const receiptRes = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ purchaseOrderId: poReceivedId, supplierId, branchId, lines: [{ inventoryItemId, quantity: 10, unitCost: 100 }] });
    await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${receiptRes.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    // أمر شراء 2 - هيتبعت بس هيفضل من غير استلام (سعر أعلى 120 - عشان اختبار فرق السعر)
    const po2Res = await request(app.getHttpServer())
      .post("/procurement/purchase-orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId, quantity: 5, unitPrice: 120 }] });
    poOutstandingId = po2Res.body.id;
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${poOutstandingId}/send`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(goodsReceiptItems).where(inArray(goodsReceiptItems.goods_receipt_id, db.select({ id: goodsReceipts.id }).from(goodsReceipts).where(eq(goodsReceipts.branch_id, branchId))));
    await db.delete(goodsReceipts).where(eq(goodsReceipts.branch_id, branchId));
    await db.delete(purchaseOrderItems).where(inArray(purchaseOrderItems.purchase_order_id, [poReceivedId, poOutstandingId]));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, [poReceivedId, poOutstandingId]));
    await db.delete(suppliers).where(eq(suppliers.id, supplierId));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
    await db.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(inArray(users.email, ["admin-procreports@jest.test", "cashier-procreports@jest.test"]));
    await app.close();
  });

  test("GET /reports/purchase-orders - القائمة مع عدد البنود والقيمة الإجمالية", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/purchase-orders?supplierId=${supplierId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((r: { id: string }) => r.id);
    expect(ids).toContain(poReceivedId);
    expect(ids).toContain(poOutstandingId);
    const row1 = res.body.find((r: { id: string }) => r.id === poReceivedId);
    expect(row1.itemsCount).toBe(1);
    expect(row1.totalValue).toBe(1000);
  });

  test("GET /reports/purchase-receipts - أذون الاستلام المؤكّدة بس", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/purchase-receipts?supplierId=${supplierId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].purchaseOrderId).toBe(poReceivedId);
    expect(res.body[0].totalValue).toBe(1000);
  });

  test("GET /reports/purchase-price-history - تاريخ سعر الصنف مرتّب من الأحدث", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/purchase-price-history?inventoryItemId=${inventoryItemId}&supplierId=${supplierId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].unitPrice).toBe(120); // الأحدث الأول
    expect(res.body[1].unitPrice).toBe(100);
  });

  test("GET /reports/purchase-price-variance - فرق السعر عن آخر أمر شراء لنفس المورد والصنف", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/purchase-price-variance?from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const row1 = res.body.find((r: { purchaseOrderId: string }) => r.purchaseOrderId === poReceivedId);
    expect(row1.previousPrice).toBeNull(); // أول أمر شراء لنفس المورد والصنف - مفيش سعر سابق

    const row2 = res.body.find((r: { purchaseOrderId: string }) => r.purchaseOrderId === poOutstandingId);
    expect(row2.previousPrice).toBe(100);
    expect(row2.newPrice).toBe(120);
    expect(row2.difference).toBe(20);
    expect(row2.differencePercent).toBeCloseTo(20);
  });

  test("GET /reports/supplier-performance - معدّل التنفيذ ومتوسط مدة التسليم", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/supplier-performance?supplierId=${supplierId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ordersCount).toBe(2);
    expect(res.body.receivedOrdersCount).toBe(1);
    expect(res.body.fulfillmentRate).toBeCloseTo(50);
    expect(res.body.avgLeadTimeDays).not.toBeNull();
    expect(res.body.avgLeadTimeDays).toBeGreaterThanOrEqual(0);
  });

  test("GET /reports/outstanding-purchase-orders - بس اللي لسه من غير إذن استلام مؤكّد", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/outstanding-purchase-orders?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((r: { id: string }) => r.id);
    expect(ids).toContain(poOutstandingId);
    expect(ids).not.toContain(poReceivedId);
    const row = res.body.find((r: { id: string }) => r.id === poOutstandingId);
    expect(row.totalValue).toBe(600);
  });

  test("كاشير (معندوش purchasing.view) -> purchase-orders بيرجّع 403", async () => {
    const res = await request(app.getHttpServer())
      .get("/reports/purchase-orders")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });
});
