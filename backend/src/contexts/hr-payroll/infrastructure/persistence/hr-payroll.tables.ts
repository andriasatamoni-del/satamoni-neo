// Drizzle table definitions for the hr-payroll tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const payrollRuns = pgTable("payroll_runs", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  year: integer().notNull(),
  month: integer().notNull(),
  status: text().default('DRAFT').notNull(),
  total_net_pay: numeric().default('0').notNull().$type<number>(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  approved_by: uuid(),
  approved_at: timestamp({ withTimezone: true, mode: "date" }),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  cancellation_reason: text(),
  legacy_payroll_run_id: integer(),
}, (table) => [
  uniqueIndex("idx_payroll_runs_year_month_active").using("btree", table.year.asc().nullsLast(), table.month.asc().nullsLast()).where(sql`(status <> 'CANCELLED'::text)`),
  foreignKey({
      columns: [table.approved_by],
      foreignColumns: [users.id],
      name: "payroll_runs_approved_by_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "payroll_runs_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "payroll_runs_created_by_fkey"
    }),
  check("payroll_runs_month_check", sql`(month >= 1) AND (month <= 12)`),
  check("payroll_runs_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'CANCELLED'::text])`),
]);

export const payrollRunEmployees = pgTable("payroll_run_employees", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  payroll_run_id: uuid().notNull(),
  employee_id: uuid().notNull(),
  employee_name: text().notNull(),
  branch_id: uuid(),
  gross_pay: numeric().default('0').notNull().$type<number>(),
  advances: numeric().default('0').notNull().$type<number>(),
  penalties: numeric().default('0').notNull().$type<number>(),
  bonuses: numeric().default('0').notNull().$type<number>(),
  net_pay: numeric().default('0').notNull().$type<number>(),
}, (table) => [
  index("idx_payroll_run_employees_run").using("btree", table.payroll_run_id.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "payroll_run_employees_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.employee_id],
      foreignColumns: [employees.id],
      name: "payroll_run_employees_employee_id_fkey"
    }),
  foreignKey({
      columns: [table.payroll_run_id],
      foreignColumns: [payrollRuns.id],
      name: "payroll_run_employees_payroll_run_id_fkey"
    }).onDelete("cascade"),
]);

export const employeeLeaveRequests = pgTable("employee_leave_requests", {
  id: uuid().primaryKey().notNull(),
  employee_id: uuid().notNull(),
  leave_type: text().notNull(),
  start_date: localDate().notNull(),
  end_date: localDate().notNull(),
  days: integer().notNull(),
  reason: text(),
  status: text().default('PENDING').notNull(),
  reviewed_by: uuid(),
  reviewed_at: timestamp({ withTimezone: true, mode: "date" }),
  review_notes: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.employee_id],
      foreignColumns: [employees.id],
      name: "employee_leave_requests_employee_id_fkey"
    }),
  foreignKey({
      columns: [table.reviewed_by],
      foreignColumns: [users.id],
      name: "employee_leave_requests_reviewed_by_fkey"
    }),
  check("employee_leave_requests_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])`),
]);

export const employeeAttendanceShifts = pgTable("employee_attendance_shifts", {
  id: uuid().primaryKey().notNull(),
  employee_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  status: text().default('ACTIVE').notNull(),
  checked_in_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  checked_out_at: timestamp({ withTimezone: true, mode: "date" }),
  hours_worked: numeric().$type<number>(),
  notes: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_employee_attendance_shifts_one_active_per_employee").using("btree", table.employee_id.asc().nullsLast()).where(sql`(status = 'ACTIVE'::text)`),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "employee_attendance_shifts_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.employee_id],
      foreignColumns: [employees.id],
      name: "employee_attendance_shifts_employee_id_fkey"
    }),
  check("employee_attendance_shifts_status_check", sql`status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text])`),
]);

export const departments = pgTable("departments", {
  id: uuid().primaryKey().notNull(),
  code: text().notNull(),
  name: text().notNull(),
  description: text(),
  status: text().default('active').notNull(),
  legacy_department_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("departments_code_key").on(table.code),
  unique("departments_name_key").on(table.name),
  check("departments_status_check", sql`status = ANY (ARRAY['active'::text, 'inactive'::text])`),
]);

