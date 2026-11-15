import { Inject, Injectable } from "@nestjs/common";
import { Recipe } from "../../domain/recipe.aggregate";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../domain/ports/recipe-repository.port";
import { TransactionService } from "../../../../shared/database/transaction-context";

export interface RegisterRecipeCommand {
  recipeType: string;
  name?: string;
  inventoryItemId?: string | null;
  ingredients?: { ingredientItemId: string; quantity: number; unit?: string | null }[];
  createdBy?: string | null;
}

@Injectable()
export class RegisterRecipeHandler {
  constructor(
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  execute(command: RegisterRecipeCommand): Promise<Recipe> {
    return this.tx.run(async () => {
      const name = command.name ?? (command.inventoryItemId ? await this.recipes.stockItemName(command.inventoryItemId) : null) ?? "";
      const recipe = Recipe.register({ ...command, name });
      if (command.ingredients?.length) recipe.replaceIngredients({ ingredients: command.ingredients, createdBy: command.createdBy });
      await this.recipes.save(recipe);
      return recipe;
    });
  }
}
