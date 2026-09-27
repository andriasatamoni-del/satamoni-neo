import type { Generated } from "kysely";

export interface InventoryBatchesTable {
  id: Generated<string>;
  batch_number: string;
  inventory_item_id: string;
  branch_id: string;
  received_quantity: number;
  remaining_quantity: number;
  unit_cost: number | null;
  expiry_date: Date | null;
  production_date: Date | null;
  source_type: string;
  source_id: string;
  status: string;
  created_by: string | null;
  created_at: Generated<Date>;
}
