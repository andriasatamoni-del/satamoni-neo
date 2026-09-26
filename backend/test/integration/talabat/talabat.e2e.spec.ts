import "reflect-metadata";
import { createHmac } from "node:crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

const WEBHOOK_SECRET = "neo_test_talabat_webhook_secret";

function sign(rawBody: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(rawBody, "utf8").digest("hex");
}

// e2e لتكامل Talabat ضد تطبيق حقيقي كامل - بيغطي: توقيع الـwebhook (fail-closed)، dedupe، حالات
// MAPPING_ERROR (فرع/طريقة دفع/صنف مش مربوط)، مزامنة ناجحة (استهلاك مخزون حقيقي + قفل دفعة + قيد
// محاسبي)، إلغاء (عكس مخزون + عكس قيد)، وإعادة المحاولة بعد تصحيح الربط
describe("Talabat - تكامل شركة التوصيل (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchManagerToken: string;
  let branchId: string;
  let ingredientItemId: string;
  let menuItemId: string;
  let variantId: string;
  let paymentMethodId: string;
  let createdCashAccountId: string | null = null;
  let createdSalesAccountId: string | null = null;

  const talabatBranchId = "tal-branch-jest-1";
  const talabatPaymentCode = "tal-pay-jest-1";
  const talabatItemId = "tal-item-jest-1";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
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
    const { KyselyStockMovementRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { KyselyRecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
    const { KyselyPaymentMethodRepository } = await import(
      "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository"
    );
    const { PaymentMethod } = await import("../../../src/contexts/payment-control/domain/payment-method.aggregate");
    const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);

    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-Talabat-جست", email: "admin-talabat@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-talabat@jest.test", password: "12345678" })
    ).body.token;

    const branchManager = User.register({
      name: "مدير فرع-Talabat-جست", email: "bm-talabat@jest.test", passwordHash: await hasher.hash("12345678"), role: "branch_manager",
    });
    await userRepo.save(branchManager);
    branchManagerToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "bm-talabat@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع Talabat-جست" });
    branch.linkTalabatBranch(talabatBranchId);
    await branchRepo.save(branch);
    branchId = branch.id;

    const methodRepo = new KyselyPaymentMethodRepository(db);
    const method = PaymentMethod.register({ name: "Talabat - دفع آجل-جست", kind: "credit" });
    method.linkTalabatCode(talabatPaymentCode);
    await methodRepo.save(method);
    paymentMethodId = method.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "جبنة-Talabat-جست", unit: "كيلو", negativeStockPolicy: "STRICT" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;

    const movementRepo = new KyselyStockMovementRepository(db);
    await movementRepo.recordMovement(
      StockMovement.register({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 10 }),
      { allowNegativeBalance: true }
    );

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "بيتزا-Talabat-جست" });
    const variant = item.addVariant({ label: "وسط", price: 100 });
    await menuItemRepo.save(item);
    menuItemId = item.id;
    variantId = variant.id;

    const recipeRepo = new KyselyRecipeRepository(db);
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 });
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    const accountRepo = new KyselyAccountRepository(db);
    const existingCash = await accountRepo.findByCode("1100");
    if (!existingCash) {
      const cash = Account.register({ code: "1100", name: "الكاش", accountType: "ASSET" });
      await accountRepo.save(cash);
      createdCashAccountId = cash.id;
    }
    const existingSales = await accountRepo.findByCode("4100");
    if (!existingSales) {
      const sales = Account.register({ code: "4100", name: "مبيعات الطعام", accountType: "REVENUE" });
      await accountRepo.save(sales);
      createdSalesAccountId = sales.id;
    }
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM talabat_integration_errors`.execute(db);
    await sql`DELETE FROM talabat_webhook_events`.execute(db);
    await sql`DELETE FROM talabat_product_mapping WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM talabat_orders`.execute(db);
    await sql`DELETE FROM payments WHERE payment_method_id = ${paymentMethodId}`.execute(db);
    // القيود POSTED/REVERSED غير قابلة للحذف/التعديل بـDELETE عادي (trigger حقيقي على مستوى القاعدة -
    // نفس فلسفة عدم قابلية التعديل بالحرف) - TRUNCATE بيتخطّى الـtrigger زي باقي اختبارات المحاسبة
    // بالظبط (راجع order-sale-posting.e2e.spec.ts)
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    if (createdCashAccountId) await sql`DELETE FROM accounts WHERE id = ${createdCashAccountId}`.execute(db);
    if (createdSalesAccountId) await sql`DELETE FROM accounts WHERE id = ${createdSalesAccountId}`.execute(db);
    await sql`DELETE FROM print_jobs`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(db);
    await sql`DELETE FROM payment_methods WHERE id = ${paymentMethodId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-talabat@jest.test', 'bm-talabat@jest.test')`.execute(db);
    await app.close();
  });

  test("POST /talabat/webhook/orders من غير توقيع -> 401", async () => {
    const res = await request(app.getHttpServer()).post("/talabat/webhook/orders").send({ status: "CREATED" });
    expect(res.status).toBe(401);
  });

  test("POST /talabat/webhook/orders بتوقيع غلط -> 401", async () => {
    const res = await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", "0".repeat(64))
      .send({ status: "CREATED" });
    expect(res.status).toBe(401);
  });

  test("أوردر لفرع مش مربوط -> يتقبل الـwebhook بس يتسجّل MAPPING_ERROR (BRANCH_UNMAPPED)", async () => {
    const body = JSON.stringify({
      talabatOrderId: "TAL-ORDER-UNMAPPED-BRANCH",
      status: "CREATED",
      talabatBranchId: "غير-موجود",
      talabatPaymentCode,
      items: [{ talabatItemId, quantity: 1 }],
    });
    const res = await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(body))
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);

    const errors = await request(app.getHttpServer()).get("/talabat/integration-errors?status=OPEN").set("Authorization", `Bearer ${adminToken}`);
    expect(errors.body.some((e: { message: string }) => e.message === "BRANCH_UNMAPPED")).toBe(true);

    const orders = await request(app.getHttpServer()).get("/talabat/orders").set("Authorization", `Bearer ${adminToken}`);
    const failed = orders.body.find((o: { talabatOrderId: string }) => o.talabatOrderId === "TAL-ORDER-UNMAPPED-BRANCH");
    expect(failed.status).toBe("MAPPING_ERROR");
  });

  test("أوردر بطريقة دفع مش مربوطة -> MAPPING_ERROR (PAYMENT_METHOD_UNMAPPED)", async () => {
    const body = JSON.stringify({
      talabatOrderId: "TAL-ORDER-UNMAPPED-PAYMENT",
      status: "CREATED",
      talabatBranchId,
      talabatPaymentCode: "غير-موجود",
      items: [{ talabatItemId, quantity: 1 }],
    });
    await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(body))
      .set("Content-Type", "application/json")
      .send(body);

    const errors = await request(app.getHttpServer()).get("/talabat/integration-errors?status=OPEN").set("Authorization", `Bearer ${adminToken}`);
    expect(errors.body.some((e: { message: string }) => e.message === "PAYMENT_METHOD_UNMAPPED")).toBe(true);
  });

  test("أوردر بصنف مش مربوط -> MAPPING_ERROR، وبعد ربط الصنف وإعادة المحاولة بينجح ويتسجّل أوردر POS حقيقي", async () => {
    const body = JSON.stringify({
      talabatOrderId: "TAL-ORDER-RETRY",
      status: "CREATED",
      talabatBranchId,
      talabatPaymentCode,
      items: [{ talabatItemId, quantity: 2 }],
    });
    await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(body))
      .set("Content-Type", "application/json")
      .send(body);

    const errorsBefore = await request(app.getHttpServer())
      .get("/talabat/integration-errors?status=OPEN")
      .set("Authorization", `Bearer ${adminToken}`);
    const mappingError = errorsBefore.body.find((e: { talabatOrderId: string }) => e.talabatOrderId === "TAL-ORDER-RETRY");
    expect(mappingError).toBeDefined();
    expect(mappingError.message).toBe("MAPPING_ERROR");

    // مدير فرع مالوش صلاحية talabat.mapping_manage (أدمن بس) -> 403
    const forbidden = await request(app.getHttpServer())
      .post("/talabat/product-mapping")
      .set("Authorization", `Bearer ${branchManagerToken}`)
      .send({ branchId, talabatItemId, menuItemId, variantId });
    expect(forbidden.status).toBe(403);

    const mapRes = await request(app.getHttpServer())
      .post("/talabat/product-mapping")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, talabatItemId, menuItemId, variantId });
    expect(mapRes.status).toBe(201);

    const retryRes = await request(app.getHttpServer())
      .post(`/talabat/integration-errors/${mappingError.id}/retry`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(retryRes.status).toBe(201);
    expect(retryRes.body.status).toBe("RESOLVED");

    const orders = await request(app.getHttpServer()).get("/talabat/orders").set("Authorization", `Bearer ${adminToken}`);
    const imported = orders.body.find((o: { talabatOrderId: string }) => o.talabatOrderId === "TAL-ORDER-RETRY");
    expect(imported.status).toBe("IMPORTED");
    expect(imported.posOrderId).not.toBeNull();

    const posOrder = await request(app.getHttpServer())
      .get(`/orders?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const order = posOrder.body.find((o: { id: string }) => o.id === imported.posOrderId);
    expect(order.orderType).toBe("delivery");
    expect(order.paymentMethodId).toBe(paymentMethodId);
    expect(order.total).toBe(200); // 2 × 100

    // 2 بيتزا × 2 كيلو جبنة = 4 كيلو استهلاك من رصيد 10 -> يبقى 6
    const balance = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balance.body.quantity).toBe(6);

    // قيد بيع تلقائي اترحّل POSTED
    const journal = await request(app.getHttpServer())
      .get(`/accounting/journal-entries?sourceType=order_sale`)
      .set("Authorization", `Bearer ${adminToken}`);
    const saleEntry = journal.body.find((e: { sourceId: string }) => e.sourceId === imported.posOrderId);
    expect(saleEntry).toBeDefined();
    expect(saleEntry.status).toBe("POSTED");
  });

  test("نفس الجسم بالحرف تاني (إعادة إرسال webhook) -> duplicate=true من غير أي تكرار", async () => {
    const body = JSON.stringify({
      talabatOrderId: "TAL-ORDER-DUP",
      status: "CREATED",
      talabatBranchId,
      talabatPaymentCode,
      items: [{ talabatItemId, quantity: 1 }],
    });
    const first = await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(body))
      .set("Content-Type", "application/json")
      .send(body);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(body))
      .set("Content-Type", "application/json")
      .send(body);
    expect(second.body.duplicate).toBe(true);

    const orders = await request(app.getHttpServer()).get("/talabat/orders").set("Authorization", `Bearer ${adminToken}`);
    expect(orders.body.filter((o: { talabatOrderId: string }) => o.talabatOrderId === "TAL-ORDER-DUP")).toHaveLength(1);
  });

  test("إلغاء من Talabat لأوردر مستورد فعليًا -> بيلغي أوردر POS، بيعكس المخزون، وبيعكس القيد المحاسبي", async () => {
    const cancelBody = JSON.stringify({ talabatOrderId: "TAL-ORDER-RETRY", status: "CANCELED" });
    const res = await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(cancelBody))
      .set("Content-Type", "application/json")
      .send(cancelBody);
    expect(res.status).toBe(201);

    const orders = await request(app.getHttpServer()).get("/talabat/orders").set("Authorization", `Bearer ${adminToken}`);
    const canceled = orders.body.find((o: { talabatOrderId: string }) => o.talabatOrderId === "TAL-ORDER-RETRY");
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.cancellationSource).toBe("TALABAT");

    const posOrders = await request(app.getHttpServer())
      .get(`/orders?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const posOrder = posOrders.body.find((o: { id: string }) => o.id === canceled.posOrderId);
    expect(posOrder.status).toBe("cancelled");

    // المخزون اترجّع - الرصيد كان 10، الطلب الملغي ده استهلك 4 كيلو (رجعت)، وأوردر TAL-ORDER-DUP
    // (الاختبار اللي فات) استهلك 2 كيلو وفضل شغال (مش اترجع) -> يبقى الرصيد 10 - 2 = 8
    const balance = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balance.body.quantity).toBe(8);

    // القيد الأصلي اترجّع منه قيد عكسي POSTED، والأصلي بقى REVERSED
    const journal = await request(app.getHttpServer())
      .get(`/accounting/journal-entries?sourceType=order_sale`)
      .set("Authorization", `Bearer ${adminToken}`);
    const originalEntry = journal.body.find((e: { sourceId: string }) => e.sourceId === canceled.posOrderId);
    expect(originalEntry.status).toBe("REVERSED");

    const reversalJournal = await request(app.getHttpServer())
      .get(`/accounting/journal-entries?sourceType=reversal`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(reversalJournal.body.some((e: { reversalOfEntryId: string }) => e.reversalOfEntryId === originalEntry.id)).toBe(true);
  });

  test("إلغاء لأوردر Talabat مش متتبّع خالص -> ORPHAN_CANCELLATION مرئي", async () => {
    const cancelBody = JSON.stringify({ talabatOrderId: "TAL-ORDER-NEVER-EXISTED", status: "CANCELED" });
    await request(app.getHttpServer())
      .post("/talabat/webhook/orders")
      .set("x-talabat-signature", sign(cancelBody))
      .set("Content-Type", "application/json")
      .send(cancelBody);

    const errors = await request(app.getHttpServer()).get("/talabat/integration-errors").set("Authorization", `Bearer ${adminToken}`);
    expect(errors.body.some((e: { message: string }) => e.message === "ORPHAN_CANCELLATION")).toBe(true);
  });

  test("GET /talabat/dashboard-summary بيرجّع حالة اتصال صادقة (NOT_CONFIGURED) وملخص اليوم", async () => {
    const res = await request(app.getHttpServer())
      .get(`/talabat/dashboard-summary?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.connectionStatus).toBe("NOT_CONFIGURED");
    expect(res.body.ordersToday.total).toBeGreaterThan(0);
  });

  test("GET /talabat/payment-control-report متاح بدون أخطاء (لسه مفيش طلبات تعديل دفع)", async () => {
    const res = await request(app.getHttpServer()).get("/talabat/payment-control-report").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
