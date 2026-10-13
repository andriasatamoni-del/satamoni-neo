// Drizzle table definitions for the delivery tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { journalEntries } from "../../../accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const drivers = pgTable("drivers", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  phone: text(),
  branch_id: uuid().notNull(),
  status: text().default('AVAILABLE').notNull(),
  legacy_driver_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "drivers_branch_id_fkey"
    }),
  check("drivers_status_check", sql`status = ANY (ARRAY['AVAILABLE'::text, 'BUSY'::text, 'OFF_DUTY'::text, 'SUSPENDED'::text, 'INACTIVE'::text])`),
]);

export const driverSettlements = pgTable("driver_settlements", {
  id: uuid().primaryKey().notNull(),
  driver_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  settled_by: uuid(),
  settled_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  order_count: integer().default(0).notNull(),
  cod_expected: numeric().default('0').notNull().$type<number>(),
  cod_collected: numeric().default('0').notNull().$type<number>(),
  expected_handover: numeric().default('0').notNull().$type<number>(),
  actual_handover: numeric().notNull().$type<number>(),
  handover_variance: numeric().default('0').notNull().$type<number>(),
  variance_status: text().default('NONE').notNull(),
  variance_reviewed_by: uuid(),
  variance_reviewed_at: timestamp({ withTimezone: true, mode: "date" }),
  variance_review_notes: text(),
  bonus_total: numeric().default('0').notNull().$type<number>(),
  notes: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "driver_settlements_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.driver_id],
      foreignColumns: [drivers.id],
      name: "driver_settlements_driver_id_fkey"
    }),
  foreignKey({
      columns: [table.settled_by],
      foreignColumns: [users.id],
      name: "driver_settlements_settled_by_fkey"
    }),
  foreignKey({
      columns: [table.variance_reviewed_by],
      foreignColumns: [users.id],
      name: "driver_settlements_variance_reviewed_by_fkey"
    }),
  check("driver_settlements_variance_status_check", sql`variance_status = ANY (ARRAY['NONE'::text, 'PENDING_REVIEW'::text, 'ACKNOWLEDGED'::text, 'APPROVED'::text])`),
]);

export const deliveryAssignments = pgTable("delivery_assignments", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  order_id: uuid().notNull(),
  driver_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  status: text().default('ASSIGNED').notNull(),
  assigned_by: uuid(),
  assigned_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  delivered_at: timestamp({ withTimezone: true, mode: "date" }),
  failure_reason: text(),
  collected_amount: numeric().$type<number>(),
  settlement_id: uuid(),
}, (table) => [
  index("idx_delivery_assignments_driver").using("btree", table.driver_id.asc().nullsLast()),
  foreignKey({
      columns: [table.assigned_by],
      foreignColumns: [users.id],
      name: "delivery_assignments_assigned_by_fkey"
    }),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "delivery_assignments_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.driver_id],
      foreignColumns: [drivers.id],
      name: "delivery_assignments_driver_id_fkey"
    }),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "delivery_assignments_order_id_fkey"
    }),
  foreignKey({
      columns: [table.settlement_id],
      foreignColumns: [driverSettlements.id],
      name: "delivery_assignments_settlement_id_fkey"
    }),
  unique("delivery_assignments_order_id_key").on(table.order_id),
  check("delivery_assignments_status_check", sql`status = ANY (ARRAY['UNASSIGNED'::text, 'ASSIGNED'::text, 'OUT_FOR_DELIVERY'::text, 'DELIVERED'::text, 'FAILED'::text, 'RETURNED'::text])`),
]);

export const driverAttendanceShifts = pgTable("driver_attendance_shifts", {
  id: uuid().primaryKey().notNull(),
  driver_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  status: text().default('ACTIVE').notNull(),
  checked_in_by: uuid(),
  checked_in_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  checked_out_by: uuid(),
  checked_out_at: timestamp({ withTimezone: true, mode: "date" }),
  hourly_rate: numeric().notNull().$type<number>(),
  hours_worked: numeric().$type<number>(),
  wage_amount: numeric().$type<number>(),
  bonus_total: numeric().$type<number>(),
  total_pay: numeric().$type<number>(),
  journal_entry_id: uuid(),
  notes: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_driver_attendance_shifts_one_active_per_driver").using("btree", table.driver_id.asc().nullsLast()).where(sql`(status = 'ACTIVE'::text)`),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "driver_attendance_shifts_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.checked_in_by],
      foreignColumns: [users.id],
      name: "driver_attendance_shifts_checked_in_by_fkey"
    }),
  foreignKey({
      columns: [table.checked_out_by],
      foreignColumns: [users.id],
      name: "driver_attendance_shifts_checked_out_by_fkey"
    }),
  foreignKey({
      columns: [table.driver_id],
      foreignColumns: [drivers.id],
      name: "driver_attendance_shifts_driver_id_fkey"
    }),
  foreignKey({
      columns: [table.journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "driver_attendance_shifts_journal_entry_id_fkey"
    }),
  check("driver_attendance_shifts_status_check", sql`status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text])`),
]);
