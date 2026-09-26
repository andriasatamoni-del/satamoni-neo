import type { Generated } from "kysely";

export interface PaymentMethodsTable {
  id: Generated<string>;
  name: string;
  kind: string;
  settlement_channel: string | null;
  is_active: boolean;
  legacy_payment_method_id: number | null;
  talabat_payment_code: string | null;
  created_at: Generated<Date>;
}

export interface PaymentsTable {
  id: Generated<string>;
  order_id: string;
  branch_id: string;
  payment_method_id: string;
  method_kind: string;
  settlement_channel: string | null;
  amount: number;
  locked_at: Generated<Date>;
  locked_by: string | null;
  legacy_payment_id: number | null;
  created_at: Generated<Date>;
}

export interface PaymentAdjustmentRequestsTable {
  id: Generated<string>;
  payment_id: string;
  requested_by: string | null;
  requested_at: Generated<Date>;
  reason: string | null;
  proposed_payment_method_id: string | null;
  proposed_amount: number;
  amount_delta: number;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  legacy_adjustment_request_id: number | null;
}

export interface PaymentReconciliationRecordsTable {
  id: Generated<string>;
  branch_id: string | null;
  source: string;
  external_reference: string | null;
  external_amount: number;
  external_date: Date;
  matched_payment_id: string | null;
  match_status: string;
  notes: string | null;
  entered_by: string | null;
  entered_at: Generated<Date>;
  legacy_reconciliation_record_id: number | null;
  import_batch_id: string | null;
}
