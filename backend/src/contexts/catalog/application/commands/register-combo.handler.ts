import { Inject, Injectable } from "@nestjs/common";
import { Combo } from "../../domain/combo.aggregate";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../domain/ports/combo-repository.port";
import { DuplicateComboNameError, InvalidComboItemError } from "../../domain/errors";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";

export interface RegisterComboCommand {
  name: string;
  price: number;
  items: { variantId: string; quantity?: number }[];
}

@Injectable()
export class RegisterComboHandler {
  constructor(
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort
  ) {}

  async execute(command: RegisterComboCommand): Promise<Combo> {
    if (await this.combos.existsByName(command.name.trim())) throw new DuplicateComboNameError();
    for (const it of command.items) {
      const menuItem = await this.menuItems.findByVariantId(it.variantId);
      if (!menuItem) throw new InvalidComboItemError();
    }

    const combo = Combo.register(command);
    await this.combos.save(combo);
    return combo;
  }
}
