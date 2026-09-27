import { Inject, Injectable } from "@nestjs/common";
import { MenuItem } from "../../domain/menu-item.aggregate";
import { MENU_ITEM_REPOSITORY, type MenuItemRepositoryPort } from "../../domain/ports/menu-item-repository.port";
import { MenuItemNotFoundError, VariantNotFoundError } from "../../domain/errors";
import { MenuPriceHistoryService } from "../services/menu-price-history.service";

export interface UpdateVariantCommand {
  itemId: string;
  variantId: string;
  price: number;
  talabatPrice?: number | null;
  changedBy?: string | null;
}

@Injectable()
export class UpdateVariantHandler {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY) private readonly items: MenuItemRepositoryPort,
    private readonly priceHistory: MenuPriceHistoryService
  ) {}

  async execute(command: UpdateVariantCommand): Promise<MenuItem> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new MenuItemNotFoundError();

    const before = item.variants.find((v) => v.id === command.variantId);
    if (!before) throw new VariantNotFoundError();
    const oldPrice = before.price;
    const oldTalabatPrice = before.talabatPrice;

    item.updateVariantPrice(command.variantId, command.price, command.talabatPrice);
    await this.items.save(item);

    const changedBy = command.changedBy ?? null;
    await this.priceHistory.recordChange({
      entityType: "variant", entityId: command.variantId, fieldName: "price",
      oldPrice, newPrice: command.price, changedBy,
    });
    if (command.talabatPrice !== undefined) {
      await this.priceHistory.recordChange({
        entityType: "variant", entityId: command.variantId, fieldName: "talabat_price",
        oldPrice: oldTalabatPrice, newPrice: command.talabatPrice, changedBy,
      });
    }

    return item;
  }
}
