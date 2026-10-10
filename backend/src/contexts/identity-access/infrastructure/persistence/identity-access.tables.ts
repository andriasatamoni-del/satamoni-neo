// Drizzle table definitions for the identity-access tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, jsonb, timestamp, unique, check, uuid, boolean, integer, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid(),
  name: text().notNull(),
  email: text().notNull(),
  password_hash: text().notNull(),
  role: text().notNull(),
  permission_grants: jsonb().default([]).notNull().$type<string[]>(),
  permission_revokes: jsonb().default([]).notNull().$type<string[]>(),
  pin_hash: text(),
  is_active: boolean().default(true).notNull(),
  legacy_user_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("users_email_key").on(table.email),
  check("users_role_check", sql`role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'accountant'::text, 'cashier'::text, 'callcenter'::text, 'driver'::text, 'employee'::text])`),
]);
