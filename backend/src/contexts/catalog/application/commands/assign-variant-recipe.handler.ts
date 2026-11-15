import { Inject, Injectable } from "@nestjs/common";
import type { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { VariantNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";

export interface AssignVariantRecipeCommand {
  variantId: string;
  recipeId: string | null;
}

@Injectable()
export class AssignVariantRecipeHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus,
    private readonly tx: TransactionService
  ) {}

  execute(command: AssignVariantRecipeCommand): Promise<MenuItem> {
    return this.tx.run(async () => {
      const item = await this.items.findByVariantId(command.variantId);
      if (!item) throw new VariantNotFoundError();
      await this.recipeStatus.assertMenuRecipe(command.recipeId);
      item.assignRecipe(command.variantId, command.recipeId);
      await this.recipeStatus.applyRecipeState(item);
      await this.items.save(item);
      return item;
    });
  }
}
