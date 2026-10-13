// Drizzle table definitions for the branches tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, uuid, boolean, integer, numeric, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";

export const branches = pgTable("branches", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  address: text(),
  phone: text(),
  hours: text(),
  lat: numeric().$type<number>(),
  lng: numeric().$type<number>(),
  is_central_kitchen: boolean().default(false).notNull(),
  supports_dine_in: boolean().default(true).notNull(),
  legacy_branch_id: integer(),
  talabat_branch_id: text(),
}, (table) => [
  uniqueIndex("idx_branches_talabat_branch_id").using("btree", table.talabat_branch_id.asc().nullsLast()),
]);
