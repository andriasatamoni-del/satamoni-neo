import { Inject, Injectable } from "@nestjs/common";
import { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { RecipeNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";

export interface ActivateRecipeVersionCommand {
  recipeId: string;
  versionId: string;
}

@Injectable()
export class ActivateRecipeVersionHandler {
  constructor(
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus,
    private readonly tx: TransactionService
  ) {}

  execute(command: ActivateRecipeVersionCommand): Promise<Recipe> {
    return this.tx.run(async () => {
      const recipe = await this.recipes.findById(command.recipeId);
      if (!recipe) throw new RecipeNotFoundError();

      recipe.activateVersion(command.versionId);
      await this.recipes.save(recipe);
      await this.recipeStatus.refreshItemsUsing(recipe.id);
      return recipe;
    });
  }
}
