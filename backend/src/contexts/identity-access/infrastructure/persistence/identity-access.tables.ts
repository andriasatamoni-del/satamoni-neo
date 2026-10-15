// Drizzle table definitions for the identity-access tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, jsonb, timestamp, unique, check, uuid, boolean, integer, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ROLES } from "../../domain/role";

// Built from ROLES so the list lives in one place; renders to the same SQL as the baseline constraint.
const rolesSql = (column: string) => sql.raw(`${column} = ANY (ARRAY[${ROLES.map((r) => `'${r}'::text`).join(", ")}])`);

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid(),
  name: text().notNull(),
  email: text().notNull(),
  password_hash: text().notNull(),
  role: text({ enum: ROLES }),
  permission_grants: jsonb().default([]).notNull().$type<string[]>(),
  permission_revokes: jsonb().default([]).notNull().$type<string[]>(),
  pin_hash: text(),
  is_active: boolean().default(true).notNull(),
  legacy_user_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("users_email_key").on(table.email),
  check("users_role_check", rolesSql("role")),
]);

export const permissions = pgTable("permissions", {
  key: text().primaryKey().notNull(),
  group_key: text().notNull(),
  group_label: text().notNull(),
  label: text().notNull(),
  sort_order: integer().notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  role: text({ enum: ROLES }).notNull(),
  permission_key: text().notNull(),
}, (table) => [
  primaryKey({ columns: [table.role, table.permission_key], name: "role_permissions_pkey" }),
  foreignKey({
      columns: [table.permission_key],
      foreignColumns: [permissions.key],
      name: "role_permissions_permission_key_fkey"
    }).onDelete("cascade"),
  check("role_permissions_role_check", rolesSql("role")),
]);

export const userRoles = pgTable("user_roles", {
  user_id: uuid().notNull(),
  role: text({ enum: ROLES }).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.role], name: "user_roles_pkey" }),
  foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "user_roles_user_id_fkey"
    }).onDelete("cascade"),
  check("user_roles_role_check", rolesSql("role")),
]);
