import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لتخطيط تصنيع السنتر كيتشن (Production Planning) - راجع تعليق get-production-plan.handler.ts.
// قراءة بحت مفيش أي كتابة على المخزون أو المحاسبة هنا خالص
describe("Production - تخطيط تصنيع السنتر كيتشن (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let ckBranchId: string;
  let branchId: string;
  let flourItemId: string;
  let breadItemId: string;
  let breadRecipeId: string;

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

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-تخطيط-جست", email: "admin-prodplan@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-prodplan@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const ck = Branch.register({ name: "سنتر كيتشن-تخطيط-جست", isCentralKitchen: true });
    await branchRepo.save(ck);
    ckBranchId = ck.id;
    const branch = Branch.register({ name: "فرع-تخطيط-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const itemRepo = new KyselyInventoryItemRepository(db);
    const flour = InventoryItem.register({ name: "دقيق-تخطيط-جست", unit: "كيلو", unitCost: 10 });
    await itemRepo.save(flour);
    flourItemId = flour.id;
    const bread = InventoryItem.register({ name: "خبز-تخطيط-جست", unit: "رغيف", itemType: "manufactured" });
    await itemRepo.save(bread);
    breadItemId = bread.id;

    // رصيد دقيق ابتدائي للسنتر كيتشن (100 كيلو) - كفاية لأي احتياج خام في الاختبار
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: flourItemId, branchId: ckBranchId, movementType: "RECEIPT", quantityDelta: 100 });

    // وصفة خبز: 0.5 كيلو دقيق لكل رغيف
    const recipeRes = await request(app.getHttpServer())
      .post("/catalog/recipes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ recipeType: "manufactured_item", inventoryItemId: breadItemId });
    breadRecipeId = recipeRes.body.id;
    const versionRes = await request(app.getHttpServer())
      .post(`/catalog/recipes/${breadRecipeId}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ingredients: [{ ingredientItemId: flourItemId, quantity: 0.5 }] });
    const versionId = versionRes.body.versions[versionRes.body.versions.length - 1].id;
    await request(app.getHttpServer())
      .post(`/catalog/recipes/${breadRecipeId}/versions/${versionId}/activate`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM conversion_order_input_lines WHERE conversion_order_id IN (SELECT id FROM conversion_orders WHERE branch_id = ${ckBranchId})`.execute(db);
    await sql`DELETE FROM conversion_orders WHERE branch_id = ${ckBranchId}`.execute(db);
    await sql`DELETE FROM transfer_request_lines WHERE transfer_request_id IN (SELECT id FROM transfer_requests WHERE from_branch_id = ${ckBranchId})`.execute(db);
    await sql`DELETE FROM transfer_requests WHERE from_branch_id = ${ckBranchId}`.execute(db);
    await sql`DELETE FROM recipe_ingredients WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id = ${breadRecipeId})`.execute(db);
    await sql`DELETE FROM recipe_versions WHERE recipe_id = ${breadRecipeId}`.execute(db);
    await sql`DELETE FROM recipes WHERE id = ${breadRecipeId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id IN (${ckBranchId}, ${branchId})`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id IN (${ckBranchId}, ${branchId})`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${flourItemId}, ${breadItemId})`.execute(db);
    await sql`DELETE FROM branches WHERE id IN (${ckBranchId}, ${branchId})`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-prodplan@jest.test'`.execute(db);
    await app.close();
  });

  test("GET /production/planning/plan - صنف من غير أي طلب -> requiredProduction=0", async () => {
    const res = await request(app.getHttpServer())
      .get(`/production/planning/plan?ckBranchId=${ckBranchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.plan.find((r: { inventoryItemId: string }) => r.inventoryItemId === breadItemId);
    expect(row.requiredProduction).toBe(0);
    expect(row.hasActiveRecipe).toBe(true);
  });

  test("طلب SUBMITTED بس (لسه معتمدش) -> pendingDemand بس، requiredProduction لسه صفر", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .post("/inventory/transfer-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fromBranchId: ckBranchId, toBranchId: branchId, requiredDate: today, lines: [{ inventoryItemId: breadItemId, requestedQuantity: 8 }] });

    const res = await request(app.getHttpServer())
      .get(`/production/planning/plan?ckBranchId=${ckBranchId}&fromDate=${today}&toDate=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const row = res.body.plan.find((r: { inventoryItemId: string }) => r.inventoryItemId === breadItemId);
    expect(row.pendingDemand).toBe(8);
    expect(row.approvedDemand).toBe(0);
    expect(row.requiredProduction).toBe(0);
  });

  test("طلب معتمد (APPROVED) -> approvedDemand، requiredProduction = المعتمد - المتاح", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const createRes = await request(app.getHttpServer())
      .post("/inventory/transfer-requests")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fromBranchId: ckBranchId, toBranchId: branchId, requiredDate: today, lines: [{ inventoryItemId: breadItemId, requestedQuantity: 15 }] });
    await request(app.getHttpServer())
      .post(`/inventory/transfer-requests/${createRes.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    const res = await request(app.getHttpServer())
      .get(`/production/planning/plan?ckBranchId=${ckBranchId}&fromDate=${today}&toDate=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const row = res.body.plan.find((r: { inventoryItemId: string }) => r.inventoryItemId === breadItemId);
    expect(row.approvedDemand).toBe(15);
    expect(row.availableStock).toBe(0);
    expect(row.requiredProduction).toBe(15);
  });

  test("أمر تصنيع DRAFT مخطط بالفعل لنفس الصنف -> بيقلل المطلوب تصنيعه", async () => {
    await request(app.getHttpServer())
      .post("/production")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId: ckBranchId, recipeId: breadRecipeId, plannedOutputQuantity: 6 });

    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(`/production/planning/plan?ckBranchId=${ckBranchId}&fromDate=${today}&toDate=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const row = res.body.plan.find((r: { inventoryItemId: string }) => r.inventoryItemId === breadItemId);
    expect(row.plannedOrInProgress).toBe(6);
    expect(row.requiredProduction).toBe(9); // 15 معتمد - 0 متاح - 6 مخطط بالفعل
  });

  test("GET /production/planning/raw-materials - احتياج الخام لكمية معيّنة من الوصفة الفعلية", async () => {
    const res = await request(app.getHttpServer())
      .get(`/production/planning/raw-materials?ckBranchId=${ckBranchId}&inventoryItemId=${breadItemId}&quantity=9`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hasRecipe).toBe(true);
    const flourRow = res.body.raw.find((r: { inventoryItemId: string }) => r.inventoryItemId === flourItemId);
    expect(flourRow.required).toBe(4.5); // 9 رغيف × 0.5 كيلو
    expect(flourRow.available).toBe(100);
    expect(flourRow.shortage).toBe(0);
  });

  test("راجعين لصنف من غير وصفة -> hasRecipe=false", async () => {
    const res = await request(app.getHttpServer())
      .get(`/production/planning/raw-materials?ckBranchId=${ckBranchId}&inventoryItemId=${flourItemId}&quantity=5`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.hasRecipe).toBe(false);
  });
});
