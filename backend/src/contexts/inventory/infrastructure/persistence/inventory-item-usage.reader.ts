import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { InventoryItemUsageReaderPort } from "../../domain/ports/inventory-item-usage-reader.port";
import { menuItems, menuItemVariants, recipeIngredients, recipes, recipeVersions } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { inventoryItems } from "./inventory.tables";

@Injectable()
export class InventoryItemUsageReader implements InventoryItemUsageReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async linkedProductNames(inventoryItemId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({
        recipeName: recipes.name,
        productName: menuItems.name,
        sizeLabel: menuItemVariants.label,
        manufacturedItemName: inventoryItems.name,
      })
      .from(recipeIngredients)
      .innerJoin(recipeVersions, and(eq(recipeVersions.id, recipeIngredients.recipe_version_id), ne(recipeVersions.status, "ARCHIVED")))
      .innerJoin(recipes, eq(recipes.id, recipeVersions.recipe_id))
      .leftJoin(menuItemVariants, eq(menuItemVariants.recipe_id, recipes.id))
      .leftJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .leftJoin(inventoryItems, eq(inventoryItems.id, recipes.inventory_item_id))
      .where(eq(recipeIngredients.ingredient_item_id, inventoryItemId))
      .orderBy(asc(menuItems.name), asc(recipes.name));
    const names = rows.map((r) =>
      r.productName ? `${r.productName} (${r.sizeLabel})` : r.manufacturedItemName ?? `وصفة ${r.recipeName}`
    );
    return [...new Set(names)];
  }
}
