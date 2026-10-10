import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

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
    const { KyselyComboRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-combo.repository");
    const { Combo } = await import("../../../src/contexts/catalog/domain/combo.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-طلبات-عروض-جست", email: "admin-orders-combos@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-orders-combos@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع-طلبات-عروض-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "جبنة-طلبات-عروض-جست", unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;

    const movementRepo = new KyselyStockMovementRepository(db);
    await movementRepo.recordMovement(
      StockMovement.register({ inventoryItemId: ingredientItemId, branchId, movementType: "RECEIPT", quantityDelta: 10 }),
      { allowNegativeBalance: true }
    );

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const pizza = MenuItem.register({ name: "بيتزا-طلبات-عروض-جست" });
    const pizzaVariant = pizza.addVariant({ label: "وسط", price: 100 });
    await menuItemRepo.save(pizza);
    pizzaVariantId = pizzaVariant.id;

    const drink = MenuItem.register({ name: "مشروب-طلبات-عروض-جست" });
    const drinkVariant = drink.addVariant({ label: "عادي", price: 15 });
    await menuItemRepo.save(drink);
    drinkVariantId = drinkVariant.id;

    const recipeRepo = new KyselyRecipeRepository(db);
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: pizzaVariantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 2 }); // 2 كيلو جبنة لكل بيتزا وسط
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    const comboRepo = new KyselyComboRepository(db);
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
    const db = app.get(KYSELY);
    await sql`DELETE FROM print_jobs`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders`.execute(db);
    await sql`DELETE FROM combo_items`.execute(db);
    await sql`DELETE FROM combos WHERE name LIKE '%طلبات-عروض-جست%'`.execute(db);
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE id IN (${pizzaVariantId}, ${drinkVariantId})`.execute(db);
    await sql`DELETE FROM menu_items WHERE name LIKE '%طلبات-عروض-جست%'`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-orders-combos@jest.test'`.execute(db);
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

  test("محتويات العرض بتتسجّل مع الطلب (لقطة) وبتظهر في الطلب وشاشة المطبخ وتذاكر التحضير، وبتفضل زي ما هي لو العرض اتعدّل بعدين", async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const created = await request(app.getHttpServer()).post("/catalog/combos").set(auth).send({
      name: "عرض لقطة-طلبات-عروض-جست", price: 90, items: [{ variantId: pizzaVariantId, quantity: 1 }, { variantId: drinkVariantId, quantity: 2 }],
    });
    expect(created.status).toBe(201);
    const snapshotComboId = created.body.id as string;

    const res = await request(app.getHttpServer()).post("/orders").set(auth).send({ branchId, orderType: "takeaway", items: [{ comboId: snapshotComboId, quantity: 2 }] }); // 2 combos x 1 pizza x 2 kg = 4 kg = the remaining stock
    expect(res.status).toBe(201);
    const orderId = res.body.id as string;
    const expected = [
      { variantId: pizzaVariantId, itemName: "بيتزا-طلبات-عروض-جست", variantLabel: "وسط", quantity: 1 },
      { variantId: drinkVariantId, itemName: "مشروب-طلبات-عروض-جست", variantLabel: "عادي", quantity: 2 },
    ];
    const componentsOf = (order: { items: { components: unknown[] }[] }) =>
      order.items[0].components.map((c) => { const { menuItemId: _ignored, ...rest } = c as Record<string, unknown>; return rest; });
    expect(componentsOf(res.body)).toEqual(expected); // quantity = per ONE combo (the line quantity is 2)

    // persisted: the order list and the kitchen board return the same contents
    const list = await request(app.getHttpServer()).get(`/orders?branchId=${branchId}`).set(auth);
    expect(componentsOf(list.body.find((o: { id: string }) => o.id === orderId))).toEqual(expected);
    const board = await request(app.getHttpServer()).get(`/orders/kitchen-board?branchId=${branchId}`).set(auth);
    expect(componentsOf(board.body.find((o: { id: string }) => o.id === orderId))).toEqual(expected);

    // a regular line carries no components
    const plain = await request(app.getHttpServer()).post("/orders").set(auth).send({ branchId, orderType: "takeaway", items: [{ variantId: drinkVariantId, quantity: 1 }] });
    expect(plain.body.items[0].components).toEqual([]);

    // the combo is edited afterwards: the old order keeps what was sold
    const edit = await request(app.getHttpServer()).put(`/catalog/combos/${snapshotComboId}/items`).set(auth).send({ items: [{ variantId: drinkVariantId, quantity: 5 }] });
    expect(edit.status).toBe(200);
    const after = await request(app.getHttpServer()).get(`/orders?branchId=${branchId}`).set(auth);
    expect(componentsOf(after.body.find((o: { id: string }) => o.id === orderId))).toEqual(expected);

    // kitchen / prep tickets: one line per component with the quantity multiplied by the line quantity, from the snapshot
    const { OrderPrintDataBuilder } = await import("../../../src/contexts/printing/application/services/order-print-data.builder");
    const data = await app.get(OrderPrintDataBuilder, { strict: false }).build(orderId);
    expect(data!.items.map((i) => ({ name: i.name, quantity: i.quantity, label: i.variantLabel }))).toEqual([
      { name: "عرض لقطة-طلبات-عروض-جست: بيتزا-طلبات-عروض-جست", quantity: 2, label: "وسط" },
      { name: "عرض لقطة-طلبات-عروض-جست: مشروب-طلبات-عروض-جست", quantity: 4, label: "عادي" },
    ]);
    expect(data!.items.reduce((sum, i) => sum + (i.lineTotal ?? 0), 0)).toBe(180); // the combo price (90 x 2) is counted once

    // an old order (sold before migration 059: no snapshot) falls back to the combo as it is now
    const db = app.get(KYSELY);
    await sql`UPDATE order_items SET combo_components = '[]'::jsonb WHERE order_id = ${orderId}`.execute(db);
    const legacy = await app.get(OrderPrintDataBuilder, { strict: false }).build(orderId);
    expect(legacy!.items).toHaveLength(1);
    expect(legacy!.items[0]).toMatchObject({ name: "عرض لقطة-طلبات-عروض-جست: مشروب-طلبات-عروض-جست", quantity: 10 });
  });

  test("PATCH /catalog/combos/:id items مش موجودة -> بيرفض تسجيل العرض بعد كده لغاية ما يتصحح", async () => {
    const res = await request(app.getHttpServer())
      .put(`/catalog/combos/${comboId}/items`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }] });
    expect(res.status).toBe(400);
  });
});
