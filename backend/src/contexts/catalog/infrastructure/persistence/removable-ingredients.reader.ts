import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import type { RemovableIngredientsReaderPort, VariantRemovableIngredients } from "../../domain/ports/removable-ingredients-reader.port";
import { recipeIngredients, recipes, recipeVersions } from "./catalog.tables";

@Injectable()
export class RemovableIngredientsReader implements RemovableIngredientsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async byVariant(): Promise<VariantRemovableIngredients[]> {
    const rows = await this.db
      .select({ variantId: recipes.variant_id, inventoryItemId: inventoryItems.id, name: inventoryItems.name })
      .from(recipes)
      .innerJoin(recipeVersions, and(eq(recipeVersions.recipe_id, recipes.id), eq(recipeVersions.status, "ACTIVE")))
      .innerJoin(recipeIngredients, eq(recipeIngredients.recipe_version_id, recipeVersions.id))
      .innerJoin(inventoryItems, eq(inventoryItems.id, recipeIngredients.ingredient_item_id))
      .where(isNotNull(recipes.variant_id))
      .orderBy(asc(inventoryItems.name));
    const byVariant = new Map<string, VariantRemovableIngredients>();
    for (const row of rows) {
      const variantId = row.variantId!;
      const entry = byVariant.get(variantId) ?? { variantId, ingredients: [] };
      entry.ingredients.push({ inventoryItemId: row.inventoryItemId, name: row.name });
      byVariant.set(variantId, entry);
    }
    return [...byVariant.values()];
  }
}
