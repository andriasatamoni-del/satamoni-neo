import { eq, inArray } from "drizzle-orm";
import type { Database } from "../../../src/shared/database/database.token";
import { menuItems, menuItemVariants } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";

export async function markReadyForSale(db: Database, itemIds: string[]): Promise<void> {
  await db.update(menuItems).set({ is_active: true, awaiting_recipe: false }).where(inArray(menuItems.id, itemIds));
}

export async function linkVariantRecipe(db: Database, variantId: string, recipeId: string): Promise<void> {
  await db.update(menuItemVariants).set({ recipe_id: recipeId }).where(eq(menuItemVariants.id, variantId));
}
