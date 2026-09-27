import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

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

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { KyselySupplierRepository } = await import("../../../src/contexts/procurement/infrastructure/persistence/kysely-supplier.repository");
    const { Supplier } = await import("../../../src/contexts/procurement/domain/supplier.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-دفعات-جست", email: "admin-batches@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-batches@jest.test", password: "12345678" })).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع-دفعات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const rawItem = InventoryItem.register({ name: "جبنة-دفعات-جست", unit: "كيلو" });
    await inventoryRepo.save(rawItem);
    rawItemId = rawItem.id;

    const flour = InventoryItem.register({ name: "دقيق-دفعات-جست", unit: "كيلو", unitCost: 10 });
    await inventoryRepo.save(flour);
    flourId = flour.id;
    const cake = InventoryItem.register({ name: "كيكة-دفعات-جست", unit: "قطعة", itemType: "manufactured" });
    await inventoryRepo.save(cake);
    cakeId = cake.id;

    const supplierRepo = new KyselySupplierRepository(db);
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
    const db = app.get(KYSELY);
    await sql`DELETE FROM inventory_batches WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT id FROM goods_receipts WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM goods_receipts WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM conversion_order_input_lines WHERE conversion_order_id IN (SELECT id FROM conversion_orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM conversion_orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM recipe_ingredients WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id = ${recipeId})`.execute(db);
    await sql`DELETE FROM recipe_versions WHERE recipe_id = ${recipeId}`.execute(db);
    await sql`DELETE FROM recipes WHERE id = ${recipeId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE inventory_item_id IN (${rawItemId}, ${flourId}, ${cakeId})`.execute(db);
    await sql`DELETE FROM suppliers WHERE id = ${supplierId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${rawItemId}, ${flourId}, ${cakeId})`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-batches@jest.test'`.execute(db);
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

  test("POST /inventory/batches/:id/write-off لدفعة مش نشطة -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post(`/inventory/batches/${batchId}/write-off`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(400);
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
