import { Inject, Injectable } from "@nestjs/common";
import { InventoryBatch } from "../../domain/inventory-batch.aggregate";
import { INVENTORY_BATCH_REPOSITORY, type InventoryBatchRepositoryPort } from "../../domain/ports/inventory-batch-repository.port";

@Injectable()
export class ListInventoryBatchesHandler {
  constructor(@Inject(INVENTORY_BATCH_REPOSITORY) private readonly batches: InventoryBatchRepositoryPort) {}

  async execute(input: { inventoryItemId: string; branchId: string }): Promise<InventoryBatch[]> {
    return this.batches.listActiveByItem(input.inventoryItemId, input.branchId);
  }
}
