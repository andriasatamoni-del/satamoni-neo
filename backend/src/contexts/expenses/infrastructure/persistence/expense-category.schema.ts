import type { Generated } from "kysely";

export interface ExpenseCategoriesTable {
  id: Generated<string>;
  name: string;
  is_active: boolean;
  alert_threshold: number | null;
  account_id: string | null;
  created_at: Generated<Date>;
}
