import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray, like } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { comboItems, combos, menuItemVariants, menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

// e2e لتسجيل طلب فيه سطر عرض (combo) - بيتأكد إن استهلاك المخزون بيتفكّ لأصناف العرض الأصلية عن طريق
// وصفة كل حجم (نفس فلسفة combo_components بالريبو القديم بالظبط - راجع تعليق register-order.handler.ts)
describe("Orders + Combos - طلب فيه عرض (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let ingredientItemId: string;
  let pizzaVariantId: string;
  let drinkVariantId: string;
  let comboId: string;
  let inactiveComboId: string;

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
    const { StockMovementRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/stock-movement.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
    const { MenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository");
    const { RecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/recipe.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
    const { ComboRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/combo.repository");
    const { Combo } = await import("../../../src/contexts/catalog/domain/combo.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-طلبات-عروض-جست", email: "admin-orders-combos@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-orders-combos@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع-طلبات-عروض-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
    const ingredient = InventoryItem.register({ name: "جبنة-طلبات-عروض-جست", unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;

    const movementRepo = new StockMovementRepository(app.get<Database>(DATABASE));
    await movementRepo.recordMovement(
      StockMovement.register({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 10 }),
      { allowNegativeBalance: true }
    );

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const pizza = MenuItem.register({ name: "بيتزا-طلبات-عروض-جست" });
    const pizzaVariant = pizza.addVariant({ label: "وسط", price: 100 });
    await menuItemRepo.save(pizza);
    pizzaVariantId = pizzaVariant.id;

    const drink = MenuItem.register({ name: "مشروب-طلبات-عروض-جست" });
    const drinkVariant = drink.addVariant({ label: "عادي", price: 15 });
    await menuItemRepo.save(drink);
    drinkVariantId = drinkVariant.id;

    const recipeRepo = new RecipeRepository(app.get<Database>(DATABASE));
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: pizzaVariantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 }); // 2 كيلو جبنة لكل بيتزا وسط
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    const comboRepo = new ComboRepository(app.get<Database>(DATABASE));
    const combo = Combo.register({
      name: "عرض بيتزا+مشروب-طلبات-عروض-جست",
      price: 100, // أرخص من مجموع الأصناف (115) - نفس فكرة العروض
      items: [
        { variantId: pizzaVariantId, quantity: 1 },
        { variantId: drinkVariantId, quantity: 1 },
      ],
    });
    await comboRepo.save(combo);
    comboId = combo.id;

    const inactiveCombo = Combo.register({ name: "عرض متوقف-طلبات-عروض-جست", price: 50, items: [{ variantId: drinkVariantId, quantity: 1 }] });
    inactiveCombo.updateDetails({ isActive: false });
    await comboRepo.save(inactiveCombo);
    inactiveComboId = inactiveCombo.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(printJobs);
    await db.delete(orderItems);
    await db.delete(orders);
    await db.delete(comboItems);
    await db.delete(combos).where(like(combos.name, "%طلبات-عروض-جست%"));
    await db.delete(recipeIngredients);
    await db.delete(recipeVersions);
    await db.delete(recipes);
    await db.delete(menuItemVariants).where(inArray(menuItemVariants.id, [pizzaVariantId, drinkVariantId]));
    await db.delete(menuItems).where(like(menuItems.name, "%طلبات-عروض-جست%"));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, ingredientItemId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-orders-combos@jest.test"));
    await app.close();
  });

  test("POST /orders بسطر عرض - السعر بيبقى سعر العرض نفسه (مش مجموع الأصناف)، وبيستهلك مخزون الصنف اللي جوّه بيه وصفة بس", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ comboId, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(200); // 2 * 100 (سعر العرض) مش 2 * 115 (مجموع الأصناف)
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].comboId).toBe(comboId);
    expect(res.body.items[0].menuItemId).toBeNull();
    expect(res.body.items[0].variantId).toBeNull();

    // 2 عرض × 1 بيتزا لكل عرض × 2 كيلو جبنة لكل بيتزا = 4 كيلو استهلاك -> الرصيد يبقى 6 (المشروب مالوش وصفة)
    const balance = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balance.body.quantity).toBe(6);
  });

  test("POST /orders بسطر عرض متوقف -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ comboId: inactiveComboId, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test("POST /orders بطلب مختلط (صنف عادي + عرض) - كل سطر بسعره الصح والإجمالي بيجمعهم", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        branchId,
        orderType: "dinein",
        items: [
          { variantId: drinkVariantId, quantity: 1 },
          { comboId, quantity: 1 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(115); // 15 (مشروب) + 100 (عرض)
    expect(res.body.items).toHaveLength(2);
  });

  test("PATCH /catalog/combos/:id items مش موجودة -> بيرفض تسجيل العرض بعد كده لغاية ما يتصحح", async () => {
    const res = await request(app.getHttpServer())
      .put(`/catalog/combos/${comboId}/items`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }] });
    expect(res.status).toBe(400);
  });
});
