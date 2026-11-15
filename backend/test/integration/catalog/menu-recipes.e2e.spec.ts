import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";

const TAG = "وصفات-منيو-جست";
const ADMIN_EMAIL = "admin-menu-recipes@jest.test";

interface PublicItem {
  id: string;
  isActive: boolean;
  awaitingRecipe: boolean;
  hasRecipe?: boolean;
  variants: { id: string; label: string; recipeId: string | null; hasRecipe?: boolean }[];
}

describe("Menu item recipes - a recipe library that menu sizes point to", () => {
  let app: INestApplication;
  let token: string;
  let ingredientId: string;
  let stockItemId: string;
  const createdItemIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const db = app.get<Database>(DATABASE);
    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { InventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository");
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");

    await new UserRepository(db).save(
      User.register({ name: "أدمن-وصفات", email: ADMIN_EMAIL, passwordHash: await new BcryptPasswordHasher().hash("12345678"), roles: ["admin"] })
    );
    token = (await api().post("/auth/login").send({ email: ADMIN_EMAIL, password: "12345678" })).body.token;

    const inventoryRepo = new InventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: `دقيق-${TAG}`, unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientId = ingredient.id;
    const stockItem = InventoryItem.register({ name: `عجينة-${TAG}`, unit: "كيلو", itemType: "manufactured" });
    await inventoryRepo.save(stockItem);
    stockItemId = stockItem.id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    if (createdItemIds.length > 0) await db.delete(menuItems).where(inArray(menuItems.id, createdItemIds));
    const recipeIds = (await db.select({ id: recipes.id }).from(recipes).where(like(recipes.name, `%${TAG}%`))).map((r) => r.id);
    if (recipeIds.length > 0) {
      const versionIds = (await db.select({ id: recipeVersions.id }).from(recipeVersions).where(inArray(recipeVersions.recipe_id, recipeIds))).map((v) => v.id);
      if (versionIds.length > 0) await db.delete(recipeIngredients).where(inArray(recipeIngredients.recipe_version_id, versionIds));
      await db.delete(recipeVersions).where(inArray(recipeVersions.recipe_id, recipeIds));
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    }
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, [ingredientId, stockItemId]));
    await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
    await app.close();
  });

  async function createRecipe(name: string, quantity: number | null = 0.2): Promise<string> {
    const res = await api()
      .post("/catalog/recipes")
      .set(auth())
      .send({ recipeType: "sellable_variant", name: `${name}-${TAG}`, ingredients: quantity === null ? [] : [{ ingredientItemId: ingredientId, quantity }] });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  async function createItem(name: string, sizes: { label: string; recipeId?: string }[]): Promise<PublicItem> {
    const res = await api()
      .post("/catalog/items")
      .set(auth())
      .send({ name: `${name}-${TAG}`, variants: sizes.map((s) => ({ label: s.label, price: 50, talabatPrice: 55, recipeId: s.recipeId })) });
    expect(res.status).toBe(201);
    createdItemIds.push(res.body.id);
    return res.body;
  }

  const assign = (variantId: string, recipeId: string | null) => api().put(`/catalog/variants/${variantId}/recipe`).set(auth()).send({ recipeId });

  async function listedItem(itemId: string): Promise<PublicItem> {
    const res = await api().get("/catalog/items").query({ kind: "all", q: TAG }).set(auth());
    expect(res.status).toBe(200);
    return (res.body as PublicItem[]).find((i) => i.id === itemId)!;
  }

  test("an item created without recipes is inactive, tagged, and can not be activated", async () => {
    const item = await createItem("بيتزا", [{ label: "صغير" }, { label: "كبير" }]);
    expect(item).toMatchObject({ isActive: false, awaitingRecipe: true });

    const listed = await listedItem(item.id);
    expect(listed.hasRecipe).toBe(false);
    expect(listed.variants.every((v) => v.hasRecipe === false && v.recipeId === null)).toBe(true);

    expect((await api().patch(`/catalog/items/${item.id}`).set(auth()).send({ isActive: true })).status).toBe(400);
  });

  test("an item created with a recipe for every size starts active", async () => {
    const recipeId = await createRecipe("فول");
    const item = await createItem("فول", [{ label: "عادي", recipeId }]);
    expect(item).toMatchObject({ isActive: true, awaitingRecipe: false });
    expect(item.variants[0].recipeId).toBe(recipeId);
  });

  test("assigning the last missing recipe activates the item", async () => {
    const small = await createRecipe("فطيرة صغير");
    const large = await createRecipe("فطيرة كبير");
    const item = await createItem("فطيرة", [{ label: "صغير", recipeId: small }, { label: "كبير" }]);
    expect(item.isActive).toBe(false);

    const res = await assign(item.variants.find((v) => v.label === "كبير")!.id, large);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isActive: true, awaitingRecipe: false });
  });

  test("one recipe shared by two items: editing it gives both the new version", async () => {
    const recipeId = await createRecipe("مشترك", 0.1);
    const first = await createItem("ساندوتش أ", [{ label: "عادي", recipeId }]);
    const second = await createItem("ساندوتش ب", [{ label: "عادي", recipeId }]);

    const edited = await api().put(`/catalog/recipes/${recipeId}/ingredients`).set(auth()).send({ ingredients: [{ ingredientItemId: ingredientId, quantity: 0.4 }] });
    expect(edited.status).toBe(200);
    const active = edited.body.versions.filter((v: { status: string }) => v.status === "ACTIVE");
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ versionNumber: 2, ingredients: [{ ingredientItemId: ingredientId, quantity: 0.4 }] });

    const library = await api().get("/catalog/menu-recipes/recipes").query({ paginate: 1, q: `مشترك-${TAG}` }).set(auth());
    expect(library.status).toBe(200);
    expect(library.body.total).toBe(1);
    const shared = library.body.items[0];
    expect(shared.usedBy.map((u: { itemId: string }) => u.itemId).sort()).toEqual([first.id, second.id].sort());
    expect(shared.activeVersion.ingredients[0]).toMatchObject({ name: `دقيق-${TAG}`, unit: "كيلو", quantity: 0.4 });
  });

  test("a recipe saved without ingredients is not enough; adding them later activates the items using it", async () => {
    const recipeId = await createRecipe("فاضية", null);
    const item = await createItem("شوربة", [{ label: "عادي", recipeId }]);
    expect(item.isActive).toBe(false);

    await api().put(`/catalog/recipes/${recipeId}/ingredients`).set(auth()).send({ ingredients: [{ ingredientItemId: ingredientId, quantity: 0.3 }] });
    expect((await listedItem(item.id)).isActive).toBe(true);
  });

  test("adding a size without a recipe switches the item off; clearing and reassigning a recipe does the same round trip", async () => {
    const recipeId = await createRecipe("كشري");
    const item = await createItem("كشري", [{ label: "صغير", recipeId }]);
    expect(item.isActive).toBe(true);

    const withRecipe = await api().post(`/catalog/items/${item.id}/variants`).set(auth()).send({ label: "وسط", price: 60, talabatPrice: 65, recipeId });
    expect(withRecipe.body.isActive).toBe(true);

    const added = await api().post(`/catalog/items/${item.id}/variants`).set(auth()).send({ label: "كبير", price: 80, talabatPrice: 85 });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ isActive: false, awaitingRecipe: true });
    const large = added.body.variants.find((v: { label: string }) => v.label === "كبير");
    expect((await assign(large.id, recipeId)).body.isActive).toBe(true);

    const cleared = await assign(large.id, null);
    expect(cleared.body).toMatchObject({ isActive: false, awaitingRecipe: true });
    expect((await assign(large.id, recipeId)).body.isActive).toBe(true);
  });

  test("a manually deactivated item stays off when its recipe changes", async () => {
    const recipeId = await createRecipe("مكرونة");
    const item = await createItem("مكرونة", [{ label: "عادي", recipeId }]);
    expect((await api().patch(`/catalog/items/${item.id}`).set(auth()).send({ isActive: false })).status).toBe(200);

    await api().put(`/catalog/recipes/${recipeId}/ingredients`).set(auth()).send({ ingredients: [{ ingredientItemId: ingredientId, quantity: 0.5 }] });
    expect((await listedItem(item.id)).isActive).toBe(false);
    expect((await api().patch(`/catalog/items/${item.id}`).set(auth()).send({ isActive: true })).body.isActive).toBe(true);
  });

  test("renames a recipe, refuses a manufactured recipe on a menu size, and 404s an unknown size", async () => {
    const recipeId = await createRecipe("قديم");
    const renamed = await api().patch(`/catalog/recipes/${recipeId}`).set(auth()).send({ name: `جديد-${TAG}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe(`جديد-${TAG}`);

    const manufactured = await api()
      .post("/catalog/recipes")
      .set(auth())
      .send({ recipeType: "manufactured_item", name: `تصنيع-${TAG}`, inventoryItemId: stockItemId });
    expect(manufactured.status).toBe(201);
    const item = await createItem("طرب", [{ label: "عادي" }]);
    expect((await assign(item.variants[0].id, manufactured.body.id)).status).toBe(400);
    expect((await assign("00000000-0000-4000-8000-000000000000", recipeId)).status).toBe(404);
  });

  test("GET /catalog/menu-recipes/items pages the items, missing ones first, and filters", async () => {
    const all = await api().get("/catalog/menu-recipes/items").query({ q: TAG }).set(auth());
    expect(all.status).toBe(200);
    const flags: boolean[] = all.body.map((i: { hasRecipe: boolean }) => i.hasRecipe);
    expect(flags.includes(true) && flags.includes(false)).toBe(true);
    expect(flags.lastIndexOf(false)).toBeLessThan(flags.indexOf(true));

    const pizza = all.body.find((i: { name: string }) => i.name === `بيتزا-${TAG}`);
    expect(pizza).toMatchObject({ hasRecipe: false, awaitingRecipe: true, isActive: false });
    expect(pizza.variants[0]).toMatchObject({ recipeId: null, recipeName: null, ready: false });
    const beans = all.body.find((i: { name: string }) => i.name === `فول-${TAG}`);
    expect(beans).toMatchObject({ hasRecipe: true });
    expect(beans.variants[0]).toMatchObject({ recipeName: `فول-${TAG}`, ready: true });

    const firstPage = await api().get("/catalog/menu-recipes/items").query({ q: TAG, paginate: 1, limit: 2, offset: 0 }).set(auth());
    expect(firstPage.body).toMatchObject({ total: all.body.length, limit: 2, offset: 0 });
    expect(firstPage.body.items).toHaveLength(2);
    const secondPage = await api().get("/catalog/menu-recipes/items").query({ q: TAG, paginate: 1, limit: 2, offset: 2 }).set(auth());
    expect(secondPage.body.items.map((i: { id: string }) => i.id)).toEqual(all.body.slice(2, 4).map((i: { id: string }) => i.id));

    const missing = await api().get("/catalog/menu-recipes/items").query({ q: TAG, missing: 1, paginate: 1 }).set(auth());
    expect(missing.body.total).toBe(flags.filter((f) => !f).length);
    expect(missing.body.items.every((i: { hasRecipe: boolean }) => !i.hasRecipe)).toBe(true);

    const one = await api().get("/catalog/menu-recipes/items").query({ itemId: pizza.id }).set(auth());
    expect(one.body.map((i: { id: string }) => i.id)).toEqual([pizza.id]);
  });

  test("GET /catalog/menu-recipes/recipes pages the library and options lists every menu recipe", async () => {
    const page = await api().get("/catalog/menu-recipes/recipes").query({ q: TAG, paginate: 1, limit: 3 }).set(auth());
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(3);
    expect(page.body.total).toBeGreaterThan(3);

    const options = await api().get("/catalog/menu-recipes/options").set(auth());
    const ours = options.body.filter((r: { name: string }) => r.name.includes(TAG));
    expect(ours.length).toBe(page.body.total);
    expect(ours.every((r: { name: string }) => !r.name.startsWith("تصنيع-"))).toBe(true);
    expect(ours.find((r: { name: string }) => r.name === `فول-${TAG}`)).toMatchObject({ ready: true });
  });
});
