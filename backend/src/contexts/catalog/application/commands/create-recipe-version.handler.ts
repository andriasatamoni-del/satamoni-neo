import { Inject, Injectable } from "@nestjs/common";
import { Recipe, type RecipeVersion } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { RecipeNotFoundError } from "../../domain/errors";

export interface CreateRecipeVersionCommand {
  recipeId: string;
  ingredients: { ingredientItemId: string; quantity: number; unit?: string | null }[];
  createdBy?: string | null;
}

@Injectable()
export class CreateRecipeVersionHandler {
  constructor(@Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort) {}

  async execute(command: CreateRecipeVersionCommand): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const recipe = await this.recipes.findById(command.recipeId);
    if (!recipe) throw new RecipeNotFoundError();

    const version = recipe.createDraftVersion({ createdBy: command.createdBy });
    for (const ingredient of command.ingredients) recipe.addIngredient(version.id, ingredient);

    await this.recipes.save(recipe);
    return { recipe, version };
  }
}
