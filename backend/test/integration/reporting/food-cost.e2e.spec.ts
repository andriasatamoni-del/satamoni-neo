import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Reporting - GET /reports/food-cost (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let ingredientItemId: string;
  let variantId: string;
  let orderIdToCancel: string;
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
    const { KyselyBranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
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
      name: "أدمن-تكلفة-طعام-جست", email: "admin-foodcost@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-foodcost@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع تكلفة-طعام-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    // مكوّن بسعر وحدة معروف (10 جنيه/كيلو) - أساس التكلفة النظرية
    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({
      name: "دقيق-تكلفة-طعام-جست", unit: "كيلو", negativeStockPolicy: "STRICT", unitCost: 10,
    });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;

    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 100 });

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "عيش-تكلفة-طعام-جست" });
    const variant = item.addVariant({ label: "رغيف", price: 20 });
    await menuItemRepo.save(item);
    variantId = variant.id;

    const recipeRepo = new KyselyRecipeRepository(db);
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 }); // 2 كيلو دقيق لكل رغيف - تكلفة نظرية 20 جنيه
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    // أوردر أول (هيفضل فعّال) - يستهلك 2 كيلو (تكلفة نظرية 20 جنيه)
    await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] });

    // أوردر تاني هيتلغي - يستهلك 2 كيلو تانية وبعدين يترجعوا بـADJUSTMENT (يقلل الفعلي عن النظري)
    const toCancel = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] });
    orderIdToCancel = toCancel.body.id;
    await request(app.getHttpServer())
      .patch(`/orders/${orderIdToCancel}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM print_jobs`.execute(db);
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
    await sql`DELETE FROM users WHERE email = 'admin-foodcost@jest.test'`.execute(db);
    await app.close();
  });

  test("النظري = استهلاك أول أوردر بس (20)، الفعلي = نفس القيمة لأن إلغاء الأوردر الثاني عكس استهلاكه بالكامل", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/food-cost?branchId=${branchId}&from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.theoreticalCost).toBe(40); // 2 أوردر × 20 قبل الإلغاء
    expect(res.body.totals.actualUsageCost).toBe(20); // بعد ما إلغاء التاني اترجع كامل
    expect(res.body.totals.variance).toBe(-20);
    const item = res.body.byItem.find((i: { inventoryItemId: string }) => i.inventoryItemId === ingredientItemId);
    expect(item).toMatchObject({ theoreticalCost: 40, actualUsageCost: 20, variance: -20 });
  });

  test("GET /reports/food-cost/by-branch - الفرع ده ظاهر بنفس أرقام النظري", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/food-cost/by-branch?from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const branch = res.body.branches.find((b: { branchId: string }) => b.branchId === branchId);
    expect(branch).toMatchObject({ theoreticalCost: 40, actualUsageCost: 20 });
  });

  test("من غير توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).get("/reports/food-cost");
    expect(res.status).toBe(401);
  });
});
