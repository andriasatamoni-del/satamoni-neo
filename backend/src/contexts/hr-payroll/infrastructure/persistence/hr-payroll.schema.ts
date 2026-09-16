import type { Generated } from "kysely";

export interface EmployeesTable {
  id: Generated<string>;
  user_id: string | null;
  name: string;
  department: string | null;
  job_title: string | null;
  hire_date: Date | null;
  base_salary: number;
  wage_type: string;
  hourly_rate: number | null;
  working_days_per_month: number | null;
  shift: string | null;
  restricted_branch_id: string | null;
  employee_code: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  termination_date: Date | null;
  termination_reason: string | null;
  legacy_employee_id: number | null;
  created_at: Generated<Date>;
}

export interface PayrollRunsTable {
  id: Generated<string>;
  year: number;
  month: number;
  status: string;
  total_net_pay: number;
  created_by: string | null;
  created_at: Generated<Date>;
  approved_by: string | null;
  approved_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  legacy_payroll_run_id: number | null;
}

export interface PayrollRunEmployeesTable {
  id: Generated<string>;
  payroll_run_id: string;
  employee_id: string;
  employee_name: string;
  branch_id: string | null;
  gross_pay: number;
  advances: number;
  penalties: number;
  bonuses: number;
  net_pay: number;
}
