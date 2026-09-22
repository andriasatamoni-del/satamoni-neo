import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";

export interface ClearModifierVariantPriceCommand {
  itemId: string;
  modifierId: string;
  variantId: string;
}

@Injectable()
export class ClearModifierVariantPriceHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: ClearModifierVariantPriceCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();

    item.clearModifierVariantPrice(command.modifierId, command.variantId);
    await this.items.save(item);
    return item;
  }
}
