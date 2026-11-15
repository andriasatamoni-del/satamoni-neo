import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemListFilter, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListMenuItemsHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus
  ) {}

  async execute(filter: MenuItemListFilter = {}, page?: PageRequest): Promise<{ items: MenuItem[]; total: number; variantsWithRecipe: Set<string> }> {
    const { items, total } = await this.items.search(filter, page);
    const variantsWithRecipe = await this.recipeStatus.readyVariantIds(items);
    return { items, total, variantsWithRecipe };
  }
}
