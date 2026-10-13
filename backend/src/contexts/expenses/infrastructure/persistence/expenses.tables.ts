// Drizzle table definitions for the expenses tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, boolean, numeric, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { accounts, journalEntries } from "../../../accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { suppliers } from "../../../procurement/infrastructure/persistence/procurement.tables";

export const expenseCategories = pgTable("expense_categories", {
  id: uuid().primaryKey().notNull(),
  name: text().notNull(),
  is_active: boolean().default(true).notNull(),
  alert_threshold: numeric().$type<number>(),
  account_id: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.account_id],
      foreignColumns: [accounts.id],
      name: "expense_categories_account_id_fkey"
    }),
  unique("expense_categories_name_key").on(table.name),
]);

export const expenses = pgTable("expenses", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  business_date: localDate().notNull(),
  category_id: uuid().notNull(),
  amount: numeric().notNull().$type<number>(),
  notes: text(),
  supplier_id: uuid(),
  status: text().default('SUBMITTED').notNull(),
  created_by: uuid(),
  posted_by: uuid(),
  posted_at: timestamp({ withTimezone: true, mode: "date" }),
  journal_entry_id: uuid(),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  cancellation_reason: text(),
  idempotency_key: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_expenses_branch_date").using("btree", table.branch_id.asc().nullsLast(), table.business_date.asc().nullsLast()),
  index("idx_expenses_status").using("btree", table.status.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "expenses_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "expenses_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.category_id],
      foreignColumns: [expenseCategories.id],
      name: "expenses_category_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "expenses_created_by_fkey"
    }),
  foreignKey({
      columns: [table.journal_entry_id],
      foreignColumns: [journalEntries.id],
      name: "expenses_journal_entry_id_fkey"
    }),
  foreignKey({
      columns: [table.posted_by],
      foreignColumns: [users.id],
      name: "expenses_posted_by_fkey"
    }),
  foreignKey({
      columns: [table.supplier_id],
      foreignColumns: [suppliers.id],
      name: "expenses_supplier_id_fkey"
    }),
  unique("expenses_idempotency_key_key").on(table.idempotency_key),
  check("expenses_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'POSTED'::text, 'CANCELLED'::text])`),
]);
