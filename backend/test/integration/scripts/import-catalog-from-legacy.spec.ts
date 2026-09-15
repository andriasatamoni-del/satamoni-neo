import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importCatalogFromLegacy } from "../../../scripts/import-catalog-from-legacy";
import { KyselyMenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { KyselyRecipeRepository } from "../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository";
import { KyselyInventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importCatalogFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let itemRepo: KyselyMenuItemRepository;
  let recipeRepo: KyselyRecipeRepository;
  let ingredientItemId: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS recipe_ingredients, recipe_versions, recipes, menu_item_variants, menu_items, menu_categories");
    await legacyPool.query(`CREATE TABLE menu_categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0, menu_group TEXT NOT NULL DEFAULT 'regular', is_active BOOLEAN NOT NULL DEFAULT TRUE)`);
    await legacyPool.query(`CREATE TABLE menu_items (id SERIAL PRIMARY KEY, category_id INTEGER, name TEXT NOT NULL, description TEXT, image_url TEXT, is_best BOOLEAN NOT NULL DEFAULT FALSE, is_active BOOLEAN NOT NULL DEFAULT TRUE)`);
    await legacyPool.query(`CREATE TABLE menu_item_variants (id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, label TEXT NOT NULL, price NUMERIC NOT NULL, talabat_price NUMERIC)`);
    await legacyPool.query(`CREATE TABLE recipes (id SERIAL PRIMARY KEY, recipe_type TEXT NOT NULL, variant_id INTEGER, inventory_item_id INTEGER)`);
    await legacyPool.query(`CREATE TABLE recipe_versions (id SERIAL PRIMARY KEY, recipe_id INTEGER NOT NULL, version_number INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT')`);
    await legacyPool.query(`CREATE TABLE recipe_ingredients (id SERIAL PRIMARY KEY, recipe_version_id INTEGER NOT NULL, ingredient_item_id INTEGER NOT NULL, quantity NUMERIC NOT NULL, unit TEXT)`);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    itemRepo = new KyselyMenuItemRepository(neoDb);
    recipeRepo = new KyselyRecipeRepository(neoDb);

    const inventoryRepo = new KyselyInventoryItemRepository(neoDb);
    const ingredient = InventoryItem.register({ name: "دقيق-كتالوج-fixture", unit: "كيلو", legacyInventoryItemId: 850 });
    await inventoryRepo.save(ingredient);
    ingredientItemId = ingredient.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientItemId}`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM recipe_ingredients; DELETE FROM recipe_versions; DELETE FROM recipes; DELETE FROM menu_item_variants; DELETE FROM menu_items; DELETE FROM menu_categories");
    await sql`DELETE FROM recipe_ingredients`.execute(neoDb);
    await sql`DELETE FROM recipe_versions`.execute(neoDb);
    await sql`DELETE FROM recipes`.execute(neoDb);
    await sql`DELETE FROM menu_item_variants`.execute(neoDb);
    await sql`DELETE FROM menu_items`.execute(neoDb);
    await sql`DELETE FROM menu_categories`.execute(neoDb);
  });

  test("بيستورد قسم وصنف بحجم ووصفة نشطة كاملة", async () => {
    const category = await legacyPool.query(`INSERT INTO menu_categories (name) VALUES ('بيتزا-fixture') RETURNING id`);
    const item = await legacyPool.query(
      `INSERT INTO menu_items (category_id, name) VALUES ($1, 'مارجريتا-fixture') RETURNING id`,
      [category.rows[0].id]
    );
    const variant = await legacyPool.query(
      `INSERT INTO menu_item_variants (item_id, label, price, talabat_price) VALUES ($1, 'وسط', 90, 95) RETURNING id`,
      [item.rows[0].id]
    );
    const recipe = await legacyPool.query(
      `INSERT INTO recipes (recipe_type, variant_id) VALUES ('sellable_variant', $1) RETURNING id`,
      [variant.rows[0].id]
    );
    const version = await legacyPool.query(
      `INSERT INTO recipe_versions (recipe_id, version_number, status) VALUES ($1, 1, 'ACTIVE') RETURNING id`,
      [recipe.rows[0].id]
    );
    await legacyPool.query(
      `INSERT INTO recipe_ingredients (recipe_version_id, ingredient_item_id, quantity, unit) VALUES ($1, 850, 0.2, 'كيلو')`,
      [version.rows[0].id]
    );

    const result = await importCatalogFromLegacy(legacyPool, neoDb);
    expect(result.categories).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.items).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.recipes).toEqual({ created: 1, updated: 0, skipped: 0 });

    const importedItem = await itemRepo.findByLegacyMenuItemId(item.rows[0].id);
    expect(importedItem?.name).toBe("مارجريتا-fixture");
    expect(importedItem?.variants).toHaveLength(1);
    expect(importedItem?.variants[0].talabatPrice).toBe(95);

    const importedRecipe = await recipeRepo.findByVariantId(importedItem!.variants[0].id);
    expect(importedRecipe?.activeVersion?.status).toBe("ACTIVE");
    expect(importedRecipe?.activeVersion?.ingredients).toHaveLength(1);
    expect(importedRecipe?.activeVersion?.ingredients[0].ingredientItemId).toBe(ingredientItemId);
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    const item = await legacyPool.query(`INSERT INTO menu_items (name) VALUES ('برجر-fixture') RETURNING id`);
    const first = await importCatalogFromLegacy(legacyPool, neoDb);
    expect(first.items).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query(`UPDATE menu_items SET name = 'برجر-fixture-معدّل' WHERE id = $1`, [item.rows[0].id]);
    const second = await importCatalogFromLegacy(legacyPool, neoDb);
    expect(second.items).toEqual({ created: 0, updated: 1, skipped: 0 });

    const imported = await itemRepo.findByLegacyMenuItemId(item.rows[0].id);
    expect(imported?.name).toBe("برجر-fixture-معدّل");
  });

  test("حالة نسخة وصفة قديمة (PENDING_APPROVAL) بتتحول DRAFT في النظام الجديد", async () => {
    const item = await legacyPool.query(`INSERT INTO menu_items (name) VALUES ('فطير-fixture') RETURNING id`);
    const variant = await legacyPool.query(
      `INSERT INTO menu_item_variants (item_id, label, price) VALUES ($1, 'كبير', 60) RETURNING id`,
      [item.rows[0].id]
    );
    const recipe = await legacyPool.query(
      `INSERT INTO recipes (recipe_type, variant_id) VALUES ('sellable_variant', $1) RETURNING id`,
      [variant.rows[0].id]
    );
    await legacyPool.query(
      `INSERT INTO recipe_versions (recipe_id, version_number, status) VALUES ($1, 1, 'PENDING_APPROVAL')`,
      [recipe.rows[0].id]
    );

    await importCatalogFromLegacy(legacyPool, neoDb);
    const importedItem = await itemRepo.findByLegacyMenuItemId(item.rows[0].id);
    const importedRecipe = await recipeRepo.findByVariantId(importedItem!.variants[0].id);
    expect(importedRecipe?.versions[0].status).toBe("DRAFT");
  });
});
