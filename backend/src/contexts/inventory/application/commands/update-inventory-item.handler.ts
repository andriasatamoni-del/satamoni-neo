import { Inject, Injectable } from "@nestjs/common";
import type { InventoryItem } from "../../domain/inventory-item.aggregate";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import { InventoryItemIdentityChangeError, InventoryItemNotFoundError } from "../../domain/errors";

export interface UpdateInventoryItemCommand {
  itemId: string;
  unit?: string;
  itemType?: string;
  unitCost?: number | null;
  negativeStockPolicy?: string;
}

@Injectable()
export class UpdateInventoryItemHandler {
  constructor(@Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort) {}

  async execute(command: UpdateInventoryItemCommand): Promise<{ item: InventoryItem; changed: boolean }> {
    const item = await this.items.findById(command.itemId);
    if (!item) throw new InventoryItemNotFoundError();
    if (command.unit !== undefined && command.unit.trim() !== item.unit) throw new InventoryItemIdentityChangeError(item.name, "وحدة القياس");
    if (command.itemType !== undefined && command.itemType !== item.itemType) throw new InventoryItemIdentityChangeError(item.name, "نوع الصنف");

    let changed = false;
    if (command.unitCost !== undefined && command.unitCost !== (item.unitCost === null ? null : Number(item.unitCost))) {
      item.updateUnitCost(command.unitCost);
      changed = true;
    }
    if (command.negativeStockPolicy !== undefined && command.negativeStockPolicy !== item.negativeStockPolicy) {
      item.changeNegativeStockPolicy(command.negativeStockPolicy);
      changed = true;
    }
    if (changed) await this.items.save(item);
    return { item, changed };
  }
}
