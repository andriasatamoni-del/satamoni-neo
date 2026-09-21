import type { Generated } from "kysely";

export interface CashDrawerEntriesTable {
  id: Generated<string>;
  shift_id: string;
  branch_id: string;
  user_id: string;
  entry_type: string;
  amount: number;
  label: string;
  notes: string | null;
  created_by: string;
  created_at: Generated<Date>;
}
