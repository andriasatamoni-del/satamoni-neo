import type { Generated } from "kysely";

// مطابق لـmigration 002_create_crm_tables بالظبط
export interface CustomerFollowupsTable {
  id: Generated<string>;
  legacy_order_id: number | null;
  branch_id: string | null;
  customer_phone: string;
  call_result: string;
  satisfaction_rating: string | null;
  notes: string | null;
  has_complaint: boolean;
  called_by: string | null;
  called_at: Generated<Date>;
  legacy_followup_id: number | null;
}
