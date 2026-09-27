import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError, ModifierNotFoundError, VariantNotFoundError } from "../../domain/errors";
import { MenuPriceHistoryService } from "../services/menu-price-history.service";

export interface SetModifierVariantPriceCommand {
  itemId: string;
  modifierId: string;
  variantId: string;
  priceDelta: number;
  changedBy?: string | null;
}

@Injectable()
export class SetModifierVariantPriceHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly priceHistory: MenuPriceHistoryService
  ) {}

  async execute(command: SetModifierVariantPriceCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();
    if (!item.variants.some((v) => v.id === command.variantId)) throw new VariantNotFoundError();

    const modifier = item.modifiers.find((m) => m.id === command.modifierId);
    if (!modifier) throw new ModifierNotFoundError();
    const oldPriceDelta = modifier.variantPrices.find((vp) => vp.variantId === command.variantId)?.priceDelta ?? null;

    item.setModifierVariantPrice(command.modifierId, command.variantId, command.priceDelta);
    await this.items.save(item);

    await this.priceHistory.recordChange({
      entityType: "modifier_variant_price", entityId: command.modifierId, variantId: command.variantId,
      fieldName: "price_delta", oldPrice: oldPriceDelta, newPrice: command.priceDelta, changedBy: command.changedBy ?? null,
    });

    return item;
  }
}
