// Drizzle table definitions for the branch-day tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, uuid, integer, numeric, foreignKey, primaryKey } from "drizzle-orm/pg-core";
import { localDate } from "../../../../shared/database/columns";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const branchDays = pgTable("branch_days", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  business_date: localDate().notNull().$type<string>(),
  closed_by: uuid().notNull(),
  closed_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  total_sales: numeric().default('0').notNull().$type<number>(),
  order_count: integer().default(0).notNull(),
  cash_variance_total: numeric().default('0').notNull().$type<number>(),
  manager_notes: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "branch_days_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.closed_by],
      foreignColumns: [users.id],
      name: "branch_days_closed_by_fkey"
    }),
  unique("branch_days_branch_date_unique").on(table.branch_id, table.business_date),
]);
