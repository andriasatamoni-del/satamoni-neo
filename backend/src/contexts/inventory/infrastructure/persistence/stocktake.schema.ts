import type { Generated } from "kysely";

export interface StocktakesTable {
  id: Generated<string>;
  branch_id: string;
  created_by: string | null;
  notes: string | null;
  total_variance_value: number;
  created_at: Generated<Date>;
}

export interface StocktakeLinesTable {
  id: Generated<string>;
  stocktake_id: string;
  inventory_item_id: string;
  system_quantity: number;
  actual_quantity: number;
  variance_quantity: number;
  unit_cost: number | null;
  variance_value: number | null;
  reason: string | null;
  charge_account_code: string | null;
  inventory_movement_id: string | null;
  created_at: Generated<Date>;
}
