import { pgTable, text, jsonb, timestamp, unique, check, uuid, boolean, integer, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ROLE_SCOPES } from "../../domain/role";

const listCheckSql = (column: string, values: readonly string[]) =>
  sql.raw(`${column} = ANY (ARRAY[${values.map((v) => `'${v}'::text`).join(", ")}])`);

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid(),
  name: text().notNull(),
  email: text().notNull(),
  password_hash: text().notNull(),
  role: text(),
  permission_grants: jsonb().default([]).notNull().$type<string[]>(),
  permission_revokes: jsonb().default([]).notNull().$type<string[]>(),
  pin_hash: text(),
  is_active: boolean().default(true).notNull(),
  legacy_user_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("users_email_key").on(table.email),
]);

export const roles = pgTable("roles", {
  key: text().primaryKey().notNull(),
  label: text().notNull(),
  scope: text({ enum: ROLE_SCOPES }).notNull(),
  full_access: boolean().default(false).notNull(),
  sort_order: integer().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("roles_label_key").on(table.label),
  check("roles_scope_check", listCheckSql("scope", ROLE_SCOPES)),
]);

export const permissions = pgTable("permissions", {
  key: text().primaryKey().notNull(),
  group_key: text().notNull(),
  group_label: text().notNull(),
  label: text().notNull(),
  sort_order: integer().notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  role: text().notNull(),
  permission_key: text().notNull(),
}, (table) => [
  primaryKey({ columns: [table.role, table.permission_key], name: "role_permissions_pkey" }),
  foreignKey({
      columns: [table.permission_key],
      foreignColumns: [permissions.key],
      name: "role_permissions_permission_key_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.role],
      foreignColumns: [roles.key],
      name: "role_permissions_role_fkey"
    }).onDelete("cascade"),
]);

export const userRoles = pgTable("user_roles", {
  user_id: uuid().notNull(),
  role: text().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.role], name: "user_roles_pkey" }),
  foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "user_roles_user_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.role],
      foreignColumns: [roles.key],
      name: "user_roles_role_fkey"
    }).onDelete("restrict"),
]);
