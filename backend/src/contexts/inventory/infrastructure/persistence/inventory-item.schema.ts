import type { Generated } from "kysely";

export interface InventoryItemsTable {
  id: Generated<string>;
  name: string;
  unit: string;
  unit_cost: number | null;
  item_type: string;
  negative_stock_policy: string;
  legacy_inventory_item_id: number | null;
  created_at: Generated<Date>;
}
