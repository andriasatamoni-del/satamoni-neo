import { Inject, Injectable } from "@nestjs/common";
import { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";

@Injectable()
export class GetRecipeByVariantHandler {
  constructor(@Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort) {}

  async execute(variantId: string): Promise<Recipe | null> {
    return this.recipes.findByVariantId(variantId);
  }
}
