// Drizzle table definitions for the crm tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, check, uuid, boolean, integer, foreignKey, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const customerFollowups = pgTable("customer_followups", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  legacy_order_id: integer(),
  branch_id: uuid(),
  customer_phone: text().notNull(),
  call_result: text().notNull(),
  satisfaction_rating: text(),
  notes: text(),
  has_complaint: boolean().default(false).notNull(),
  called_by: uuid(),
  called_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  legacy_followup_id: integer(),
  order_id: uuid(),
}, (table) => [
  index("idx_customer_followups_phone").using("btree", table.customer_phone.asc().nullsLast()),
  foreignKey({
      columns: [table.called_by],
      foreignColumns: [users.id],
      name: "customer_followups_called_by_fkey"
    }),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "customer_followups_order_id_fkey"
    }),
  check("customer_followups_call_result_check", sql`call_result = ANY (ARRAY['answered'::text, 'no_answer'::text, 'no_answer_after_3_tries'::text])`),
  check("customer_followups_satisfaction_rating_check", sql`satisfaction_rating = ANY (ARRAY['excellent'::text, 'good'::text, 'average'::text, 'bad'::text])`),
]);

export const complaints = pgTable("complaints", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  channel: text().notNull(),
  legacy_order_id: integer(),
  branch_id: uuid(),
  followup_id: uuid(),
  customer_phone: text().notNull(),
  category: text().notNull(),
  description: text(),
  status: text().default('open').notNull(),
  resolution_notes: text(),
  created_by: uuid(),
  assigned_to: uuid(),
  resolved_by: uuid(),
  resolved_at: timestamp({ withTimezone: true, mode: "date" }),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  legacy_complaint_id: integer(),
  legacy_source: text(),
}, (table) => [
  index("idx_complaints_open").using("btree", table.status.asc().nullsLast()).where(sql`(status <> 'resolved'::text)`),
  index("idx_complaints_phone").using("btree", table.customer_phone.asc().nullsLast()),
  foreignKey({
      columns: [table.assigned_to],
      foreignColumns: [users.id],
      name: "complaints_assigned_to_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "complaints_created_by_fkey"
    }),
  foreignKey({
      columns: [table.followup_id],
      foreignColumns: [customerFollowups.id],
      name: "complaints_followup_id_fkey"
    }),
  foreignKey({
      columns: [table.resolved_by],
      foreignColumns: [users.id],
      name: "complaints_resolved_by_fkey"
    }),
  check("complaints_category_check", sql`category = ANY (ARRAY['late_order'::text, 'wrong_item'::text, 'quality'::text, 'other'::text])`),
  check("complaints_channel_check", sql`channel = ANY (ARRAY['phone_followup'::text, 'whatsapp'::text, 'messenger'::text, 'instagram'::text])`),
  check("complaints_legacy_source_check", sql`legacy_source = ANY (ARRAY['customer_complaints'::text, 'whatsapp_complaints'::text])`),
  check("complaints_status_check", sql`status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text])`),
]);
