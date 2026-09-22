import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError, VariantNotFoundError } from "../../domain/errors";

export interface SetModifierVariantPriceCommand {
  itemId: string;
  modifierId: string;
  variantId: string;
  priceDelta: number;
}

@Injectable()
export class SetModifierVariantPriceHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: SetModifierVariantPriceCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    if (!item.variants.some((v) => v.id === command.variantId)) throw new VariantNotFoundError();

    item.setModifierVariantPrice(command.modifierId, command.variantId, command.priceDelta);
    await this.items.save(item);
    return item;
  }
}
