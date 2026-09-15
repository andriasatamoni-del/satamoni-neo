import type { Generated } from "kysely";

export interface DriversTable {
  id: Generated<string>;
  name: string;
  phone: string | null;
  branch_id: string;
  status: string;
  legacy_driver_id: number | null;
  created_at: Generated<Date>;
}

export interface DeliveryAssignmentsTable {
  id: Generated<string>;
  order_id: string;
  driver_id: string;
  branch_id: string;
  status: string;
  assigned_by: string | null;
  assigned_at: Generated<Date>;
  delivered_at: Date | null;
  failure_reason: string | null;
}
