// Drizzle table definitions for the treasury tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, boolean, foreignKey, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "../../../accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";

export const treasuries = pgTable("treasuries", {
  id: uuid().primaryKey().notNull(),
  name: text().notNull(),
  kind: text().notNull(),
  branch_id: uuid(),
  account_id: uuid().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_treasuries_one_main_per_branch").using("btree", table.branch_id.asc().nullsLast()).where(sql`(kind = 'MAIN'::text)`),
  foreignKey({
      columns: [table.account_id],
      foreignColumns: [accounts.id],
      name: "treasuries_account_id_fkey"
    }),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "treasuries_branch_id_fkey"
    }),
  unique("treasuries_account_id_key").on(table.account_id),
  check("treasuries_kind_check", sql`kind = ANY (ARRAY['MAIN'::text, 'BANK'::text])`),
]);

export const banks = pgTable("banks", {
  id: uuid().primaryKey().notNull(),
  name: text().notNull(),
  is_active: boolean().default(true).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid().primaryKey().notNull(),
  bank_id: uuid().notNull(),
  treasury_id: uuid().notNull(),
  account_number: text(),
  iban: text(),
  bank_branch_name: text(),
  notes: text(),
  is_active: boolean().default(true).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.bank_id],
      foreignColumns: [banks.id],
      name: "bank_accounts_bank_id_fkey"
    }),
  foreignKey({
      columns: [table.treasury_id],
      foreignColumns: [treasuries.id],
      name: "bank_accounts_treasury_id_fkey"
    }),
  unique("bank_accounts_treasury_id_key").on(table.treasury_id),
]);
