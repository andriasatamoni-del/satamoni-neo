import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";

export interface RegisterMenuItemCommand {
  categoryId?: string | null;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  isBest?: boolean;
  variants?: { label: string; price: number; talabatPrice?: number | null }[];
}

@Injectable()
export class RegisterMenuItemHandler {
  constructor(@Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort) {}

  async execute(command: RegisterMenuItemCommand): Promise<MenuItem> {
    const item = MenuItem.register(command);
    for (const variant of command.variants ?? []) item.addVariant(variant);
    await this.items.save(item);
    return item;
  }
}
