import { Inject, Injectable } from "@nestjs/common";
import { InventoryItem } from "../../domain/inventory-item.aggregate";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import { DuplicateItemNameError } from "../../domain/errors";

export interface RegisterInventoryItemCommand {
  name: string;
  unit: string;
  unitCost?: number | null;
  itemType?: string;
  negativeStockPolicy?: string;
}

@Injectable()
export class RegisterInventoryItemHandler {
  constructor(@Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort) {}

  async execute(command: RegisterInventoryItemCommand): Promise<InventoryItem> {
    if (await this.items.existsByName(command.name)) throw new DuplicateItemNameError(command.name);
    const item = InventoryItem.register(command);
    await this.items.save(item);
    return item;
  }
}
