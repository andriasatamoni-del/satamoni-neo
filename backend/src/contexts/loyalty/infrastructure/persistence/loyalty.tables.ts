// Drizzle table definitions for the loyalty tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, check, uuid, boolean, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { combos, menuItemVariants } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { customers } from "../../../customers/infrastructure/persistence/customers.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: uuid().primaryKey().notNull(),
  name: text().notNull(),
  description: text(),
  image_url: text(),
  points_cost: integer().notNull(),
  kind: text().notNull(),
  discount_amount: numeric().$type<number>(),
  variant_id: uuid(),
  combo_id: uuid(),
  is_active: boolean().default(true).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.combo_id],
      foreignColumns: [combos.id],
      name: "loyalty_rewards_combo_id_fkey"
    }).onDelete("restrict"),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "loyalty_rewards_variant_id_fkey"
    }).onDelete("restrict"),
  check("loyalty_rewards_kind_check", sql`kind = ANY (ARRAY['discount'::text, 'free_item'::text, 'free_combo'::text])`),
  check("loyalty_rewards_kind_target", sql`((kind = 'discount'::text) AND (discount_amount > (0)::numeric) AND (variant_id IS NULL) AND (combo_id IS NULL)) OR ((kind = 'free_item'::text) AND (variant_id IS NOT NULL) AND (combo_id IS NULL) AND (discount_amount IS NULL)) OR ((kind = 'free_combo'::text) AND (combo_id IS NOT NULL) AND (variant_id IS NULL) AND (discount_amount IS NULL))`),
  check("loyalty_rewards_points_cost_check", sql`points_cost > 0`),
]);

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  customer_id: uuid().notNull(),
  order_id: uuid(),
  request_id: uuid(),
  kind: text().notNull(),
  points: integer().notNull(),
  reward_id: uuid(),
  note: text(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("loyalty_transactions_customer_idx").using("btree", table.customer_id.asc().nullsLast(), table.created_at.desc().nullsFirst()),
  uniqueIndex("loyalty_transactions_order_kind_key").using("btree", table.order_id.asc().nullsLast(), table.kind.asc().nullsLast()).where(sql`((order_id IS NOT NULL) AND (kind <> 'adjust'::text))`),
  uniqueIndex("loyalty_transactions_request_key").using("btree", table.request_id.asc().nullsLast()).where(sql`(request_id IS NOT NULL)`),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "loyalty_transactions_created_by_fkey"
    }).onDelete("set null"),
  foreignKey({
      columns: [table.customer_id],
      foreignColumns: [customers.id],
      name: "loyalty_transactions_customer_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "loyalty_transactions_order_id_fkey"
    }).onDelete("set null"),
  foreignKey({
      columns: [table.reward_id],
      foreignColumns: [loyaltyRewards.id],
      name: "loyalty_transactions_reward_id_fkey"
    }).onDelete("set null"),
  check("loyalty_transactions_kind_check", sql`kind = ANY (ARRAY['earn'::text, 'redeem'::text, 'reverse_earn'::text, 'refund_redeem'::text, 'adjust'::text])`),
]);
