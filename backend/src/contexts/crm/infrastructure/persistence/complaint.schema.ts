import type { Generated } from "kysely";

// مطابق لـmigration 002_create_crm_tables بالظبط
export interface ComplaintsTable {
  id: Generated<string>;
  channel: string;
  legacy_order_id: number | null;
  branch_id: string | null;
  followup_id: string | null;
  customer_phone: string;
  category: string;
  description: string | null;
  status: Generated<string>;
  resolution_notes: string | null;
  created_by: string | null;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Generated<Date>;
  legacy_complaint_id: number | null;
  legacy_source: string | null;
}
