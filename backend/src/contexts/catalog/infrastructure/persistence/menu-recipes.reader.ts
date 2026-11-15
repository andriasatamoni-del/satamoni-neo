import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, exists, inArray, not, notExists, sql, type SQL } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { groupBy, inListChunks, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import type {
  MenuRecipe,
  MenuRecipeIngredient,
  MenuRecipeItem,
  MenuRecipeItemFilter,
  MenuRecipeOption,
  MenuRecipesReaderPort,
} from "../../domain/ports/menu-recipes-reader.port";
import { menuCategories, menuItems, menuItemVariants, recipeIngredients, recipes, recipeVersions } from "./catalog.tables";

const SELLABLE = eq(recipes.recipe_type, "sellable_variant");

@Injectable()
export class MenuRecipesReader implements MenuRecipesReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async recipes(filter: { q?: string }, page?: PageRequest): Promise<{ rows: MenuRecipe[]; total: number }> {
    const where = and(SELLABLE, searchCondition(filter.q, recipes.name));
    const query = this.db.select({ id: recipes.id, name: recipes.name }).from(recipes).where(where).orderBy(asc(recipes.name), asc(recipes.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(recipes).where(where)));
    if (rows.length === 0) return { rows: [], total };

    const recipeIds = rows.map((r) => r.id);
    const versions = await this.activeVersions(recipeIds);
    const usage: (MenuRecipeUsage & { recipeId: string })[] = [];
    for (const ids of inListChunks(recipeIds)) {
      usage.push(
        ...((await this.db
          .select({ recipeId: menuItemVariants.recipe_id, itemId: menuItems.id, itemName: menuItems.name, variantId: menuItemVariants.id, label: menuItemVariants.label })
          .from(menuItemVariants)
          .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
          .where(inArray(menuItemVariants.recipe_id, ids))
          .orderBy(asc(menuItems.name), asc(menuItemVariants.label))) as (MenuRecipeUsage & { recipeId: string })[])
      );
    }
    const usageByRecipe = groupBy(usage, (u) => u.recipeId);
    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        activeVersion: versions.get(r.id) ?? null,
        usedBy: (usageByRecipe.get(r.id) ?? []).map(({ recipeId: _recipeId, ...rest }) => rest),
      })),
    };
  }

  async items(filter: MenuRecipeItemFilter, page?: PageRequest): Promise<{ rows: MenuRecipeItem[]; total: number }> {
    const hasRecipe = this.itemHasRecipe();
    const where = and(
      filter.itemId ? eq(menuItems.id, filter.itemId) : undefined,
      filter.missing ? not(hasRecipe) : undefined,
      searchCondition(filter.q, menuItems.name)
    );
    const query = this.db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        kind: menuItems.kind,
        categoryId: menuItems.category_id,
        categoryName: menuCategories.name,
        isActive: menuItems.is_active,
        awaitingRecipe: menuItems.awaiting_recipe,
        hasRecipe: sql<boolean>`(${hasRecipe})`,
      })
      .from(menuItems)
      .leftJoin(menuCategories, eq(menuCategories.id, menuItems.category_id))
      .where(where)
      .orderBy(sql`(${hasRecipe})`, asc(menuItems.name), asc(menuItems.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(menuItems).where(where)));
    if (rows.length === 0) return { rows: [], total };

    const variantRows: { id: string; itemId: string; label: string; recipeId: string | null; recipeName: string | null }[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      variantRows.push(
        ...(await this.db
          .select({ id: menuItemVariants.id, itemId: menuItemVariants.item_id, label: menuItemVariants.label, recipeId: menuItemVariants.recipe_id, recipeName: recipes.name })
          .from(menuItemVariants)
          .leftJoin(recipes, eq(recipes.id, menuItemVariants.recipe_id))
          .where(inArray(menuItemVariants.item_id, ids))
          .orderBy(asc(menuItemVariants.label)))
      );
    }
    const ready = await this.readyRecipeIds(variantRows.flatMap((v) => (v.recipeId ? [v.recipeId] : [])));
    const variantsByItem = groupBy(variantRows, (v) => v.itemId);
    return {
      total,
      rows: rows.map((item) => ({
        ...item,
        hasRecipe: Boolean(item.hasRecipe),
        variants: (variantsByItem.get(item.id) ?? []).map(({ itemId: _itemId, ...variant }) => ({ ...variant, ready: !!variant.recipeId && ready.has(variant.recipeId) })),
      })),
    };
  }

  async options(): Promise<MenuRecipeOption[]> {
    const rows = await this.db.select({ id: recipes.id, name: recipes.name }).from(recipes).where(SELLABLE).orderBy(asc(recipes.name));
    const ready = await this.readyRecipeIds(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, ready: ready.has(r.id) }));
  }

  private itemHasRecipe(): SQL {
    const readyVersion = this.db
      .select({ one: sql`1` })
      .from(recipeVersions)
      .innerJoin(recipeIngredients, eq(recipeIngredients.recipe_version_id, recipeVersions.id))
      .where(and(eq(recipeVersions.recipe_id, menuItemVariants.recipe_id), eq(recipeVersions.status, "ACTIVE")));
    const anyVariant = this.db.select({ one: sql`1` }).from(menuItemVariants).where(eq(menuItemVariants.item_id, menuItems.id));
    const variantWithoutRecipe = this.db
      .select({ one: sql`1` })
      .from(menuItemVariants)
      .where(and(eq(menuItemVariants.item_id, menuItems.id), notExists(readyVersion)));
    return and(exists(anyVariant), notExists(variantWithoutRecipe))!;
  }

  private async readyRecipeIds(recipeIds: string[]): Promise<Set<string>> {
    const ready = new Set<string>();
    for (const ids of inListChunks([...new Set(recipeIds)])) {
      const rows = await this.db
        .selectDistinct({ recipeId: recipeVersions.recipe_id })
        .from(recipeVersions)
        .innerJoin(recipeIngredients, eq(recipeIngredients.recipe_version_id, recipeVersions.id))
        .where(and(inArray(recipeVersions.recipe_id, ids), eq(recipeVersions.status, "ACTIVE")));
      for (const row of rows) ready.add(row.recipeId);
    }
    return ready;
  }

  private async activeVersions(recipeIds: string[]): Promise<Map<string, MenuRecipe["activeVersion"]>> {
    const versionRows: { recipeId: string; versionId: string; versionNumber: number }[] = [];
    for (const ids of inListChunks(recipeIds)) {
      versionRows.push(
        ...(await this.db
          .select({ recipeId: recipeVersions.recipe_id, versionId: recipeVersions.id, versionNumber: recipeVersions.version_number })
          .from(recipeVersions)
          .where(and(inArray(recipeVersions.recipe_id, ids), eq(recipeVersions.status, "ACTIVE"))))
      );
    }
    const ingredientRows: (MenuRecipeIngredient & { versionId: string })[] = [];
    for (const ids of inListChunks(versionRows.map((v) => v.versionId))) {
      const rows = await this.db
        .select({
          versionId: recipeIngredients.recipe_version_id,
          ingredientItemId: recipeIngredients.ingredient_item_id,
          name: inventoryItems.name,
          unit: inventoryItems.unit,
          quantity: recipeIngredients.quantity,
        })
        .from(recipeIngredients)
        .innerJoin(inventoryItems, eq(inventoryItems.id, recipeIngredients.ingredient_item_id))
        .where(inArray(recipeIngredients.recipe_version_id, ids))
        .orderBy(asc(inventoryItems.name));
      ingredientRows.push(...rows.map((r) => ({ ...r, quantity: Number(r.quantity) })));
    }
    const ingredientsByVersion = groupBy(ingredientRows, (i) => i.versionId);
    const result = new Map<string, MenuRecipe["activeVersion"]>();
    for (const v of versionRows) {
      const ingredients = (ingredientsByVersion.get(v.versionId) ?? []).map(({ versionId: _versionId, ...rest }) => rest);
      if (ingredients.length > 0) result.set(v.recipeId, { versionNumber: v.versionNumber, ingredients });
    }
    return result;
  }
}

type MenuRecipeUsage = MenuRecipe["usedBy"][number];
