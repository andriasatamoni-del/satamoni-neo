import type { Generated } from "kysely";

export interface BranchDaysTable {
  id: Generated<string>;
  branch_id: string;
  business_date: string;
  closed_by: string;
  closed_at: Generated<Date>;
  total_sales: number;
  order_count: number;
  cash_variance_total: number;
  manager_notes: string | null;
  created_at: Generated<Date>;
}
