import { Inject, Injectable } from "@nestjs/common";
import { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";

export interface RegisterRecipeCommand {
  recipeType: string;
  variantId?: string | null;
  inventoryItemId?: string | null;
}

@Injectable()
export class RegisterRecipeHandler {
  constructor(@Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort) {}

  async execute(command: RegisterRecipeCommand): Promise<Recipe> {
    const recipe = Recipe.register(command);
    await this.recipes.save(recipe);
    return recipe;
  }
}
