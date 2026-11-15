import { Inject, Injectable } from "@nestjs/common";
import type { MenuItem } from "../../domain/menu-item.aggregate";
import { MenuRecipeRequiredError, RecipeNotFoundError } from "../../domain/errors";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";

@Injectable()
export class MenuItemRecipeStatus {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort
  ) {}

  async assertMenuRecipe(recipeId: string | null | undefined): Promise<void> {
    if (!recipeId) return;
    const recipe = await this.recipes.findById(recipeId);
    if (!recipe) throw new RecipeNotFoundError();
    if (recipe.recipeType !== "sellable_variant") throw new MenuRecipeRequiredError();
  }

  async readyVariantIds(items: readonly MenuItem[]): Promise<Set<string>> {
    const variants = items.flatMap((item) => item.variants);
    const ready = await this.recipes.readyMenuRecipeIds(variants.flatMap((v) => (v.recipeId ? [v.recipeId] : [])));
    return new Set(variants.filter((v) => v.recipeId && ready.has(v.recipeId)).map((v) => v.id));
  }

  async hasRecipe(item: MenuItem): Promise<boolean> {
    if (item.variants.length === 0) return false;
    const ready = await this.readyVariantIds([item]);
    return item.variants.every((v) => ready.has(v.id));
  }

  async applyRecipeState(item: MenuItem): Promise<void> {
    const hasRecipe = await this.hasRecipe(item);
    if (hasRecipe) item.activateWithRecipe();
    else if (item.isActive) item.markAwaitingRecipe();
  }

  async refreshItemsUsing(recipeId: string): Promise<void> {
    for (const item of await this.items.findByRecipeId(recipeId)) {
      if (!item.awaitingRecipe || !(await this.hasRecipe(item))) continue;
      if (item.activateWithRecipe()) await this.items.save(item);
    }
  }
}
