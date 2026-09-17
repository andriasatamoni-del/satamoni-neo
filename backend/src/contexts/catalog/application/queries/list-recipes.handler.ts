import { Inject, Injectable } from "@nestjs/common";
import { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";

@Injectable()
export class ListRecipesHandler {
  constructor(@Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort) {}

  async execute(filter?: { recipeType?: string }): Promise<Recipe[]> {
    return this.recipes.list(filter);
  }
}
