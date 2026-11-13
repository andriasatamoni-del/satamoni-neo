import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import {
  comboItems,
  combos,
  menuCategories,
  menuItemVariants,
  menuItems,
  recipeIngredients,
  recipeVersions,
  recipes,
} from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";

const EMAIL = "admin-addons@jest.test";

describe("Addons - الإضافات كأصناف في menu_items وسطور فرعية في order_items", () => {
  let app: INestApplication;
  let db: Database;
  let adminToken: string;
  let branchId: string;
  let cheeseInventoryId: string;
  let pizzaId: string;
  let smallVariantId: string;
  let largeVariantId: string;
  let cheeseAddonId: string;
  let cheeseVariantId: string;
  let olivesAddonId: string;
  let olivesVariantId: string;
  const menuItemIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const placeOrder = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post("/orders").set(auth()).send({ branchId, orderType: "takeaway", ...body });
  const cheeseBalance = async () =>
    (
      await request(app.getHttpServer())
        .get(`/inventory/balances?branchId=${branchId}&inventoryItemId=${cheeseInventoryId}`)
        .set(auth())
    ).body.quantity as number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { InventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository");
    const { StockMovementRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/stock-movement.repository");
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { StockMovement } = await import("../../../src/contexts/inventory/domain/stock-movement.aggregate");
    const { RecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/recipe.repository");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");

    const hasher = new BcryptPasswordHasher();
    await new UserRepository(db).save(
      User.register({ name: "أدمن-إضافات-جست", email: EMAIL, passwordHash: await hasher.hash("12345678"), roles: ["admin"] })
    );
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: EMAIL, password: "12345678" })).body.token;

    const branch = Branch.register({ name: "فرع إضافات-جست" });
    await new BranchRepository(db).save(branch);
    branchId = branch.id;

    const cheese = InventoryItem.register({ name: "جبنة-إضافات-جست", unit: "كيلو", negativeStockPolicy: "STRICT" });
    await new InventoryItemRepository(db).save(cheese);
    cheeseInventoryId = cheese.id;
    await new StockMovementRepository(db).recordMovement(
      StockMovement.register({ inventoryItemId: cheeseInventoryId, branchId, movementType: "RECEIPT", quantityDelta: 10 }),
      { allowNegativeBalance: true }
    );

    const pizza = await request(app.getHttpServer())
      .post("/catalog/items")
      .set(auth())
      .send({
        name: "بيتزا-إضافات-جست",
        variants: [
          { label: "صغير", price: 60, talabatPrice: 84 },
          { label: "كبير", price: 120, talabatPrice: 168 },
        ],
      });
    pizzaId = pizza.body.id;
    smallVariantId = pizza.body.variants.find((v: { label: string }) => v.label === "صغير").id;
    largeVariantId = pizza.body.variants.find((v: { label: string }) => v.label === "كبير").id;
    menuItemIds.push(pizzaId);

    const cheeseAddon = await request(app.getHttpServer())
      .post("/catalog/items")
      .set(auth())
      .send({ kind: "addon", name: "جبنة إضافية-جست", variants: [{ label: "عادي", price: 15, talabatPrice: 20 }] });
    expect(cheeseAddon.status).toBe(201);
    cheeseAddonId = cheeseAddon.body.id;
    cheeseVariantId = cheeseAddon.body.variants[0].id;
    menuItemIds.push(cheeseAddonId);

    const olivesAddon = await request(app.getHttpServer())
      .post("/catalog/items")
      .set(auth())
      .send({ kind: "addon", name: "زيتون إضافي-جست", variants: [{ label: "عادي", price: 5, talabatPrice: 7 }] });
    olivesAddonId = olivesAddon.body.id;
    olivesVariantId = olivesAddon.body.variants[0].id;
    menuItemIds.push(olivesAddonId);

    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: cheeseVariantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId: cheeseInventoryId, quantity: 0.5 });
    recipe.activateVersion(version.id);
    await new RecipeRepository(db).save(recipe);
  });

  afterAll(async () => {
    const branchOrders = db.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId));
    await db.delete(printJobs).where(inArray(printJobs.order_id, branchOrders));
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    const variantIds = db.select({ id: menuItemVariants.id }).from(menuItemVariants).where(inArray(menuItemVariants.item_id, menuItemIds));
    const recipeIds = db.select({ id: recipes.id }).from(recipes).where(inArray(recipes.variant_id, variantIds));
    const versionIds = db.select({ id: recipeVersions.id }).from(recipeVersions).where(inArray(recipeVersions.recipe_id, recipeIds));
    await db.delete(recipeIngredients).where(inArray(recipeIngredients.recipe_version_id, versionIds));
    await db.delete(recipeVersions).where(inArray(recipeVersions.recipe_id, recipeIds));
    await db.delete(recipes).where(inArray(recipes.variant_id, variantIds));
    await db.delete(comboItems).where(inArray(comboItems.variant_id, variantIds));
    await db.delete(combos).where(inArray(combos.name, ["عرض-إضافات-جست", "عرض-إضافة-تحت-صنف-جست"]));
    await db.delete(menuItemVariants).where(inArray(menuItemVariants.item_id, menuItemIds));
    await db.delete(menuItems).where(inArray(menuItems.id, menuItemIds));
    await db.delete(menuCategories).where(eq(menuCategories.name, "قسم-إضافات-جست"));
    await db.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await db.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, cheeseInventoryId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, EMAIL));
    await app.close();
  });

  test("GET /catalog/items بيرجّع الأصناف بس افتراضيًا، والإضافات بـ kind=addon، والكل بـ kind=all", async () => {
    const items = await request(app.getHttpServer()).get("/catalog/items").set(auth());
    const ids = items.body.map((i: { id: string }) => i.id);
    expect(ids).toContain(pizzaId);
    expect(ids).not.toContain(cheeseAddonId);

    const addons = await request(app.getHttpServer()).get("/catalog/items?kind=addon").set(auth());
    const addonIds = addons.body.map((i: { id: string }) => i.id);
    expect(addonIds).toEqual(expect.arrayContaining([cheeseAddonId, olivesAddonId]));
    expect(addonIds).not.toContain(pizzaId);
    expect(addons.body.find((i: { id: string }) => i.id === cheeseAddonId).kind).toBe("addon");

    const all = await request(app.getHttpServer()).get("/catalog/items?kind=all").set(auth());
    expect(all.body.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([pizzaId, cheeseAddonId]));
  });

  test("الإضافة مالهاش أكتر من حجم ولا قسم", async () => {
    const extraVariant = await request(app.getHttpServer())
      .post(`/catalog/items/${cheeseAddonId}/variants`)
      .set(auth())
      .send({ label: "كبير", price: 25, talabatPrice: 30 });
    expect(extraVariant.status).toBe(400);

    const category = await request(app.getHttpServer()).post("/catalog/categories").set(auth()).send({ name: "قسم-إضافات-جست" });
    const withCategory = await request(app.getHttpServer())
      .patch(`/catalog/items/${cheeseAddonId}`)
      .set(auth())
      .send({ categoryId: category.body.id });
    expect(withCategory.status).toBe(400);
  });

  test("POST /orders بإضافات - كل إضافة سطر فرعي بسعرها، والإجمالي مجموع السطور، والوصفة بتسحب من المخزون", async () => {
    const before = await cheeseBalance();
    const res = await placeOrder({
      items: [
        { variantId: smallVariantId, quantity: 2, addons: [{ variantId: cheeseVariantId, quantity: 1 }, { variantId: olivesVariantId, quantity: 2 }] },
        { variantId: largeVariantId, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);

    const small = res.body.items.find((i: { variantId: string }) => i.variantId === smallVariantId);
    expect(small.unitPrice).toBe(60);
    expect(small.lineTotal).toBe(120);
    expect(small.addons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ menuItemId: cheeseAddonId, variantId: cheeseVariantId, quantity: 2, unitPrice: 15, lineTotal: 30 }),
        expect.objectContaining({ menuItemId: olivesAddonId, variantId: olivesVariantId, quantity: 4, unitPrice: 5, lineTotal: 20 }),
      ])
    );
    const large = res.body.items.find((i: { variantId: string }) => i.variantId === largeVariantId);
    expect(large.addons).toEqual([]);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.subtotal).toBe(120 + 30 + 20 + 120);
    expect(res.body.total).toBe(290);

    const rows = await db.select().from(orderItems).where(eq(orderItems.order_id, res.body.id));
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.parent_order_item_id === small.id)).toHaveLength(2);

    expect(await cheeseBalance()).toBe(before - 1);

    const cancel = await request(app.getHttpServer()).patch(`/orders/${res.body.id}/cancel`).set(auth());
    expect(cancel.status).toBe(200);
    expect(await cheeseBalance()).toBe(before);
  });

  test("طلب طلبات بياخد سعر طلبات للصنف وللإضافة", async () => {
    const res = await placeOrder({
      source: "talabat",
      items: [{ variantId: smallVariantId, quantity: 1, addons: [{ variantId: cheeseVariantId, quantity: 1 }] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.items[0].unitPrice).toBe(84);
    expect(res.body.items[0].addons[0].unitPrice).toBe(20);
    expect(res.body.total).toBe(104);
  });

  test("الإضافة مينفعش تتباع لوحدها", async () => {
    const res = await placeOrder({ items: [{ variantId: cheeseVariantId, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test("صنف عادي مينفعش يتحط كإضافة، وإضافة موقوفة مترفضة", async () => {
    const itemAsAddon = await placeOrder({ items: [{ variantId: smallVariantId, quantity: 1, addons: [{ variantId: largeVariantId, quantity: 1 }] }] });
    expect(itemAsAddon.status).toBe(400);

    await request(app.getHttpServer()).patch(`/catalog/items/${olivesAddonId}`).set(auth()).send({ isActive: false });
    const inactive = await placeOrder({ items: [{ variantId: smallVariantId, quantity: 1, addons: [{ variantId: olivesVariantId, quantity: 1 }] }] });
    expect(inactive.status).toBe(400);
    await request(app.getHttpServer()).patch(`/catalog/items/${olivesAddonId}`).set(auth()).send({ isActive: true });
  });

  test("العرض مالوش إضافات، والإضافة مينفعش تدخل في عرض", async () => {
    const addonCombo = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set(auth())
      .send({ name: "عرض-إضافات-جست", price: 100, items: [{ variantId: cheeseVariantId, quantity: 1 }] });
    expect(addonCombo.status).toBe(400);

    const combo = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set(auth())
      .send({ name: "عرض-إضافات-جست", price: 100, items: [{ variantId: smallVariantId, quantity: 1 }] });
    expect(combo.status).toBe(201);
    const res = await placeOrder({ items: [{ comboId: combo.body.id, quantity: 1, addons: [{ variantId: cheeseVariantId, quantity: 1 }] }] });
    expect(res.status).toBe(400);
  });

  test("إضافة تحت صنف في العرض بتظهر تحته، وبتسحب من المخزون بكمية الصنف والعرض، وصنف عادي مينفعش يتحط كإضافة", async () => {
    const itemAsAddon = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set(auth())
      .send({ name: "عرض-إضافة-تحت-صنف-جست", price: 150, items: [{ variantId: smallVariantId, quantity: 2, addons: [{ variantId: largeVariantId, quantity: 1 }] }] });
    expect(itemAsAddon.status).toBe(400);

    const combo = await request(app.getHttpServer())
      .post("/catalog/combos")
      .set(auth())
      .send({
        name: "عرض-إضافة-تحت-صنف-جست",
        price: 150,
        items: [
          { variantId: smallVariantId, quantity: 2, addons: [{ variantId: cheeseVariantId, quantity: 1 }] },
          { variantId: largeVariantId, quantity: 1, addons: [{ variantId: cheeseVariantId, quantity: 1 }] },
        ],
      });
    expect(combo.status).toBe(201);
    expect(combo.body.items).toEqual([
      { variantId: smallVariantId, quantity: 2, addons: [{ variantId: cheeseVariantId, quantity: 1 }] },
      { variantId: largeVariantId, quantity: 1, addons: [{ variantId: cheeseVariantId, quantity: 1 }] },
    ]);

    const before = await cheeseBalance();
    const res = await placeOrder({ items: [{ comboId: combo.body.id, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(300);
    expect(await cheeseBalance()).toBe(before - 0.5 * (2 + 1) * 2);

    const cancel = await request(app.getHttpServer()).patch(`/orders/${res.body.id}/cancel`).set(auth());
    expect(cancel.status).toBe(200);
    expect(await cheeseBalance()).toBe(before);
  });

  test("بدون مكوّن: الصنف مبيسحبش المكوّن ده من المخزون، والسطر شايل اسمه، ومكوّن مش في الوصفة مترفض", async () => {
    const { RecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/recipe.repository");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: smallVariantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId: cheeseInventoryId, quantity: 0.2 });
    recipe.activateVersion(version.id);
    await new RecipeRepository(db).save(recipe);

    const removable = await request(app.getHttpServer()).get("/catalog/removable-ingredients").set(auth());
    expect(removable.status).toBe(200);
    expect(removable.body).toEqual(
      expect.arrayContaining([{ variantId: smallVariantId, ingredients: [{ inventoryItemId: cheeseInventoryId, name: "جبنة-إضافات-جست" }] }])
    );

    const before = await cheeseBalance();
    const withCheese = await placeOrder({ items: [{ variantId: smallVariantId, quantity: 2 }] });
    expect(withCheese.status).toBe(201);
    expect(await cheeseBalance()).toBeCloseTo(before - 0.4);

    const withoutCheese = await placeOrder({ items: [{ variantId: smallVariantId, quantity: 2, withoutIngredientIds: [cheeseInventoryId] }] });
    expect(withoutCheese.status).toBe(201);
    expect(withoutCheese.body.items[0].withoutIngredients).toEqual([{ inventoryItemId: cheeseInventoryId, name: "جبنة-إضافات-جست" }]);
    expect(await cheeseBalance()).toBeCloseTo(before - 0.4);

    const notInRecipe = await placeOrder({ items: [{ variantId: largeVariantId, quantity: 1, withoutIngredientIds: [cheeseInventoryId] }] });
    expect(notInRecipe.status).toBe(400);
  });
});
