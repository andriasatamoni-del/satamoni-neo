import type { Generated } from "kysely";

export interface ConversionOrdersTable {
  id: string;
  branch_id: string;
  recipe_id: string;
  recipe_version_id: string;
  output_item_id: string;
  status: string;
  planned_output_quantity: number;
  actual_output_quantity: number | null;
  output_unit_cost: number | null;
  output_movement_id: string | null;
  variance_reason: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  completed_by: string | null;
  cancelled_by: string | null;
  approved_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
}

export interface ConversionOrderInputLinesTable {
  id: string;
  conversion_order_id: string;
  ingredient_item_id: string;
  planned_quantity_per_unit: number;
  planned_quantity: number;
  actual_quantity: number | null;
  unit_cost: number | null;
  movement_id: string | null;
}
