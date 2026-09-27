import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError, ModifierNotFoundError } from "../../domain/errors";
import { MenuPriceHistoryService } from "../services/menu-price-history.service";

export interface UpdateModifierCommand {
  itemId: string;
  modifierId: string;
  name?: string;
  priceDelta?: number;
  isActive?: boolean;
  changedBy?: string | null;
}

@Injectable()
export class UpdateModifierHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly priceHistory: MenuPriceHistoryService
  ) {}

  async execute(command: UpdateModifierCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();

    const before = item.modifiers.find((m) => m.id === command.modifierId);
    if (!before) throw new ModifierNotFoundError();
    const oldPriceDelta = before.priceDelta;

    item.updateModifier(command.modifierId, command);
    await this.items.save(item);

    if (command.priceDelta !== undefined) {
      await this.priceHistory.recordChange({
        entityType: "modifier", entityId: command.modifierId, fieldName: "price_delta",
        oldPrice: oldPriceDelta, newPrice: command.priceDelta, changedBy: command.changedBy ?? null,
      });
    }

    return item;
  }
}
