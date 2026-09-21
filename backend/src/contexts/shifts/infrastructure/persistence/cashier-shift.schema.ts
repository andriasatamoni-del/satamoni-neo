import type { Generated } from "kysely";

export interface CashierShiftsTable {
  id: Generated<string>;
  branch_id: string;
  user_id: string;
  status: string;
  opened_at: Generated<Date>;
  opening_cash: number;
  opening_notes: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  actual_cash: number | null;
  expected_cash: number | null;
  cash_variance: number | null;
  closing_notes: string | null;
  cash_sales: number;
  card_sales: number;
  other_sales: number;
  order_count: number;
  cash_expenses_total: number;
  cash_purchases_total: number;
  variance_status: string;
  variance_reviewed_by: string | null;
  variance_reviewed_at: Date | null;
  variance_review_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
