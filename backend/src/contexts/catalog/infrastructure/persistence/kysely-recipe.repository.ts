import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Recipe, type RecipeType, type RecipeVersionStatus } from "../../domain/recipe.aggregate";
import type { RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import type { RecipesTable } from "./catalog.schema";

@Injectable()
export class KyselyRecipeRepository implements RecipeRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // بيسجّل الوصفة + كل نسخها + مكوّنات كل نسخة في معاملة واحدة - نفس فلسفة KyselyMenuItemRepository
  // (versions/ingredients entities تابعة، مش aggregates منفصلة)
  async save(recipe: Recipe): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("recipes")
        .values({
          id: recipe.id,
          recipe_type: recipe.recipeType,
          variant_id: recipe.variantId,
          inventory_item_id: recipe.inventoryItemId,
          legacy_recipe_id: recipe.legacyRecipeId,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();

      for (const version of recipe.versions) {
        await trx
          .insertInto("recipe_versions")
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
          .onConflict((oc) => oc.column("id").doUpdateSet({ status: version.status, activated_at: version.activatedAt, archived_at: version.archivedAt }))
          .execute();

        for (const ingredient of version.ingredients) {
          await trx
            .insertInto("recipe_ingredients")
            .values({
              id: ingredient.id,
              recipe_version_id: version.id,
              ingredient_item_id: ingredient.ingredientItemId,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
            })
            .onConflict((oc) => oc.column("id").doUpdateSet({ quantity: ingredient.quantity, unit: ingredient.unit }))
            .execute();
        }
      }
    });
  }

  async findById(id: string): Promise<Recipe | null> {
    const row = await this.db.selectFrom("recipes").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByVariantId(variantId: string): Promise<Recipe | null> {
    const row = await this.db.selectFrom("recipes").selectAll().where("variant_id", "=", variantId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByInventoryItemId(inventoryItemId: string): Promise<Recipe | null> {
    const row = await this.db
      .selectFrom("recipes")
      .selectAll()
      .where("inventory_item_id", "=", inventoryItemId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyRecipeId(legacyId: number): Promise<Recipe | null> {
    const row = await this.db.selectFrom("recipes").selectAll().where("legacy_recipe_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  private async toDomain(row: Selectable<RecipesTable>): Promise<Recipe> {
    const versionRows = await this.db
      .selectFrom("recipe_versions")
      .selectAll()
      .where("recipe_id", "=", row.id)
      .orderBy("version_number")
      .execute();

    const versions = [];
    for (const v of versionRows) {
      const ingredientRows = await this.db
        .selectFrom("recipe_ingredients")
        .selectAll()
        .where("recipe_version_id", "=", v.id)
        .execute();
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
