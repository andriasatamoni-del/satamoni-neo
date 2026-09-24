import type { Generated } from "kysely";

export interface ExpensesTable {
  id: Generated<string>;
  branch_id: string;
  business_date: Date;
  category_id: string;
  amount: number;
  notes: string | null;
  supplier_id: string | null;
  status: string;
  created_by: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  journal_entry_id: string | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  idempotency_key: string | null;
  created_at: Generated<Date>;
}
