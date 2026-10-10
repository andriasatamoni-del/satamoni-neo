// Drizzle table definitions for the talabat tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, jsonb, timestamp, unique, check, uuid, integer, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const talabatOrders = pgTable("talabat_orders", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  talabat_order_id: text().notNull(),
  branch_id: uuid(),
  pos_order_id: uuid(),
  status: text().notNull(),
  raw_payload: jsonb().notNull(),
  error_reason: text(),
  canceled_at: timestamp({ withTimezone: true, mode: "date" }),
  cancellation_source: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_talabat_orders_branch").using("btree", table.branch_id.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "talabat_orders_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.pos_order_id],
      foreignColumns: [orders.id],
      name: "talabat_orders_pos_order_id_fkey"
    }),
  unique("talabat_orders_talabat_order_id_key").on(table.talabat_order_id),
  unique("talabat_orders_pos_order_id_key").on(table.pos_order_id),
  check("talabat_orders_cancellation_source_check", sql`cancellation_source = ANY (ARRAY['TALABAT'::text, 'ORPHAN'::text])`),
  check("talabat_orders_status_check", sql`status = ANY (ARRAY['RECEIVED'::text, 'MAPPING_ERROR'::text, 'IMPORTED'::text, 'FAILED'::text, 'CANCELED'::text])`),
]);

export const talabatProductMapping = pgTable("talabat_product_mapping", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  talabat_item_id: text().notNull(),
  menu_item_id: uuid(),
  variant_id: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "talabat_product_mapping_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.menu_item_id],
      foreignColumns: [menuItems.id],
      name: "talabat_product_mapping_menu_item_id_fkey"
    }),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "talabat_product_mapping_variant_id_fkey"
    }),
  unique("uq_talabat_product_mapping_branch_item").on(table.branch_id, table.talabat_item_id),
]);

export const talabatWebhookEvents = pgTable("talabat_webhook_events", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  dedupe_key: text().notNull(),
  raw_body: jsonb().notNull(),
  received_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("talabat_webhook_events_dedupe_key_key").on(table.dedupe_key),
]);

export const talabatIntegrationErrors = pgTable("talabat_integration_errors", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  stage: text().notNull(),
  talabat_order_id: text(),
  message: text().notNull(),
  context: jsonb(),
  retry_count: integer().default(0).notNull(),
  last_retry_at: timestamp({ withTimezone: true, mode: "date" }),
  status: text().default('OPEN').notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_talabat_integration_errors_status").using("btree", table.status.asc().nullsLast()),
  check("talabat_integration_errors_stage_check", sql`stage = ANY (ARRAY['WEBHOOK'::text, 'SYNC'::text, 'CANCELLATION'::text])`),
  check("talabat_integration_errors_status_check", sql`status = ANY (ARRAY['OPEN'::text, 'RETRYING'::text, 'RESOLVED'::text])`),
]);
