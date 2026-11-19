import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../domain/ports/inventory-item-repository.port";
import { INVENTORY_ITEM_USAGE_READER, type InventoryItemUsageReaderPort } from "../../domain/ports/inventory-item-usage-reader.port";
import { InventoryItemLinkedToProductsError, InventoryItemNotFoundError } from "../../domain/errors";
import type { InventoryItem } from "../../domain/inventory-item.aggregate";

@Injectable()
export class ArchiveInventoryItemHandler {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(INVENTORY_ITEM_USAGE_READER) private readonly usage: InventoryItemUsageReaderPort,
    private readonly tx: TransactionService
  ) {}

  async execute(itemId: string): Promise<InventoryItem> {
    return this.tx.run(async () => {
      const item = await this.items.findById(itemId);
      if (!item) throw new InventoryItemNotFoundError();
      const linkedProducts = await this.usage.linkedProductNames(item.id);
      if (linkedProducts.length > 0) throw new InventoryItemLinkedToProductsError(item.name, linkedProducts);
      item.archive();
      await this.items.save(item);
      return item;
    });
  }
}
