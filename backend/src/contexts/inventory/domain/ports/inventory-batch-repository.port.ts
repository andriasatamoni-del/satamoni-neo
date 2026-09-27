import type { InventoryBatch } from "../inventory-batch.aggregate";

export interface InventoryBatchRepositoryPort {
  save(batch: InventoryBatch): Promise<void>;
  findById(id: string): Promise<InventoryBatch | null>;
  nextBatchNumber(): Promise<string>;
  listActiveByItem(inventoryItemId: string, branchId: string): Promise<InventoryBatch[]>;
  listExpiringSoon(input: { days: number; branchId: string | null }): Promise<InventoryBatch[]>;
}

export const INVENTORY_BATCH_REPOSITORY = Symbol("INVENTORY_BATCH_REPOSITORY");
