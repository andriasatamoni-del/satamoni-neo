import { Inject, Injectable } from "@nestjs/common";
import { MenuItem, type MenuItemKind } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";

export interface RegisterMenuItemCommand {
  kind?: MenuItemKind;
  categoryId?: string | null;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  isBest?: boolean;
  variants?: { label: string; price: number; talabatPrice: number; recipeId?: string | null }[];
}

@Injectable()
export class RegisterMenuItemHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus
  ) {}

  async execute(command: RegisterMenuItemCommand): Promise<MenuItem> {
    for (const variant of command.variants ?? []) await this.recipeStatus.assertMenuRecipe(variant.recipeId);
    const item = MenuItem.register(command);
    for (const variant of command.variants ?? []) item.addVariant(variant);
    item.markAwaitingRecipe();
    await this.recipeStatus.applyRecipeState(item);
    await this.items.save(item);
    return item;
  }
}
