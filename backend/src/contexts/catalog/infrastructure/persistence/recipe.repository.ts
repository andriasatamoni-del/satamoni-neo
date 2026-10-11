import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Recipe, type RecipeType, type RecipeVersionStatus } from "../../domain/recipe.aggregate";
import type { RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { recipeIngredients, recipes, recipeVersions } from "./catalog.tables";

@Injectable()
export class RecipeRepository implements RecipeRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // بيسجّل الوصفة + كل نسخها + مكوّنات كل نسخة في معاملة واحدة - نفس فلسفة MenuItemRepository
  // (versions/ingredients entities تابعة، مش aggregates منفصلة)
  async save(recipe: Recipe): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(recipes)
        .values({
          id: recipe.id,
          recipe_type: recipe.recipeType,
          variant_id: recipe.variantId,
          inventory_item_id: recipe.inventoryItemId,
          legacy_recipe_id: recipe.legacyRecipeId,
        })
        .onConflictDoNothing({ target: recipes.id });

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
    const [row] = await this.db.select().from(recipes).where(eq(recipes.variant_id, variantId)).limit(1);
    return row ? this.toDomain(row) : null;
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
      variantId: row.variant_id,
      inventoryItemId: row.inventory_item_id,
      versions,
      legacyRecipeId: row.legacy_recipe_id,
    });
  }
}
