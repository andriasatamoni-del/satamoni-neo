import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Production - أوامر التحويل (تصنيع/تعبئة) (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let flourId: string;
  let sugarId: string;
  let cakeId: string;
  let recipeId: string;
  let inventoryAccountId: string;
  let varianceAccountId: string;

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
    const { KyselyInventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository");
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({ name: "أدمن-تصنيع-جست", email: "admin-production@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin" });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-production@jest.test", password: "12345678" })).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع تصنيع-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const flour = InventoryItem.register({ name: "دقيق-تصنيع-جست", unit: "كيلو", unitCost: 10 });
    await inventoryRepo.save(flour);
    flourId = flour.id;
    const sugar = InventoryItem.register({ name: "سكر-تصنيع-جست", unit: "كيلو", unitCost: 5 });
    await inventoryRepo.save(sugar);
    sugarId = sugar.id;
    const cake = InventoryItem.register({ name: "كيكة-تصنيع-جست", unit: "قطعة", itemType: "manufactured" });
    await inventoryRepo.save(cake);
    cakeId = cake.id;

    const accountRepo = new KyselyAccountRepository(db);
    const inventoryAccount = Account.register({ code: "1400", name: "المخزون", accountType: "ASSET", isSystemAccount: true });
    const varianceAccount = Account.register({ code: "5300", name: "تكلفة بضاعة مباعة أخرى", accountType: "COGS", isSystemAccount: true });
    await accountRepo.save(inventoryAccount);
    await accountRepo.save(varianceAccount);
    inventoryAccountId = inventoryAccount.id;
    varianceAccountId = varianceAccount.id;

    // رصيد افتتاحي: 100 كيلو دقيق + 100 كيلو سكر
    await request(app.getHttpServer()).post("/inventory/movements").set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: flourId, branchId, movementType: "RECEIPT", quantityDelta: 100 });
    await request(app.getHttpServer()).post("/inventory/movements").set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: sugarId, branchId, movementType: "RECEIPT", quantityDelta: 100 });

    // وصفة "كيكة" manufactured_item: 2 كيلو دقيق + 1 كيلو سكر لكل وحدة ناتج
    const recipeRes = await request(app.getHttpServer()).post("/catalog/recipes").set("Authorization", `Bearer ${adminToken}`)
      .send({ recipeType: "manufactured_item", inventoryItemId: cakeId });
    recipeId = recipeRes.body.id;
    const versionRes = await request(app.getHttpServer()).post(`/catalog/recipes/${recipeId}/versions`).set("Authorization", `Bearer ${adminToken}`)
      .send({ ingredients: [{ ingredientItemId: flourId, quantity: 2, unit: "كيلو" }, { ingredientItemId: sugarId, quantity: 1, unit: "كيلو" }] });
    const versionId = versionRes.body.versions[0].id;
    await request(app.getHttpServer()).post(`/catalog/recipes/${recipeId}/versions/${versionId}/activate`).set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM conversion_order_input_lines WHERE conversion_order_id IN (SELECT id FROM conversion_orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM conversion_orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${inventoryAccountId}, ${varianceAccountId})`.execute(db);
    await sql`DELETE FROM recipe_ingredients WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id = ${recipeId})`.execute(db);
    await sql`DELETE FROM recipe_versions WHERE recipe_id = ${recipeId}`.execute(db);
    await sql`DELETE FROM recipes WHERE id = ${recipeId}`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${flourId}, ${sugarId}, ${cakeId})`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-production@jest.test'`.execute(db);
    await app.close();
  });

  let conversionOrderId: string;

  test("POST /production - بيعمل أمر تحويل DRAFT وبيحسب سطور المكوّنات المخططة صح", async () => {
    const res = await request(app.getHttpServer()).post("/production").set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, recipeId, plannedOutputQuantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    conversionOrderId = res.body.id;
    const flourLine = res.body.inputLines.find((l: { ingredientItemId: string }) => l.ingredientItemId === flourId);
    const sugarLine = res.body.inputLines.find((l: { ingredientItemId: string }) => l.ingredientItemId === sugarId);
    expect(flourLine.plannedQuantity).toBe(10);
    expect(sugarLine.plannedQuantity).toBe(5);
  });

  test("POST /production/:id/approve - DRAFT -> APPROVED", async () => {
    const res = await request(app.getHttpServer()).post(`/production/${conversionOrderId}/approve`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPROVED");
  });

  test("POST /production/:id/start - بيستهلك المكوّنات فعليًا من رصيد الفرع", async () => {
    const res = await request(app.getHttpServer()).post(`/production/${conversionOrderId}/start`).set("Authorization", `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("IN_PROGRESS");

    const flourBalance = await request(app.getHttpServer()).get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${flourId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(flourBalance.body.quantity).toBe(90); // 100 - 10
    const sugarBalance = await request(app.getHttpServer()).get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${sugarId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(sugarBalance.body.quantity).toBe(95); // 100 - 5
  });

  test("POST /production/:id/complete - بينتج الكمية الفعلية وبيرحّل قيد متزن (بلا فرق هنا)", async () => {
    const journalBefore = (await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`)).body.length;

    const res = await request(app.getHttpServer()).post(`/production/${conversionOrderId}/complete`).set("Authorization", `Bearer ${adminToken}`)
      .send({ actualOutputQuantity: 5 }); // زي المخطط بالظبط - فرق صفر
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.outputUnitCost).toBe(25); // 2*10 + 1*5

    const cakeBalance = await request(app.getHttpServer()).get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${cakeId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(cakeBalance.body.quantity).toBe(5);

    const journalAfter = await request(app.getHttpServer()).get("/accounting/journal-entries?sourceType=conversion_order").set("Authorization", `Bearer ${adminToken}`);
    const posted = journalAfter.body.find((e: { sourceId: string }) => e.sourceId === conversionOrderId);
    expect(posted).toBeTruthy();
    expect(posted.status).toBe("POSTED");
    const debitTotal = posted.lines.reduce((sum: number, l: { debit: string }) => sum + Number(l.debit), 0);
    const creditTotal = posted.lines.reduce((sum: number, l: { credit: string }) => sum + Number(l.credit), 0);
    expect(debitTotal).toBe(125); // 25 * 5
    expect(creditTotal).toBe(125);

    const allAfter = await request(app.getHttpServer()).get("/accounting/journal-entries").set("Authorization", `Bearer ${adminToken}`);
    expect(allAfter.body.length).toBe(journalBefore + 1);
  });

  test("أمر تحويل جديد: فرق إنتاج كبير من غير سبب -> 400، ومع سبب بيتقفل وبيترحّل فرق لحساب 5300", async () => {
    const create = await request(app.getHttpServer()).post("/production").set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, recipeId, plannedOutputQuantity: 10 });
    const orderId = create.body.id;
    await request(app.getHttpServer()).post(`/production/${orderId}/approve`).set("Authorization", `Bearer ${adminToken}`);
    await request(app.getHttpServer()).post(`/production/${orderId}/start`).set("Authorization", `Bearer ${adminToken}`).send({});

    const withoutReason = await request(app.getHttpServer()).post(`/production/${orderId}/complete`).set("Authorization", `Bearer ${adminToken}`)
      .send({ actualOutputQuantity: 6 }); // فرق -40% - أكبر من الحد المسموح (10%)
    expect(withoutReason.status).toBe(400);

    const withReason = await request(app.getHttpServer()).post(`/production/${orderId}/complete`).set("Authorization", `Bearer ${adminToken}`)
      .send({ actualOutputQuantity: 6, varianceReason: "خلل في الفرن" });
    expect(withReason.status).toBe(201);
    expect(withReason.body.status).toBe("COMPLETED");
    // standardUnitCost لكل وحدة = 25، finishedGoodsValue = 25*6=150، rawMaterialValue = مستهلك فعلي (20 دقيق+10 سكر) = 200+50=250
    // الفرق = 150-250 = -100 -> يترحّل مدين على 5300
    const entries = await request(app.getHttpServer()).get("/accounting/journal-entries?sourceType=conversion_order").set("Authorization", `Bearer ${adminToken}`);
    const posted = entries.body.find((e: { sourceId: string }) => e.sourceId === orderId);
    expect(posted).toBeTruthy();
    const varianceLine = posted.lines.find((l: { accountId: string }) => l.accountId === varianceAccountId);
    expect(Number(varianceLine.debit)).toBe(100);
  });

  test("أمر تحويل جديد: إلغاء وهو IN_PROGRESS بيرجّع المكوّنات المستهلكة", async () => {
    const before = await request(app.getHttpServer()).get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${flourId}`).set("Authorization", `Bearer ${adminToken}`);

    const create = await request(app.getHttpServer()).post("/production").set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, recipeId, plannedOutputQuantity: 2 });
    const orderId = create.body.id;
    await request(app.getHttpServer()).post(`/production/${orderId}/approve`).set("Authorization", `Bearer ${adminToken}`);
    await request(app.getHttpServer()).post(`/production/${orderId}/start`).set("Authorization", `Bearer ${adminToken}`).send({});

    const cancel = await request(app.getHttpServer()).post(`/production/${orderId}/cancel`).set("Authorization", `Bearer ${adminToken}`).send({ reason: "غلط" });
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe("CANCELLED");

    const after = await request(app.getHttpServer()).get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${flourId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(after.body.quantity).toBe(before.body.quantity); // رجع زي ما كان (4 كيلو اتخصموا واترجعوا)
  });

  test("كاشير معندوش production.approve -> 403", async () => {
    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({ name: "كاشير-تصنيع-جست", email: "cashier-production@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier" });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-production@jest.test", password: "12345678" });

    const create = await request(app.getHttpServer()).post("/production").set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, recipeId, plannedOutputQuantity: 1 });
    const res = await request(app.getHttpServer()).post(`/production/${create.body.id}/approve`).set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(403);

    await sql`DELETE FROM conversion_order_input_lines WHERE conversion_order_id = ${create.body.id}`.execute(db);
    await sql`DELETE FROM conversion_orders WHERE id = ${create.body.id}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'cashier-production@jest.test'`.execute(db);
  });
});
