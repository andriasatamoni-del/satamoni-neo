import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyRecipeRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository";
import { KyselyMenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { KyselyInventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { Recipe } from "../../../src/contexts/catalog/domain/recipe.aggregate";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";

describe("KyselyRecipeRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyRecipeRepository;
  let variantId: string;
  let ingredientItemId: string;
  let menuItemId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyRecipeRepository(db);

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "بيتزا-وصفات-جست" });
    const variant = item.addVariant({ label: "وسط", price: 90 });
    await menuItemRepo.save(item);
    variantId = variant.id;
    menuItemId = item.id;

    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const ingredient = InventoryItem.register({ name: "طحين-وصفات-جست", unit: "كيلو" });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE item_id = ${menuItemId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE id = ${menuItemId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(db);
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM recipe_ingredients`.execute(db);
    await sql`DELETE FROM recipe_versions`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
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
