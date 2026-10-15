import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryBatches, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { goodsReceiptItems, goodsReceipts, suppliers } from "../../../src/contexts/procurement/infrastructure/persistence/procurement.tables";
import { conversionOrderInputLines, conversionOrders } from "../../../src/contexts/production/infrastructure/persistence/production.tables";
import type { Database } from "../../../src/shared/database/database.token";

// BATCH-1: تتبّع دفعات/لوط - راجع تعليق inventory-batch.aggregate.ts لنطاق الميزة (استلام رسمي/إنتاج بس،
// استهلاك يدوي، تتبّع مستوى واحد). هنا بنغطي المسارين الرئيسيين: GRN (procurement) وConversionOrder
// (production)، بالإضافة لتقرير expiring-batches
describe("Inventory - دفعات/لوط (BATCH-1, e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let rawItemId: string;
  let supplierId: string;
  let cakeId: string;
  let flourId: string;
  let recipeId: string;
  let conversionOrderId: string;

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

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-دفعات-جست", email: "admin-batches@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-batches@jest.test", password: "12345678" })).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع-دفعات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const rawItem = InventoryItem.register({ name: "جبنة-دفعات-جست", unit: "كيلو" });
    await inventoryRepo.save(rawItem);
    rawItemId = rawItem.id;

    const flour = InventoryItem.register({ name: "دقيق-دفعات-جست", unit: "كيلو", unitCost: 10 });
    await inventoryRepo.save(flour);
    flourId = flour.id;
    const cake = InventoryItem.register({ name: "كيكة-دفعات-جست", unit: "قطعة", itemType: "manufactured" });
    await inventoryRepo.save(cake);
    cakeId = cake.id;

    const supplierRepo = new SupplierRepository(app.get<Database>(DATABASE));
    const supplier = Supplier.register({ name: "مورد-دفعات-جست" });
    await supplierRepo.save(supplier);
    supplierId = supplier.id;

    // رصيد افتتاحي للدقيق عشان أمر التحويل يقدر يستهلكه
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: flourId, branchId, movementType: "RECEIPT", quantityDelta: 100 });

    const recipeRes = await request(app.getHttpServer())
      .post("/catalog/recipes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ recipeType: "manufactured_item", inventoryItemId: cakeId });
    recipeId = recipeRes.body.id;
    const versionRes = await request(app.getHttpServer())
      .post(`/catalog/recipes/${recipeId}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ingredients: [{ ingredientItemId: flourId, quantity: 2, unit: "كيلو" }] });
    const versionId = versionRes.body.versions[0].id;
    await request(app.getHttpServer()).post(`/catalog/recipes/${recipeId}/versions/${versionId}/activate`).set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(inventoryBatches).where(eq(inventoryBatches.branch_id, branchId));
    await db.delete(goodsReceiptItems).where(inArray(goodsReceiptItems.goods_receipt_id, db.select({ id: goodsReceipts.id }).from(goodsReceipts).where(eq(goodsReceipts.branch_id, branchId))));
    await db.delete(goodsReceipts).where(eq(goodsReceipts.branch_id, branchId));
    await db.delete(conversionOrderInputLines).where(inArray(conversionOrderInputLines.conversion_order_id, db.select({ id: conversionOrders.id }).from(conversionOrders).where(eq(conversionOrders.branch_id, branchId))));
    await db.delete(conversionOrders).where(eq(conversionOrders.branch_id, branchId));
    await db.delete(recipeIngredients).where(inArray(recipeIngredients.recipe_version_id, db.select({ id: recipeVersions.id }).from(recipeVersions).where(eq(recipeVersions.recipe_id, recipeId))));
    await db.delete(recipeVersions).where(eq(recipeVersions.recipe_id, recipeId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(inArray(branchStockBalances.inventory_item_id, [rawItemId, flourId, cakeId]));
    await db.delete(suppliers).where(eq(suppliers.id, supplierId));
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, [rawItemId, flourId, cakeId]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-batches@jest.test"));
    await app.close();
  });

  let batchId: string;

  test("POST /procurement/goods-receipts/:id/confirm ببند له expiryDate - بيعمل دفعة", async () => {
    const grn = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId, branchId,
        lines: [{ inventoryItemId: rawItemId, quantity: 20, unitCost: 15, expiryDate: "2026-12-31" }],
      });
    expect(grn.status).toBe(201);

    const confirmed = await request(app.getHttpServer())
      .post(`/procurement/goods-receipts/${grn.body.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(confirmed.status).toBe(201);

    const batches = await request(app.getHttpServer())
      .get(`/inventory/items/${rawItemId}/batches?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(batches.status).toBe(200);
    expect(batches.body).toHaveLength(1);
    expect(batches.body[0].receivedQuantity).toBe(20);
    expect(batches.body[0].remainingQuantity).toBe(20);
    expect(batches.body[0].expiryDate.slice(0, 10)).toBe("2026-12-31");
    expect(batches.body[0].sourceType).toBe("purchase");
    expect(batches.body[0].sourceId).toBe(grn.body.id);
    expect(batches.body[0].batchNumber).toMatch(/^BATCH-/);
    batchId = batches.body[0].id;
  });

  test("POST /procurement/goods-receipts/:id/confirm من غير expiryDate - مفيش دفعة تتعمل", async () => {
    const grn = await request(app.getHttpServer())
      .post("/procurement/goods-receipts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ supplierId, branchId, lines: [{ inventoryItemId: rawItemId, quantity: 5, unitCost: 15 }] });
    await request(app.getHttpServer()).post(`/procurement/goods-receipts/${grn.body.id}/confirm`).set("Authorization", `Bearer ${adminToken}`);

    const batches = await request(app.getHttpServer())
      .get(`/inventory/items/${rawItemId}/batches?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(batches.body).toHaveLength(1); // نفس الدفعة من الاختبار السابق بس
  });

  test("POST /inventory/batches/:id/write-off بكمية جزئية - بينقص المتبقي وتفضل active", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/batches/${batchId}/write-off`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 8 });
    expect(res.status).toBe(201);
    expect(res.body.remainingQuantity).toBe(12);
    expect(res.body.status).toBe("active");
  });

  test("POST /inventory/batches/:id/write-off لباقي الكمية بالظبط - تقفل الدفعة (depleted)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/batches/${batchId}/write-off`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 12 });
    expect(res.status).toBe(201);
    expect(res.body.remainingQuantity).toBe(0);
    expect(res.body.status).toBe("depleted");

    const batches = await request(app.getHttpServer())
      .get(`/inventory/items/${rawItemId}/batches?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(batches.body).toHaveLength(0); // بس النشطة بترجع
  });

  test("POST /inventory/batches/:id/write-off لدفعة مش نشطة -> 409 (تعارض حالة)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/batches/${batchId}/write-off`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(409);
  });

  test("POST /production/conversion-orders/:id/complete بـexpiryDate - بيعمل دفعة للناتج", async () => {
    const orderRes = await request(app.getHttpServer())
      .post("/production")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, recipeId, plannedOutputQuantity: 5 });
    conversionOrderId = orderRes.body.id;

    await request(app.getHttpServer()).post(`/production/${conversionOrderId}/approve`).set("Authorization", `Bearer ${adminToken}`);
    await request(app.getHttpServer()).post(`/production/${conversionOrderId}/start`).set("Authorization", `Bearer ${adminToken}`);

    const completed = await request(app.getHttpServer())
      .post(`/production/${conversionOrderId}/complete`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ actualOutputQuantity: 5, expiryDate: "2026-11-15" });
    expect(completed.status).toBe(201);

    const batches = await request(app.getHttpServer())
      .get(`/inventory/items/${cakeId}/batches?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(batches.status).toBe(200);
    expect(batches.body).toHaveLength(1);
    expect(batches.body[0].receivedQuantity).toBe(5);
    expect(batches.body[0].sourceType).toBe("production");
    expect(batches.body[0].sourceId).toBe(conversionOrderId);
    expect(batches.body[0].expiryDate.slice(0, 10)).toBe("2026-11-15");
  });

  test("GET /reports/expiring-batches - بيرجّع الدفعات ضمن المدى بس", async () => {
    const soon = await request(app.getHttpServer())
      .get(`/reports/expiring-batches?days=3&branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(soon.status).toBe(200);
    // الدفعتين المتبقيتين ("جبنة" اتصفّرت، "كيكة" صلاحيتها 2026-11-15) بعيدين عن أي مدى قريب من دلوقتي
    expect(soon.body.every((b: { itemName: string }) => b.itemName !== "جبنة-دفعات-جست")).toBe(true);

    const wideRange = await request(app.getHttpServer())
      .get(`/reports/expiring-batches?days=100000&branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(wideRange.body.some((b: { itemName: string }) => b.itemName === "كيكة-دفعات-جست")).toBe(true);
  });
});
