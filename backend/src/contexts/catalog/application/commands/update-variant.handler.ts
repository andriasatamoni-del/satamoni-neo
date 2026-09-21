import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";

export interface UpdateVariantCommand {
  itemId: string;
  variantId: string;
  price: number;
  talabatPrice?: number | null;
}

@Injectable()
export class UpdateVariantHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: UpdateVariantCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();

    item.updateVariantPrice(command.variantId, command.price, command.talabatPrice);
    await this.items.save(item);
    return item;
  }
}
