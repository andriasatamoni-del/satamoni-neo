import { Inject, Injectable } from "@nestjs/common";
import { MenuItem, type MenuItemModifier } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";

export interface AddModifierCommand {
  itemId: string;
  name: string;
  priceDelta: number;
}

@Injectable()
export class AddModifierHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: AddModifierCommand): Promise<{ item: MenuItem; modifier: MenuItemModifier }> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    const modifier = item.addModifier(command);
    await this.items.save(item);
    return { item, modifier };
  }
}
