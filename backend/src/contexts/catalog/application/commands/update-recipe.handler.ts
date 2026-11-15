import { Inject, Injectable } from "@nestjs/common";
import type { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { RecipeNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";

export interface UpdateRecipeCommand {
  recipeId: string;
  name?: string;
  ingredients?: { ingredientItemId: string; quantity: number; unit?: string | null }[];
  createdBy?: string | null;
}

@Injectable()
export class UpdateRecipeHandler {
  constructor(
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus,
    private readonly tx: TransactionService
  ) {}

  execute(command: UpdateRecipeCommand): Promise<Recipe> {
    return this.tx.run(async () => {
      const recipe = await this.recipes.findById(command.recipeId);
      if (!recipe) throw new RecipeNotFoundError();
      if (command.name !== undefined) recipe.rename(command.name);
      if (command.ingredients) recipe.replaceIngredients({ ingredients: command.ingredients, createdBy: command.createdBy });
      await this.recipes.save(recipe);
      await this.recipeStatus.refreshItemsUsing(recipe.id);
      return recipe;
    });
  }
}
