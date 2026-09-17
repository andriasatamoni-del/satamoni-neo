import type { Recipe } from "../recipe.aggregate";

export interface RecipeRepositoryPort {
  save(recipe: Recipe): Promise<void>;
  findById(id: string): Promise<Recipe | null>;
  findByVariantId(variantId: string): Promise<Recipe | null>;
  findByInventoryItemId(inventoryItemId: string): Promise<Recipe | null>;
  findByLegacyRecipeId(legacyId: number): Promise<Recipe | null>;
  list(filter?: { recipeType?: string }): Promise<Recipe[]>;
}

export const RECIPE_REPOSITORY = Symbol("RECIPE_REPOSITORY");
