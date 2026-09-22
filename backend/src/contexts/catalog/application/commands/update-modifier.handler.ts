import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";

export interface UpdateModifierCommand {
  itemId: string;
  modifierId: string;
  name?: string;
  priceDelta?: number;
  isActive?: boolean;
}

@Injectable()
export class UpdateModifierHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: UpdateModifierCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    item.updateModifier(command.modifierId, command);
    await this.items.save(item);
    return item;
  }
}
