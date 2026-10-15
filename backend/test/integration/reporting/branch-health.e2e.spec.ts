import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { cashDrawerEntries, cashierShifts } from "../../../src/contexts/shifts/infrastructure/persistence/shifts.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";

describe("Reporting - GET /reports/branch-health (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchManagerToken: string;
  let branchId: string;
  let centralKitchenId: string;
  let variantId: string;
  let ingredientItemId: string;
  let shiftId: string;
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
      name: "أدمن-صحة-فروع-جست", email: "admin-branchhealth@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-branchhealth@jest.test", password: "12345678" })).body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع صحة-فروع-جست" });
    branchId = branchRes.body.id;

    const ckRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سنتر كيتشن صحة-فروع-جست", isCentralKitchen: true });
    centralKitchenId = ckRes.body.id;

    const branchManager = User.register({
      name: "مدير فرع-صحة-فروع-جست", email: "manager-branchhealth@jest.test", passwordHash: await hasher.hash("12345678"),
      roles: ["branch_manager"], branchId,
    });
    await userRepo.save(branchManager);
    branchManagerToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "manager-branchhealth@jest.test", password: "12345678" })).body.token;

    // مكوّن بتكلفة وحدة معروفة + وصفة نشطة + أوردر - تكلفة نظرية 20 على إيراد 100 = 20% تكلفة طعام
    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const ingredient = InventoryItem.register({ name: "مكوّن-صحة-فروع-جست", unit: "كيلو", unitCost: 10 });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 100 });

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "صنف-صحة-فروع-جست" });
    const variant = item.addVariant({ label: "عادي", price: 100 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const recipeRepo = new RecipeRepository(app.get<Database>(DATABASE));
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 }); // 2 كيلو × 10 = 20 تكلفة نظرية
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] }); // إيراد 100

    // صنف رصيد سالب
    const negItem = InventoryItem.register({ name: "صنف-سالب-صحة-فروع-جست", unit: "قطعة", negativeStockPolicy: "ALLOW_WITH_APPROVAL" });
    await inventoryRepo.save(negItem);
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: negItem.id, branchId, movementType: "CONSUMPTION", quantityDelta: -3, approved: true });

    // شيفت كاشير اتقفل بفرق كاش كبير -> PENDING_REVIEW
    const openRes = await request(app.getHttpServer())
      .post("/shifts/open")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, openingCash: 100 });
    shiftId = openRes.body.id;
    await request(app.getHttpServer())
      .post(`/shifts/${shiftId}/close`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ actualCash: 10 });
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(cashDrawerEntries).where(eq(cashDrawerEntries.shift_id, shiftId));
    await db.delete(cashierShifts).where(eq(cashierShifts.id, shiftId));
    await db.delete(printJobs);
    await db.delete(orderItems);
    await db.delete(orders);
    await db.delete(recipeIngredients);
    await db.delete(recipeVersions);
    await db.delete(recipes);
    await db.delete(menuItemVariants).where(eq(menuItemVariants.id, variantId));
    await db.delete(menuItems).where(eq(menuItems.name, "صنف-صحة-فروع-جست"));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(inArray(inventoryItems.name, ["مكوّن-صحة-فروع-جست", "صنف-سالب-صحة-فروع-جست"]));
    await db.delete(treasuries).where(inArray(treasuries.branch_id, [branchId, centralKitchenId]));
    await db.delete(branches).where(inArray(branches.id, [branchId, centralKitchenId]));
    await db.delete(users).where(inArray(users.email, ["admin-branchhealth@jest.test", "manager-branchhealth@jest.test"]));
    await app.close();
  });

  test("بيرجّع صف لكل فرع (ماعدا سنتر الكيتشن) بأرقام صحيحة - إيراد/تكلفة طعام%/فرق كاش/مخزون سالب", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/branch-health?from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const branchIds = res.body.branches.map((b: { branchId: string }) => b.branchId);
    expect(branchIds).toContain(branchId);
    expect(branchIds).not.toContain(centralKitchenId); // سنتر الكيتشن مستبعد

    const row = res.body.branches.find((b: { branchId: string }) => b.branchId === branchId);
    expect(row.revenue).toBe(100);
    expect(row.ordersCount).toBe(1);
    expect(row.avgOrderValue).toBe(100);
    expect(row.foodCostPercent).toBeCloseTo(20);
    expect(row.negativeStockItems).toBe(1);
    expect(row.cashVariance).toBe(-90);
    expect(row.shiftsPendingReview).toBe(1);
  });

  test("مدير فرع (معندوش reports.branch_health) -> 403", async () => {
    const res = await request(app.getHttpServer())
      .get("/reports/branch-health")
      .set("Authorization", `Bearer ${branchManagerToken}`);
    expect(res.status).toBe(403);
  });
});