export const positions = pgTable("positions", {
  id: uuid().primaryKey().notNull(),
  code: text().notNull(),
  name: text().notNull(),
  department_id: uuid(),
  description: text(),
  status: text().default('active').notNull(),
  legacy_position_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_positions_department").using("btree", table.department_id.asc().nullsLast()),
  foreignKey({
      columns: [table.department_id],
      foreignColumns: [departments.id],
      name: "positions_department_id_fkey"
    }),
  unique("positions_code_key").on(table.code),
  check("positions_status_check", sql`status = ANY (ARRAY['active'::text, 'inactive'::text])`),
]);

export const employees = pgTable("employees", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  user_id: uuid(),
  name: text().notNull(),
  hire_date: localDate(),
  base_salary: numeric().default('0').notNull().$type<number>(),
  wage_type: text().default('fixed_monthly').notNull(),
  hourly_rate: numeric().$type<number>(),
  working_days_per_month: integer(),
  shift: text(),
  restricted_branch_id: uuid(),
  employee_code: text(),
  phone: text(),
  notes: text(),
  status: text().default('active').notNull(),
  termination_date: localDate(),
  termination_reason: text(),
  legacy_employee_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  department_id: uuid(),
  position_id: uuid(),
}, (table) => [
  foreignKey({
      columns: [table.department_id],
      foreignColumns: [departments.id],
      name: "employees_department_id_fkey"
    }),
  foreignKey({
      columns: [table.position_id],
      foreignColumns: [positions.id],
      name: "employees_position_id_fkey"
    }),
  foreignKey({
      columns: [table.restricted_branch_id],
      foreignColumns: [branches.id],
      name: "employees_restricted_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "employees_user_id_fkey"
    }),
  check("employees_status_check", sql`status = ANY (ARRAY['active'::text, 'suspended'::text, 'terminated'::text])`),
  check("employees_wage_type_check", sql`wage_type = ANY (ARRAY['fixed_monthly'::text, 'hourly'::text])`),
]);

export const employeeHistory = pgTable("employee_history", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  employee_id: uuid().notNull(),
  field_name: text().notNull(),
  old_value: text(),
  new_value: text(),
  effective_date: localDate().default(sql`CURRENT_DATE`).notNull(),
  changed_by: uuid(),
  reason: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_employee_history_effective_date").using("btree", table.effective_date.asc().nullsLast()),
  index("idx_employee_history_employee").using("btree", table.employee_id.asc().nullsLast()),
  index("idx_employee_history_field").using("btree", table.field_name.asc().nullsLast()),
  foreignKey({
      columns: [table.changed_by],
      foreignColumns: [users.id],
      name: "employee_history_changed_by_fkey"
    }),
  foreignKey({
      columns: [table.employee_id],
      foreignColumns: [employees.id],
      name: "employee_history_employee_id_fkey"
    }).onDelete("cascade"),
]);

export const payrollAdjustments = pgTable("payroll_adjustments", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  employee_id: uuid().notNull(),
  entry_date: localDate().notNull(),
  adjustment_type: text().notNull(),
  amount: numeric().notNull().$type<number>(),
  notes: text(),
  status: text().default('ACTIVE').notNull(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  cancellation_reason: text(),
  payroll_run_id: uuid(),
}, (table) => [
  index("idx_payroll_adjustments_employee").using("btree", table.employee_id.asc().nullsLast()),
  index("idx_payroll_adjustments_entry_date").using("btree", table.entry_date.asc().nullsLast()),
  index("idx_payroll_adjustments_run").using("btree", table.payroll_run_id.asc().nullsLast()),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "payroll_adjustments_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "payroll_adjustments_created_by_fkey"
    }),
  foreignKey({
      columns: [table.employee_id],
      foreignColumns: [employees.id],
      name: "payroll_adjustments_employee_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.payroll_run_id],
      foreignColumns: [payrollRuns.id],
      name: "payroll_adjustments_payroll_run_id_fkey"
    }),
  check("payroll_adjustments_adjustment_type_check", sql`adjustment_type = ANY (ARRAY['advance'::text, 'penalty'::text, 'bonus'::text])`),
  check("payroll_adjustments_amount_check", sql`amount > (0)::numeric`),
  check("payroll_adjustments_status_check", sql`status = ANY (ARRAY['ACTIVE'::text, 'CANCELLED'::text])`),
]);
