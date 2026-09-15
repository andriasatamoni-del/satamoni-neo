// استيراد قائمة الطعام والوصفات من الريبو القديم - أقسام + أصناف + أحجام + وصفات منسّخة.
// مش بيتم استيراد: المرفقات (modifiers)، الكومبوهات، سجل تاريخ الأسعار - لسه معندهمش aggregates في
// النظام الجديد (راجع تعليق menu-item.aggregate.ts). recipe_versions.status عندها 6 حالات في الريبو
// القديم (DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/ARCHIVED/REJECTED) - النظام الجديد عنده 3 بس
// (DRAFT/ACTIVE/ARCHIVED، راجع تعليق recipe.aggregate.ts)، فبيتعمل تحويل: ACTIVE->ACTIVE،
// ARCHIVED->ARCHIVED، وأي حالة تانية (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED) بتتحول DRAFT (كلهم
// أصلًا "لسه مش نافذة فعليًا" في النظام الجديد المبسّط ده).
import "dotenv/config";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyMenuCategoryRepository } from "../src/contexts/catalog/infrastructure/persistence/kysely-menu-category.repository";
import { KyselyMenuItemRepository } from "../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { KyselyRecipeRepository } from "../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository";
import { KyselyInventoryItemRepository } from "../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { MenuCategory, MENU_GROUPS } from "../src/contexts/catalog/domain/menu-category.aggregate";
import { MenuItem } from "../src/contexts/catalog/domain/menu-item.aggregate";
import { Recipe, type RecipeVersionStatus } from "../src/contexts/catalog/domain/recipe.aggregate";

interface LegacyCategoryRow {
  id: number; name: string; display_order: number; menu_group: string; is_active: boolean;
}
interface LegacyItemRow {
  id: number; category_id: number | null; name: string; description: string | null; image_url: string | null;
  is_best: boolean; is_active: boolean;
}
interface LegacyVariantRow {
  id: number; item_id: number; label: string; price: string; talabat_price: string | null;
}
interface LegacyRecipeRow {
  id: number; recipe_type: string; variant_id: number | null; inventory_item_id: number | null;
}
interface LegacyRecipeVersionRow {
  id: number; recipe_id: number; version_number: number; status: string;
}
interface LegacyRecipeIngredientRow {
  id: number; recipe_version_id: number; ingredient_item_id: number; quantity: string; unit: string | null;
}

export interface ImportCounts { created: number; updated: number; skipped: number; }
export interface CatalogImportResult {
  categories: ImportCounts;
  items: ImportCounts;
  recipes: ImportCounts;
}

function mapLegacyStatus(status: string): RecipeVersionStatus {
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "ARCHIVED") return "ARCHIVED";
  return "DRAFT";
}

