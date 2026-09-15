import type { InventoryItem } from "../inventory-item.aggregate";

export interface InventoryItemRepositoryPort {
  save(item: InventoryItem): Promise<void>;
  findById(id: string): Promise<InventoryItem | null>;
  findByName(name: string): Promise<InventoryItem | null>;
  existsByName(name: string): Promise<boolean>;
  findByLegacyInventoryItemId(legacyId: number): Promise<InventoryItem | null>;
  list(): Promise<InventoryItem[]>;
}

export const INVENTORY_ITEM_REPOSITORY = Symbol("INVENTORY_ITEM_REPOSITORY");
