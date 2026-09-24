import { Inject, Injectable } from "@nestjs/common";
import { Combo } from "../../domain/combo.aggregate";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../domain/ports/combo-repository.port";
import { ComboNotFoundError, InvalidComboItemError } from "../../domain/errors";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";

export interface ReplaceComboItemsCommand {
  comboId: string;
  items: { variantId: string; quantity?: number }[];
}

@Injectable()
export class ReplaceComboItemsHandler {
  constructor(
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort
  ) {}

  async execute(command: ReplaceComboItemsCommand): Promise<Combo> {
    const combo = await this.combos.findById(command.comboId);
    if (!combo) throw new ComboNotFoundError();
    for (const it of command.items) {
      const menuItem = await this.menuItems.findByVariantId(it.variantId);
      if (!menuItem) throw new InvalidComboItemError();
    }

    combo.replaceItems(command.items);
    await this.combos.save(combo);
    return combo;
  }
}
