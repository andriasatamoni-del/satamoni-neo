import type { Generated } from "kysely";

export interface TalabatOrdersTable {
  id: Generated<string>;
  talabat_order_id: string;
  branch_id: string | null;
  pos_order_id: string | null;
  status: string;
  raw_payload: unknown;
  error_reason: string | null;
  canceled_at: Date | null;
  cancellation_source: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TalabatProductMappingTable {
  id: Generated<string>;
  branch_id: string;
  talabat_item_id: string;
  menu_item_id: string | null;
  variant_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TalabatWebhookEventsTable {
  id: Generated<string>;
  dedupe_key: string;
  raw_body: unknown;
  received_at: Generated<Date>;
}

export interface TalabatIntegrationErrorsTable {
  id: Generated<string>;
  stage: string;
  talabat_order_id: string | null;
  message: string;
  context: unknown;
  retry_count: number;
  last_retry_at: Date | null;
  status: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
