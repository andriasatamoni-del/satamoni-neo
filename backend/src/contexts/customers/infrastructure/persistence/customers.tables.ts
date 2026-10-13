// Drizzle table definitions for the customers tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, boolean, integer, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const customerAddresses = pgTable("customer_addresses", {
  id: uuid().primaryKey().notNull(),
  customer_id: uuid().notNull(),
  label: text(),
  address_details: text().notNull(),
  distinguishing_mark: text(),
  is_default: boolean().default(false).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  area: text(),
  street: text(),
  building: text(),
  floor: text(),
  apartment: text(),
}, (table) => [
  index("idx_customer_addresses_customer").using("btree", table.customer_id.asc().nullsLast()),
  foreignKey({
      columns: [table.customer_id],
      foreignColumns: [customers.id],
      name: "customer_addresses_customer_id_fkey"
    }).onDelete("cascade"),
]);

export const customers = pgTable("customers", {
  id: uuid().primaryKey().notNull(),
  phone: text().notNull(),
  phone2: text(),
  name: text(),
  address_details: text(),
  distinguishing_mark: text(),
  notes: text(),
  loyalty_points: integer().default(0).notNull(),
  password_hash: text(),
  is_blocked: boolean().default(false).notNull(),
  block_reason: text(),
  blocked_by: uuid(),
  blocked_at: timestamp({ withTimezone: true, mode: "date" }),
  legacy_customer_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  email: text(),
}, (table) => [
  uniqueIndex("customers_email_key").using("btree", sql`lower(email)`).where(sql`(email IS NOT NULL)`),
  foreignKey({
      columns: [table.blocked_by],
      foreignColumns: [users.id],
      name: "customers_blocked_by_fkey"
    }),
  unique("customers_phone_key").on(table.phone),
  check("customers_loyalty_points_non_negative", sql`loyalty_points >= 0`),
]);
