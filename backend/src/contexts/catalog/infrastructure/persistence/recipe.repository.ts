import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { inListChunks } from "../../../../shared/database/pagination";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { Recipe, type RecipeType, type RecipeVersionStatus } from "../../domain/recipe.aggregate";
import type { RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { menuItemVariants, recipeIngredients, recipes, recipeVersions } from "./catalog.tables";

@Injectable()
export class RecipeRepository implements RecipeRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(recipe: Recipe): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(recipes)
        .values({
          id: recipe.id,
          recipe_type: recipe.recipeType,
          name: recipe.name,
          inventory_item_id: recipe.inventoryItemId,
          legacy_recipe_id: recipe.legacyRecipeId,
        })
        .onConflictDoUpdate({ target: recipes.id, set: { name: recipe.name } });

      for (const version of recipe.versions) {
        await tx
          .insert(recipeVersions)
          .values({
            id: version.id,
            recipe_id: recipe.id,
            version_number: version.versionNumber,
            status: version.status,
            created_by: version.createdBy,
            created_at: version.createdAt,
            activated_at: version.activatedAt,
            archived_at: version.archivedAt,
          })
          .onConflictDoUpdate({
            target: recipeVersions.id,
            set: { status: version.status, activated_at: version.activatedAt, archived_at: version.archivedAt },
          });

        for (const ingredient of version.ingredients) {
          await tx
            .insert(recipeIngredients)
            .values({
              id: ingredient.id,
              recipe_version_id: version.id,
              ingredient_item_id: ingredient.ingredientItemId,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
            })
            .onConflictDoUpdate({ target: recipeIngredients.id, set: { quantity: ingredient.quantity, unit: ingredient.unit } });
        }
      }
    });
  }

  async findById(id: string): Promise<Recipe | null> {
    const [row] = await this.db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByVariantId(variantId: string): Promise<Recipe | null> {
    const [row] = await this.db
      .select({ recipe: recipes })
      .from(menuItemVariants)
      .innerJoin(recipes, eq(recipes.id, menuItemVariants.recipe_id))
      .where(eq(menuItemVariants.id, variantId))
      .limit(1);
    return row ? this.toDomain(row.recipe) : null;
  }

  async findByInventoryItemId(inventoryItemId: string): Promise<Recipe | null> {
    const [row] = await this.db.select().from(recipes).where(eq(recipes.inventory_item_id, inventoryItemId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyRecipeId(legacyId: number): Promise<Recipe | null> {
    const [row] = await this.db.select().from(recipes).where(eq(recipes.legacy_recipe_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { recipeType?: string }): Promise<Recipe[]> {
    const rows = await this.db
      .select()
      .from(recipes)
      .where(filter?.recipeType ? eq(recipes.recipe_type, filter.recipeType) : undefined);
    const result: Recipe[] = [];
    for (const row of rows) result.push(await this.toDomain(row));
    return result;
  }

  async stockItemName(inventoryItemId: string): Promise<string | null> {
    const [row] = await this.db.select({ name: inventoryItems.name }).from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId)).limit(1);
    return row?.name ?? null;
  }

  async readyMenuRecipeIds(recipeIds: readonly string[]): Promise<Set<string>> {
    const ready = new Set<string>();
    for (const ids of inListChunks([...new Set(recipeIds)])) {
      const rows = await this.db
        .selectDistinct({ recipeId: recipes.id })
        .from(recipes)
        .innerJoin(recipeVersions, and(eq(recipeVersions.recipe_id, recipes.id), eq(recipeVersions.status, "ACTIVE")))
        .innerJoin(recipeIngredients, eq(recipeIngredients.recipe_version_id, recipeVersions.id))
        .where(and(inArray(recipes.id, ids), eq(recipes.recipe_type, "sellable_variant")));
      for (const row of rows) ready.add(row.recipeId);
    }
    return ready;
  }

  private async toDomain(row: typeof recipes.$inferSelect): Promise<Recipe> {
    const versionRows = await this.db
      .select()
      .from(recipeVersions)
      .where(eq(recipeVersions.recipe_id, row.id))
      .orderBy(asc(recipeVersions.version_number));

    const versions = [];
    for (const v of versionRows) {
      const ingredientRows = await this.db.select().from(recipeIngredients).where(eq(recipeIngredients.recipe_version_id, v.id));
      versions.push({
        id: v.id,
        versionNumber: v.version_number,
        status: v.status as RecipeVersionStatus,
        ingredients: ingredientRows.map((i) => ({
          id: i.id,
          ingredientItemId: i.ingredient_item_id,
          quantity: Number(i.quantity),
          unit: i.unit,
        })),
        createdBy: v.created_by,
        createdAt: v.created_at,
        activatedAt: v.activated_at,
        archivedAt: v.archived_at,
      });
    }

    return Recipe.reconstitute(row.id, {
      recipeType: row.recipe_type as RecipeType,
      name: row.name,
      inventoryItemId: row.inventory_item_id,
      versions,
      legacyRecipeId: row.legacy_recipe_id,
    });
  }
}
