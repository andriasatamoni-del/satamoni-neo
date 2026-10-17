// Drizzle table definitions for the accounting tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, pgSequence, text, timestamp, unique, check, uuid, boolean, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const journalEntryNumberSeq = pgSequence("journal_entry_number_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const accounts = pgTable("accounts", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  code: text().notNull(),
  name: text().notNull(),
  account_type: text().notNull(),
  parent_account_id: uuid(),
  branch_id: uuid(),
  is_active: boolean().default(true).notNull(),
  is_system_account: boolean().default(false).notNull(),
  legacy_account_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "accounts_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.parent_account_id],
      foreignColumns: [table.id],
      name: "accounts_parent_account_id_fkey"
    }),
  unique("accounts_code_key").on(table.code),
  check("accounts_account_type_check", sql`account_type = ANY (ARRAY['ASSET'::text, 'LIABILITY'::text, 'EQUITY'::text, 'REVENUE'::text, 'COGS'::text, 'EXPENSE'::text])`),
]);

export const journalEntryLines = pgTable("journal_entry_lines", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  journal_entry_id: uuid().notNull(),
  account_id: uuid().notNull(),
  debit: numeric().default('0').notNull().$type<number>(),
  credit: numeric().default('0').notNull().$type<number>(),
  description: text(),
  reference_type: text(),
  reference_id: text(),
}, (table) => [
  index("idx_journal_entry_lines_account").using("btree", table.account_id.asc().nullsLast()),
  index("idx_journal_entry_lines_entry").using("btree", table.journal_entry_id.asc().nullsLast()),
  foreignKey({
      columns: [table.account_id],
      foreignColumns: [accounts.id],
      name: "journal_entry_lines_account_id_fkey"
    }),
  foreignKey({
      columns: [table.journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "journal_entry_lines_journal_entry_id_fkey"
    }).onDelete("cascade"),
  check("journal_entry_lines_credit_check", sql`credit >= (0)::numeric`),
  check("journal_entry_lines_debit_check", sql`debit >= (0)::numeric`),
  check("journal_entry_lines_not_both_check", sql`NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))`),
]);

export const accountingPeriods = pgTable("accounting_periods", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  year: integer().notNull(),
  month: integer().notNull(),
  status: text().default('OPEN').notNull(),
  closed_by: uuid(),
  closed_at: timestamp({ withTimezone: true, mode: "date" }),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.closed_by],
      foreignColumns: [users.id],
      name: "accounting_periods_closed_by_fkey"
    }),
  unique("accounting_periods_year_month_unique").on(table.year, table.month),
  check("accounting_periods_status_check", sql`status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])`),
]);

export const fiscalYearClosings = pgTable("fiscal_year_closings", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  year: integer().notNull(),
  net_income: numeric().default('0').notNull().$type<number>(),
  closed_by: uuid(),
  closed_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  journal_entry_id: uuid().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.closed_by],
      foreignColumns: [users.id],
      name: "fiscal_year_closings_closed_by_fkey"
    }),
  foreignKey({
      columns: [table.journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "fiscal_year_closings_journal_entry_id_fkey"
    }),
  unique("fiscal_year_closings_year_key").on(table.year),
]);

export const journalEntries = pgTable("journal_entries", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  entry_number: text(),
  entry_date: localDate().notNull(),
  description: text(),
  source_type: text().notNull(),
  source_id: text(),
  branch_id: uuid(),
  status: text().default('POSTED').notNull(),
  created_by: uuid(),
  posted_at: timestamp({ withTimezone: true, mode: "date" }),
  reversed_at: timestamp({ withTimezone: true, mode: "date" }),
  reversal_of_entry_id: uuid(),
  reversal_reason: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  posted_by: uuid(),
}, (table) => [
  index("idx_journal_entries_branch_date").using("btree", table.branch_id.asc().nullsLast(), table.entry_date.asc().nullsLast()),
  index("idx_journal_entries_created_at").using("btree", table.created_at.desc().nullsFirst()),
  index("idx_journal_entries_entry_date").using("btree", table.entry_date.asc().nullsLast()),
  index("idx_journal_entries_source").using("btree", table.source_type.asc().nullsLast(), table.source_id.asc().nullsLast()),
  uniqueIndex("uq_journal_entries_auto_source").using("btree", table.source_type.asc().nullsLast(), table.source_id.asc().nullsLast()).where(sql`((source_id IS NOT NULL) AND (source_type = ANY (ARRAY['order_sale'::text, 'order_cogs'::text, 'goods_receipt'::text, 'payroll_run'::text, 'payment_adjustment'::text, 'purchase'::text, 'cash_drawer_entry'::text, 'shift_variance'::text, 'driver_settlement'::text, 'driver_attendance_shift'::text, 'conversion_order'::text, 'stock_count'::text, 'supplier_invoice_variance'::text])) AND (created_at >= '2026-10-02 00:00:00+00'::timestamp with time zone))`),
  uniqueIndex("uq_journal_entries_single_reversal").using("btree", table.reversal_of_entry_id.asc().nullsLast()).where(sql`((reversal_of_entry_id IS NOT NULL) AND (created_at >= '2026-10-02 00:00:00+00'::timestamp with time zone))`),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "journal_entries_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "journal_entries_created_by_fkey"
    }),
  foreignKey({
      columns: [table.posted_by],
      foreignColumns: [users.id],
      name: "journal_entries_posted_by_fkey"
    }),
  foreignKey({
      columns: [table.reversal_of_entry_id],
      foreignColumns: [table.id],
      name: "journal_entries_reversal_of_entry_id_fkey"
    }),
  unique("journal_entries_entry_number_key").on(table.entry_number),
  check("journal_entries_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'REVERSED'::text])`),
]);
