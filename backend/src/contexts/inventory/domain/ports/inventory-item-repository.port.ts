import type { InventoryItem } from "../inventory-item.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the inventory items list
export interface InventoryItemListFilter {
  q?: string;
  itemType?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface InventoryItemRepositoryPort {
  save(item: InventoryItem): Promise<void>;
  findById(id: string): Promise<InventoryItem | null>;
  findByName(name: string): Promise<InventoryItem | null>;
  existsByName(name: string): Promise<boolean>;
  findByLegacyInventoryItemId(legacyId: number): Promise<InventoryItem | null>;
  list(): Promise<InventoryItem[]>;
  search(filter: InventoryItemListFilter, page?: PageRequest): Promise<{ items: InventoryItem[]; total: number }>;
}

export const INVENTORY_ITEM_REPOSITORY = Symbol("INVENTORY_ITEM_REPOSITORY");
