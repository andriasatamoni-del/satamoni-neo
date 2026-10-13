// Drizzle table definitions for the whatsapp tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, jsonb, timestamp, unique, check, uuid, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { menuItemVariants } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: uuid().primaryKey().notNull(),
  conversation_id: uuid().notNull(),
  direction: text().notNull(),
  body: text().notNull(),
  wa_message_id: text(),
  sent_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_whatsapp_messages_conversation").using("btree", table.conversation_id.asc().nullsLast(), table.created_at.asc().nullsLast()),
  foreignKey({
      columns: [table.conversation_id],
      foreignColumns: [whatsappConversations.id],
      name: "whatsapp_messages_conversation_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.sent_by],
      foreignColumns: [users.id],
      name: "whatsapp_messages_sent_by_fkey"
    }),
  check("whatsapp_messages_direction_check", sql`direction = ANY (ARRAY['in'::text, 'out'::text])`),
]);

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: uuid().primaryKey().notNull(),
  phone: text().notNull(),
  customer_name: text(),
  last_message_at: timestamp({ withTimezone: true, mode: "date" }),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  channel: text().default('whatsapp').notNull(),
}, (table) => [
  unique("whatsapp_conversations_channel_phone_key").on(table.channel, table.phone),
  check("whatsapp_conversations_channel_check", sql`channel = ANY (ARRAY['whatsapp'::text, 'messenger'::text, 'instagram'::text])`),
]);

export const whatsappPendingOrders = pgTable("whatsapp_pending_orders", {
  id: uuid().primaryKey().notNull(),
  conversation_id: uuid().notNull(),
  customer_phone: text().notNull(),
  customer_name: text(),
  order_type: text().notNull(),
  branch_id: uuid(),
  address_details: text(),
  total: numeric().notNull().$type<number>(),
  status: text().default('PENDING').notNull(),
  rejection_reason: text(),
  reviewed_by: uuid(),
  reviewed_at: timestamp({ withTimezone: true, mode: "date" }),
  confirmed_order_id: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_pending_orders_one_draft_per_conversation").using("btree", table.conversation_id.asc().nullsLast()).where(sql`(status = 'DRAFT'::text)`),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "whatsapp_pending_orders_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.confirmed_order_id],
      foreignColumns: [orders.id],
      name: "whatsapp_pending_orders_confirmed_order_id_fkey"
    }),
  foreignKey({
      columns: [table.conversation_id],
      foreignColumns: [whatsappConversations.id],
      name: "whatsapp_pending_orders_conversation_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.reviewed_by],
      foreignColumns: [users.id],
      name: "whatsapp_pending_orders_reviewed_by_fkey"
    }),
  check("whatsapp_pending_orders_branch_required", sql`(status = 'DRAFT'::text) OR (branch_id IS NOT NULL)`),
  check("whatsapp_pending_orders_order_type_check", sql`order_type = ANY (ARRAY['dinein'::text, 'takeaway'::text, 'delivery'::text])`),
  check("whatsapp_pending_orders_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'PENDING'::text, 'CONFIRMED'::text, 'REJECTED'::text])`),
]);

export const whatsappPendingOrderLines = pgTable("whatsapp_pending_order_lines", {
  id: uuid().primaryKey().notNull(),
  pending_order_id: uuid().notNull(),
  variant_id: uuid().notNull(),
  item_name: text().notNull(),
  quantity: numeric().notNull().$type<number>(),
  unit_price: numeric().notNull().$type<number>(),
  modifier_ids: jsonb().default([]).notNull().$type<string[]>(),
}, (table) => [
  foreignKey({
      columns: [table.pending_order_id],
      foreignColumns: [whatsappPendingOrders.id],
      name: "whatsapp_pending_order_lines_pending_order_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "whatsapp_pending_order_lines_variant_id_fkey"
    }),
]);
