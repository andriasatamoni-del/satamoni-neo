import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";

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
    const { MenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository"
    );
    const { RecipeRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/recipe.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مبيعات-تشغيل-جست", email: "admin-salesops@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-salesops@jest.test", password: "12345678" })).body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع مبيعات-تشغيل-جست" });
    branchId = branchRes.body.id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const ingredient = InventoryItem.register({ name: "مكوّن-مبيعات-تشغيل-جست", unit: "كيلو", unitCost: 5 });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 100 });

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "صنف-مبيعات-تشغيل-جست" });
    const variant = item.addVariant({ label: "عادي", price: 50 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const recipeRepo = new RecipeRepository(app.get<Database>(DATABASE));
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
    const db = app.get<Database>(DATABASE);
    await db.delete(printJobs);
    await db.delete(payments).where(eq(payments.branch_id, branchId));
    await db.delete(orderItems);
    await db.delete(orders);
    await db.delete(paymentMethods).where(eq(paymentMethods.name, "كاش-مبيعات-تشغيل-جست"));
    await db.delete(recipeIngredients);
    await db.delete(recipeVersions);
    await db.delete(recipes);
    await db.delete(menuItemVariants).where(eq(menuItemVariants.id, variantId));
    await db.delete(menuItems).where(eq(menuItems.name, "صنف-مبيعات-تشغيل-جست"));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, ingredientItemId));
    await db.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-salesops@jest.test"));
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
