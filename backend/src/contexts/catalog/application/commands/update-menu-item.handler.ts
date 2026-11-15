import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";
import { MenuItemRecipeStatus } from "../services/menu-item-recipe-status.service";

export interface UpdateMenuItemCommand {
  itemId: string;
  name?: string;
  categoryId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  isBest?: boolean;
  isActive?: boolean;
}

@Injectable()
export class UpdateMenuItemHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly recipeStatus: MenuItemRecipeStatus
  ) {}

  async execute(command: UpdateMenuItemCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();

    if (command.name !== undefined) item.rename(command.name);
    item.updateDetails({
      categoryId: command.categoryId,
      description: command.description,
      imageUrl: command.imageUrl,
      isBest: command.isBest,
    });
    if (command.isActive === true && !item.isActive) item.activate(await this.recipeStatus.hasRecipe(item));
    if (command.isActive === false && (item.isActive || item.awaitingRecipe)) item.deactivate();

    await this.items.save(item);
    return item;
  }
}
