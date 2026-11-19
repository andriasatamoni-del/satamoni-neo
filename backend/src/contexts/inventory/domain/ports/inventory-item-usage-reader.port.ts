export interface InventoryItemUsageReaderPort {
  linkedProductNames(inventoryItemId: string): Promise<string[]>;
}

export const INVENTORY_ITEM_USAGE_READER = Symbol("INVENTORY_ITEM_USAGE_READER");