export async function importCatalogFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<CatalogImportResult> {
  const categoryRepo = new KyselyMenuCategoryRepository(neoDb);
  const itemRepo = new KyselyMenuItemRepository(neoDb);
  const recipeRepo = new KyselyRecipeRepository(neoDb);
  const inventoryRepo = new KyselyInventoryItemRepository(neoDb);

  const categories: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const categoryIdMap = new Map<number, string>();
  const { rows: categoryRows } = await legacyPool.query<LegacyCategoryRow>(
    `SELECT id, name, display_order, menu_group, is_active FROM menu_categories ORDER BY id`
  );
  for (const row of categoryRows) {
    if (!MENU_GROUPS.includes(row.menu_group as (typeof MENU_GROUPS)[number])) {
      console.warn(`⚠ تخطّي قسم #${row.id} (${row.name}) - مجموعة منيو غير معروفة: ${row.menu_group}`);
      categories.skipped++;
      continue;
    }
    const existing = await categoryRepo.findByLegacyCategoryId(row.id);
    if (existing) {
      if (row.is_active) existing.activate(); else existing.deactivate();
      await categoryRepo.save(existing);
      categoryIdMap.set(row.id, existing.id);
      categories.updated++;
    } else {
      const category = MenuCategory.register({
        name: row.name, displayOrder: row.display_order, menuGroup: row.menu_group, legacyCategoryId: row.id,
      });
      if (!row.is_active) category.deactivate();
      await categoryRepo.save(category);
      categoryIdMap.set(row.id, category.id);
      categories.created++;
    }
  }

  const items: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const variantIdMap = new Map<number, string>(); // legacy variant id -> UUID الجديد
  const { rows: itemRows } = await legacyPool.query<LegacyItemRow>(
    `SELECT id, category_id, name, description, image_url, is_best, is_active FROM menu_items ORDER BY id`
  );
  const { rows: variantRows } = await legacyPool.query<LegacyVariantRow>(
    `SELECT id, item_id, label, price, talabat_price FROM menu_item_variants ORDER BY id`
  );
  const variantsByItem = new Map<number, LegacyVariantRow[]>();
  for (const v of variantRows) {
    const list = variantsByItem.get(v.item_id) ?? [];
    list.push(v);
    variantsByItem.set(v.item_id, list);
  }

  for (const row of itemRows) {
    const categoryId = row.category_id != null ? (categoryIdMap.get(row.category_id) ?? null) : null;
    const existing = await itemRepo.findByLegacyMenuItemId(row.id);
    const item =
      existing ??
      MenuItem.register({
        categoryId, name: row.name, description: row.description, imageUrl: row.image_url,
        isBest: row.is_best, legacyMenuItemId: row.id,
      });
    if (existing) {
      item.rename(row.name);
      item.updateDetails({ categoryId, description: row.description, imageUrl: row.image_url, isBest: row.is_best });
    }
    if (!row.is_active) item.deactivate(); else item.activate();

    for (const variantRow of variantsByItem.get(row.id) ?? []) {
      const existingVariant = item.variants.find((v) => v.legacyVariantId === variantRow.id);
      if (existingVariant) {
        item.updateVariantPrice(existingVariant.id, Number(variantRow.price), variantRow.talabat_price != null ? Number(variantRow.talabat_price) : null);
        variantIdMap.set(variantRow.id, existingVariant.id);
      } else {
        const variant = item.addVariant({
          label: variantRow.label, price: Number(variantRow.price),
          talabatPrice: variantRow.talabat_price != null ? Number(variantRow.talabat_price) : null,
          legacyVariantId: variantRow.id,
        });
        variantIdMap.set(variantRow.id, variant.id);
      }
    }

    await itemRepo.save(item);
    existing ? items.updated++ : items.created++;
  }

  const recipes: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: recipeRows } = await legacyPool.query<LegacyRecipeRow>(
    `SELECT id, recipe_type, variant_id, inventory_item_id FROM recipes ORDER BY id`
  );
  const { rows: versionRows } = await legacyPool.query<LegacyRecipeVersionRow>(
    `SELECT id, recipe_id, version_number, status FROM recipe_versions ORDER BY recipe_id, version_number`
  );
  const { rows: ingredientRows } = await legacyPool.query<LegacyRecipeIngredientRow>(
    `SELECT id, recipe_version_id, ingredient_item_id, quantity, unit FROM recipe_ingredients ORDER BY id`
  );
  const versionsByRecipe = new Map<number, LegacyRecipeVersionRow[]>();
  for (const v of versionRows) {
    const list = versionsByRecipe.get(v.recipe_id) ?? [];
    list.push(v);
    versionsByRecipe.set(v.recipe_id, list);
  }
  const ingredientsByVersion = new Map<number, LegacyRecipeIngredientRow[]>();
  for (const i of ingredientRows) {
    const list = ingredientsByVersion.get(i.recipe_version_id) ?? [];
    list.push(i);
    ingredientsByVersion.set(i.recipe_version_id, list);
  }

  for (const row of recipeRows) {
    const variantId = row.variant_id != null ? (variantIdMap.get(row.variant_id) ?? null) : null;
    const inventoryItemId =
      row.inventory_item_id != null
        ? ((await inventoryRepo.findByLegacyInventoryItemId(row.inventory_item_id))?.id ?? null)
        : null;
    if (row.variant_id != null && !variantId) {
      console.warn(`⚠ تخطّي وصفة #${row.id} - الحجم المرتبط بيها مش مستورد`);
      recipes.skipped++;
      continue;
    }
    if (row.inventory_item_id != null && !inventoryItemId) {
      console.warn(`⚠ تخطّي وصفة #${row.id} - الصنف المصنّع المرتبط بيها مش مستورد`);
      recipes.skipped++;
      continue;
    }

    const existing = await recipeRepo.findByLegacyRecipeId(row.id);
    const recipe =
      existing ?? Recipe.register({ recipeType: row.recipe_type, variantId, inventoryItemId, legacyRecipeId: row.id });

    for (const versionRow of versionsByRecipe.get(row.id) ?? []) {
      const existingVersion = recipe.versions.find((v) => v.versionNumber === versionRow.version_number);
      if (!existingVersion) {
        const newVersion = recipe.createDraftVersion({});
        for (const ingredientRow of ingredientsByVersion.get(versionRow.id) ?? []) {
          const mappedIngredientItemId = (await inventoryRepo.findByLegacyInventoryItemId(ingredientRow.ingredient_item_id))?.id;
          if (!mappedIngredientItemId) continue; // مكوّن مش مستورد - بيتسيب برا الوصفة، مش بيوقف الاستيراد
          recipe.addIngredient(newVersion.id, {
            ingredientItemId: mappedIngredientItemId, quantity: Number(ingredientRow.quantity), unit: ingredientRow.unit,
          });
        }
        const mappedStatus = mapLegacyStatus(versionRow.status);
        if (mappedStatus === "ACTIVE" && newVersion.ingredients.length > 0) recipe.activateVersion(newVersion.id);
      }
    }

    await recipeRepo.save(recipe);
    existing ? recipes.updated++ : recipes.created++;
  }

  return { categories, items, recipes };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl }) }) });

  const result = await importCatalogFromLegacy(legacyPool, neoDb);
  console.log(
    `✅ الاستيراد خلص:\n` +
      `  أقسام: ${result.categories.created} جديد، ${result.categories.updated} اتحدّث، ${result.categories.skipped} اتخطّى\n` +
      `  أصناف: ${result.items.created} جديد، ${result.items.updated} اتحدّث، ${result.items.skipped} اتخطّى\n` +
      `  وصفات: ${result.recipes.created} جديد، ${result.recipes.updated} اتحدّث، ${result.recipes.skipped} اتخطّى`
  );

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
