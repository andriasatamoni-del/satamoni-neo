import type { Generated } from "kysely";

export interface StockMovementsTable {
  id: Generated<string>;
  inventory_item_id: string;
  branch_id: string;
  movement_type: string;
  quantity_delta: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  performed_by: string | null;
  occurred_at: Generated<Date>;
  legacy_reference_key: string | null;
}

export interface BranchStockBalancesTable {
  branch_id: string;
  inventory_item_id: string;
  quantity: number;
}
