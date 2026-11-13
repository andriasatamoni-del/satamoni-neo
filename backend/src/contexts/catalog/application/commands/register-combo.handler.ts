import { Inject, Injectable } from "@nestjs/common";
import { Combo, type ComboItemInput } from "../../domain/combo.aggregate";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../domain/ports/combo-repository.port";
import { DuplicateComboNameError } from "../../domain/errors";
import { assertValidComboItems } from "./combo-items.validation";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";

export interface RegisterComboCommand {
  name: string;
  price: number;
  items: ComboItemInput[];
  imageUrl?: string;
  description?: string;
  onlineOnly?: boolean;
}

@Injectable()
export class RegisterComboHandler {
  constructor(
    @Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort,
    @Inject(MENU_ITEM_REPOSITORY) private readonly menuItems: MenuItemRepositoryPort
  ) {}

  async execute(command: RegisterComboCommand): Promise<Combo> {
    if (await this.combos.existsByName(command.name.trim())) throw new DuplicateComboNameError();
    await assertValidComboItems(this.menuItems, command.items);

    const combo = Combo.register(command);
    await this.combos.save(combo);
    return combo;
  }
}
