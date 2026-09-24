import type { Generated } from "kysely";

export interface TransferRequestsTable {
  id: Generated<string>;
  from_branch_id: string;
  to_branch_id: string;
  requested_by: string | null;
  required_date: Date | null;
  notes: string | null;
  status: string;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  dispatched_by: string | null;
  dispatched_at: Date | null;
  received_by: string | null;
  received_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Generated<Date>;
}

export interface TransferRequestLinesTable {
  id: Generated<string>;
  transfer_request_id: string;
  inventory_item_id: string;
  requested_quantity: number;
  approved_quantity: number | null;
  dispatched_quantity: number | null;
  received_quantity: number | null;
  dispatch_movement_id: string | null;
  receive_movement_id: string | null;
}
