import type { Generated } from "kysely";

export interface BranchStockThresholdsTable {
  branch_id: string;
  inventory_item_id: string;
  reorder_point: number | null;
  min_stock: number | null;
  max_stock: number | null;
  updated_by: string | null;
  updated_at: Generated<Date>;
}
