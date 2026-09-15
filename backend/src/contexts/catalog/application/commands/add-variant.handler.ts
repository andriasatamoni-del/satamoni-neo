import { Inject, Injectable } from "@nestjs/common";
import { MenuItem, type MenuItemVariant } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError } from "../../domain/errors";

export interface AddVariantCommand {
  itemId: string;
  label: string;
  price: number;
  talabatPrice?: number | null;
}

@Injectable()
export class AddVariantHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: AddVariantCommand): Promise<{ item: MenuItem; variant: MenuItemVariant }> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    const variant = item.addVariant(command);
    await this.items.save(item);
    return { item, variant };
  }
}
