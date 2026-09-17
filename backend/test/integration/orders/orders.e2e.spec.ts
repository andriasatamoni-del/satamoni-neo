import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Orders - /orders (e2e ضد تطبيق حقيقي كامل، بيغطي استهلاك المخزون الحقيقي عن طريق الوصفة)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let ingredientItemId: string;
  let variantWithRecipeId: string;
  let variantWithoutRecipeId: string;

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
    const { KyselyBranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { KyselyStockMovementRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
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
      name: "أدمن-طلبات", email: "admin-orders@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-orders@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع طلبات-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "جبنة-طلبات-جست", unit: "كيلو", negativeStockPolicy: "STRICT" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;

    // رصيد افتتاحي 10 كيلو للمكوّن ده في الفرع ده - عن طريق حركة RECEIPT مباشرة (نفس أسلوب سكريبتات الاستيراد)
    const movementRepo = new KyselyStockMovementRepository(db);
    await movementRepo.recordMovement(
      StockMovement.register({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 10 }),
      { allowNegativeBalance: true }
    );

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "بيتزا-طلبات-جست" });
    const variantWithRecipe = item.addVariant({ label: "وسط", price: 100 });
    const variantWithoutRecipe = item.addVariant({ label: "كبير", price: 150 });
    await menuItemRepo.save(item);
    variantWithRecipeId = variantWithRecipe.id;
    variantWithoutRecipeId = variantWithoutRecipe.id;

    const recipeRepo = new KyselyRecipeRepository(db);
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: variantWithRecipeId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 }); // 2 كيلو جبنة لكل بيتزا وسط
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders`.execute(db);
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-orders@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /orders بصنف له وصفة نشطة - بيستهلك المخزون تلقائيًا حسب الوصفة", async () => {
    const balanceBefore = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceBefore.body.quantity).toBe(10);

    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId: variantWithRecipeId, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(200); // 2 * 100
    expect(res.body.status).toBe("preparing");
    expect(res.body.kitchenStatus).toBe("NEW");

    // 2 بيتزا × 2 كيلو جبنة لكل واحدة = 4 كيلو استهلاك -> الرصيد يبقى 6
    const balanceAfter = await request(app.getHttpServer())
      .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(balanceAfter.body.quantity).toBe(6);
  });

  test("POST /orders بصنف من غير وصفة - بيتسجّل عادي من غير أي استهلاك", async () => {
    const balanceBefore = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;

    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "dinein", items: [{ variantId: variantWithoutRecipeId, quantity: 1 }] });
    expect(res.status).toBe(201);

    const balanceAfter = (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${ingredientItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
    ).body.quantity;
    expect(balanceAfter).toBe(balanceBefore); // مفيش وصفة، مفيش استهلاك
  });

  test("POST /orders بكمية هتخلي رصيد المكوّن سالب على صنف STRICT -> 409 ومفيش طلب اتسجّل", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId: variantWithRecipeId, quantity: 10 }] }); // محتاج 20 كيلو، الرصيد 6
    expect(res.status).toBe(409);

    const orders = await request(app.getHttpServer())
      .get(`/orders?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(orders.body).toHaveLength(2); // نفس الطلبين السابقين بس، الطلب الفاشل ده مسجّلش
  });

  test("PATCH /orders/:id/status بيحدّث الحالة، ومينفعش يتعدّل تاني بعد ما يتقفل", async () => {
    const created = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "dinein", items: [{ variantId: variantWithoutRecipeId, quantity: 1 }] });

    const updated = await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "completed" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("completed");

    const rejected = await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "cancelled" });
    expect(rejected.status).toBe(400);
  });

  test("PATCH /orders/:id/kitchen-status بيتقدّم خطوة بخطوة بس، وبيرفض التخطي، وبيظهر في لوحة المطبخ لحد ما يبقى READY", async () => {
    const created = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "dinein", items: [{ variantId: variantWithoutRecipeId, quantity: 1 }] });
    const orderId = created.body.id;

    const boardBefore = await request(app.getHttpServer())
      .get(`/orders/kitchen-board?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(boardBefore.body.some((o: { id: string }) => o.id === orderId)).toBe(true);

    const skip = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/kitchen-status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ kitchenStatus: "PREPARING" }); // NEW -> PREPARING مباشرة، مرفوض
    expect(skip.status).toBe(400);

    const accepted = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/kitchen-status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ kitchenStatus: "ACCEPTED" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.kitchenStatus).toBe("ACCEPTED");
    expect(accepted.body.kitchenAcceptedAt).not.toBeNull();
  });

  test("POST /orders بحجم مش موجود -> 400 (validation)", async () => {
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }] });
    expect(res.status).toBe(400);
  });
});
