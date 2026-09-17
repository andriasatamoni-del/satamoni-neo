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
  collected_amount: number | null;
  settlement_id: string | null;
}

export interface DriverSettlementsTable {
  id: Generated<string>;
  driver_id: string;
  branch_id: string;
  settled_by: string | null;
  settled_at: Generated<Date>;
  order_count: number;
  cod_expected: number;
  cod_collected: number;
  expected_handover: number;
  actual_handover: number;
  handover_variance: number;
  variance_status: string;
  variance_reviewed_by: string | null;
  variance_reviewed_at: Date | null;
  variance_review_notes: string | null;
  bonus_total: number;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface DriverAttendanceShiftsTable {
  id: Generated<string>;
  driver_id: string;
  branch_id: string;
  status: string;
  checked_in_by: string | null;
  checked_in_at: Generated<Date>;
  checked_out_by: string | null;
  checked_out_at: Date | null;
  hourly_rate: number;
  hours_worked: number | null;
  wage_amount: number | null;
  bonus_total: number | null;
  total_pay: number | null;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: Generated<Date>;
}
