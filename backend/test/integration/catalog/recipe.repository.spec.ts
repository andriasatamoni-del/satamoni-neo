import type { Database } from "../../../src/shared/database/database.token";
import { RecipeRepository } from "../../../src/contexts/catalog/infrastructure/persistence/recipe.repository";
import { MenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository";
import { InventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository";
import { Recipe } from "../../../src/contexts/catalog/domain/recipe.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { eq } from "drizzle-orm";
import { menuItemVariants, menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { inventoryItems } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";

describe("RecipeRepository", () => {
  let db: Database;
  let repo: RecipeRepository;
  let variantId: string;
  let ingredientItemId: string;
  let menuItemId: string;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new RecipeRepository(db);

    const menuItemRepo = new MenuItemRepository(db);
    const item = MenuItem.register({ name: "بيتزا-وصفات-جست" });
    const variant = item.addVariant({ label: "وسط", price: 90 });
    await menuItemRepo.save(item);
    variantId = variant.id;
    menuItemId = item.id;

    const inventoryRepo = new InventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "طحين-وصفات-جست", unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
  });

  afterAll(async () => {
    await db.delete(recipeIngredients);
    await db.delete(recipeVersions);
    await db.delete(recipes);
    await db.delete(menuItemVariants).where(eq(menuItemVariants.item_id, menuItemId));
    await db.delete(menuItems).where(eq(menuItems.id, menuItemId));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, ingredientItemId));
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(recipeIngredients);
    await db.delete(recipeVersions);
    await db.delete(recipes);
  });

  test("save بيسجّل وصفة بنسخة ومكوّناتها مع بعض، وfindById بيرجّعهم بنفس البيانات", async () => {
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId, quantity: 0.3, unit: "كيلو" });
    await repo.save(recipe);

    const found = await repo.findById(recipe.id);
    expect(found?.versions).toHaveLength(1);
    expect(found?.versions[0].ingredients).toHaveLength(1);
    expect(found?.versions[0].ingredients[0].quantity).toBe(0.3);
  });

  test("findByVariantId بيلاقي وصفة الحجم صح", async () => {
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    await repo.save(recipe);
    expect((await repo.findByVariantId(variantId))?.id).toBe(recipe.id);
  });

  test("تفعيل نسخة وحفظها بيحدّث حالتها في القاعدة صح، والقديمة بتتأرشف", async () => {
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId });
    const v1 = recipe.createDraftVersion({});
    recipe.addIngredient(v1.id, { ingredientItemId, quantity: 1 });
    recipe.activateVersion(v1.id);
    await repo.save(recipe);

    const v2 = recipe.createDraftVersion({});
    recipe.addIngredient(v2.id, { ingredientItemId, quantity: 2 });
    recipe.activateVersion(v2.id);
    await repo.save(recipe);

    const found = await repo.findById(recipe.id);
    expect(found?.activeVersion?.id).toBe(v2.id);
    expect(found?.versions.find((v) => v.id === v1.id)?.status).toBe("ARCHIVED");
  });
});
