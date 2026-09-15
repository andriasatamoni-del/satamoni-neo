import { Inject, Injectable } from "@nestjs/common";
import { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { RecipeNotFoundError } from "../../domain/errors";

export interface ActivateRecipeVersionCommand {
  recipeId: string;
  versionId: string;
}

@Injectable()
export class ActivateRecipeVersionHandler {
  constructor(@Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort) {}

  async execute(command: ActivateRecipeVersionCommand): Promise<Recipe> {
    const recipe = await this.recipes.findById(command.recipeId);
    if (!recipe) throw new RecipeNotFoundError();

    recipe.activateVersion(command.versionId);
    await this.recipes.save(recipe);
    return recipe;
  }
}
