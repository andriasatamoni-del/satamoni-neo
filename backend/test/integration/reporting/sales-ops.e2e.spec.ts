import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Reporting - تقارير المبيعات والتشغيل (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let ingredientItemId: string;
  let variantId: string;
  let cancelledOrderId: string;
  const today = new Date().toISOString().slice(0, 10);

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
    const { KyselyMenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository"
    );
    const { KyselyRecipeRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مبيعات-تشغيل-جست", email: "admin-salesops@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-salesops@jest.test", password: "12345678" })).body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع مبيعات-تشغيل-جست" });
    branchId = branchRes.body.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "مكوّن-مبيعات-تشغيل-جست", unit: "كيلو", unitCost: 5 });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 100 });

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "صنف-مبيعات-تشغيل-جست" });
    const variant = item.addVariant({ label: "عادي", price: 50 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const recipeRepo = new KyselyRecipeRepository(db);
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 }); // تكلفة وحدة = 2×5 = 10
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    const methodRes = await request(app.getHttpServer())
      .post("/payment-control/payment-methods")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "كاش-مبيعات-تشغيل-جست", kind: "cash" });

    // أوردر فعّال بكاش - كمية 2 (إيراد 100)
    await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 2 }], paymentMethodId: methodRes.body.id });

    // أوردر هيتلغي
    const toCancel = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "dinein", items: [{ variantId, quantity: 1 }] });
    cancelledOrderId = toCancel.body.id;
    await request(app.getHttpServer())
      .patch(`/orders/${cancelledOrderId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM print_jobs`.execute(db);
    await sql`DELETE FROM payments WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders`.execute(db);
    await sql`DELETE FROM payment_methods WHERE name = 'كاش-مبيعات-تشغيل-جست'`.execute(db);
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE id = ${variantId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE name = 'صنف-مبيعات-تشغيل-جست'`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-salesops@jest.test'`.execute(db);
    await app.close();
  });

  test("GET /reports/daily - إيراد وعدد طلبات اليوم للفرع (الأوردر الملغي مش محسوب)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/daily?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ branchId, ordersCount: 1, revenue: 100 });
  });

  test("GET /reports/sales-detail - ملخّص + حسب طريقة الدفع + حسب نوع الطلب", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/sales-detail?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ revenue: 100, ordersCount: 1, avgOrderValue: 100 });
    const cashMethod = res.body.byPaymentMethod.find((m: { name: string }) => m.name === "كاش-مبيعات-تشغيل-جست");
    expect(cashMethod).toMatchObject({ amount: 100, count: 1 });
    const takeaway = res.body.byOrderType.find((t: { orderType: string }) => t.orderType === "takeaway");
    expect(takeaway).toMatchObject({ amount: 100, count: 1 });
  });

  test("GET /reports/cancelled-orders - بيرجّع الأوردر الملغي بس", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/cancelled-orders?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalCount).toBe(1);
    expect(res.body.orders[0].id).toBe(cancelledOrderId);
  });

  test("GET /reports/delays - عتبة صغيرة جدًا بتخلّي كل الأوردرات (اللي لسه بتتحضّر) تتحسب متأخرة", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/delays?branchId=${branchId}&from=${today}&to=${today}&thresholdMinutes=0`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalOrders).toBe(2);
    expect(res.body.summary.delayedCount).toBeGreaterThanOrEqual(1);
  });

  test("GET /reports/item-performance - تكلفة الصنف محسوبة من الوصفة النشطة (2×5=10 للوحدة)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/item-performance?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.topByRevenue.find((r: { name: string }) => r.name.includes("صنف-مبيعات-تشغيل-جست"));
    expect(row).toMatchObject({ quantity: 2, revenue: 100, cost: 20, profit: 80, costIncomplete: false });
  });

  test("GET /reports/catalog - بيرجّع الصنف مع مبيعاته", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/catalog?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.items.find((i: { variantId: string }) => i.variantId === variantId);
    expect(row).toMatchObject({ quantitySold: 2, revenue: 100, price: 50 });
  });

  test("GET /reports/recipes - بيرجّع الوصفة النشطة بمكوّناتها وتكلفتها كاملة (مش ناقصة)", async () => {
    const res = await request(app.getHttpServer()).get("/reports/recipes").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { variantId: string }) => r.variantId === variantId);
    expect(row.hasActiveVersion).toBe(true);
    expect(row.hasMissingCost).toBe(false);
    expect(row.ingredients[0]).toMatchObject({ ingredient: "مكوّن-مبيعات-تشغيل-جست", quantityPerUnit: 2, unitCost: 5 });
  });

  test("من غير توكن -> 401 على كل الـendpoints الجديدة", async () => {
    for (const path of ["/reports/daily", "/reports/sales-detail", "/reports/cancelled-orders", "/reports/delays", "/reports/item-performance", "/reports/catalog", "/reports/recipes"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    }
  });
});
