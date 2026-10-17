// Drizzle table definitions for the shifts tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, check, uuid, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const cashDrawerEntries = pgTable("cash_drawer_entries", {
  id: uuid().primaryKey().notNull(),
  shift_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  user_id: uuid().notNull(),
  entry_type: text().notNull(),
  amount: numeric().notNull().$type<number>(),
  label: text().notNull(),
  notes: text(),
  created_by: uuid().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_cash_drawer_entries_branch_user_time").using("btree", table.branch_id.asc().nullsLast(), table.user_id.asc().nullsLast(), table.created_at.asc().nullsLast()),
  index("idx_cash_drawer_entries_shift").using("btree", table.shift_id.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "cash_drawer_entries_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "cash_drawer_entries_created_by_fkey"
    }),
  foreignKey({
      columns: [table.shift_id],
      foreignColumns: [cashierShifts.id],
      name: "cash_drawer_entries_shift_id_fkey"
    }),
  foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "cash_drawer_entries_user_id_fkey"
    }),
  check("cash_drawer_entries_entry_type_check", sql`entry_type = ANY (ARRAY['EXPENSE'::text, 'PURCHASE'::text])`),
]);

export const cashierShifts = pgTable("cashier_shifts", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  user_id: uuid().notNull(),
  status: text().notNull(),
  opened_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  opening_cash: numeric().notNull().$type<number>(),
  opening_notes: text(),
  closed_at: timestamp({ withTimezone: true, mode: "date" }),
  closed_by: uuid(),
  actual_cash: numeric().$type<number>(),
  expected_cash: numeric().$type<number>(),
  cash_variance: numeric().$type<number>(),
  closing_notes: text(),
  cash_sales: numeric().default('0').notNull().$type<number>(),
  card_sales: numeric().default('0').notNull().$type<number>(),
  other_sales: numeric().default('0').notNull().$type<number>(),
  order_count: integer().default(0).notNull(),
  variance_status: text().default('NONE').notNull(),
  variance_reviewed_by: uuid(),
  variance_reviewed_at: timestamp({ withTimezone: true, mode: "date" }),
  variance_review_notes: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  cash_expenses_total: numeric().default('0').notNull().$type<number>(),
  cash_purchases_total: numeric().default('0').notNull().$type<number>(),
}, (table) => [
  uniqueIndex("idx_cashier_shifts_one_active_per_user").using("btree", table.user_id.asc().nullsLast()).where(sql`(status = 'ACTIVE'::text)`),
  index("idx_cashier_shifts_branch_opened_at").using("btree", table.branch_id.asc().nullsLast(), table.opened_at.desc().nullsFirst()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "cashier_shifts_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.closed_by],
      foreignColumns: [users.id],
      name: "cashier_shifts_closed_by_fkey"
    }),
  foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "cashier_shifts_user_id_fkey"
    }),
  foreignKey({
      columns: [table.variance_reviewed_by],
      foreignColumns: [users.id],
      name: "cashier_shifts_variance_reviewed_by_fkey"
    }),
  check("cashier_shifts_status_check", sql`status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text, 'PENDING_REVIEW'::text])`),
  check("cashier_shifts_variance_status_check", sql`variance_status = ANY (ARRAY['NONE'::text, 'PENDING_REVIEW'::text, 'APPROVED'::text, 'ACKNOWLEDGED'::text])`),
]);
