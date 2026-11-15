import { Inject, Injectable } from "@nestjs/common";
import { MenuItem, type MenuItemVariant } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";

export interface AddVariantCommand {
  itemId: string;
  label: string;
  price: number;
  talabatPrice: number;
  recipeId?: string | null;
}

@Injectable()
export class AddVariantHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus
  ) {}

  async execute(command: AddVariantCommand): Promise<{ item: MenuItem; variant: MenuItemVariant }> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    await this.recipeStatus.assertMenuRecipe(command.recipeId);
    const variant = item.addVariant(command);
    await this.recipeStatus.applyRecipeState(item);
    await this.items.save(item);
    return { item, variant };
  }
}
