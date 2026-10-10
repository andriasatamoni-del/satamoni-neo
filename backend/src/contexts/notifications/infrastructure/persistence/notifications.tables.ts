// Drizzle table definitions for the notifications tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const orderNotifications = pgTable("order_notifications", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  order_id: uuid().notNull(),
  kind: text().notNull(),
  channel: text().notNull(),
  recipient: text().notNull(),
  message: text().notNull(),
  status: text().notNull(),
  error: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("order_notifications_created_at_idx").using("btree", table.created_at.asc().nullsLast()),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "order_notifications_order_id_fkey"
    }).onDelete("cascade"),
  unique("order_notifications_order_kind_key").on(table.order_id, table.kind),
  check("order_notifications_channel_check", sql`channel = 'sms'::text`),
  check("order_notifications_kind_check", sql`kind = ANY (ARRAY['confirmation'::text, 'rating_request'::text])`),
  check("order_notifications_status_check", sql`status = ANY (ARRAY['sent'::text, 'failed'::text, 'not_configured'::text])`),
]);
