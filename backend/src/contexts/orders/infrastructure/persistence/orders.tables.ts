import { pgTable, text, timestamp, unique, check, uuid, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { combos, menuItemVariants, menuItems } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { customers } from "../../../customers/infrastructure/persistence/customers.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { paymentMethods } from "../../../payment-control/infrastructure/persistence/payment-control.tables";

export const orderRatings = pgTable("order_ratings", {
  id: uuid().primaryKey().notNull(),
  order_id: uuid().notNull(),
  branch_id: uuid(),
  stars: integer().notNull(),
  comment: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_order_ratings_branch").using("btree", table.branch_id.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "order_ratings_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "order_ratings_order_id_fkey"
    }).onDelete("cascade"),
  unique("order_ratings_order_id_key").on(table.order_id),
  check("order_ratings_stars_check", sql`(stars >= 1) AND (stars <= 5)`),
]);

export const orderItemModifiers = pgTable("order_item_modifiers", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  order_item_id: uuid().notNull(),
  modifier_id: uuid(),
  name_at_sale: text().notNull(),
  price_at_sale: numeric().default('0').notNull().$type<number>(),
}, (table) => [
  index("idx_order_item_modifiers_order_item").using("btree", table.order_item_id.asc().nullsLast()),
  foreignKey({
      columns: [table.order_item_id],
      foreignColumns: [orderItems.id],
      name: "order_item_modifiers_order_item_id_fkey"
    }).onDelete("cascade"),
  unique("order_item_modifiers_item_modifier_unique").on(table.order_item_id, table.modifier_id),
]);

export const orderItems = pgTable("order_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  order_id: uuid().notNull(),
  menu_item_id: uuid(),
  variant_id: uuid(),
  quantity: integer().notNull(),
  unit_price: numeric().notNull().$type<number>(),
  line_total: numeric().notNull().$type<number>(),
  combo_id: uuid(),
}, (table) => [
  index("idx_order_items_order").using("btree", table.order_id.asc().nullsLast()),
  foreignKey({
      columns: [table.combo_id],
      foreignColumns: [combos.id],
      name: "order_items_combo_id_fkey"
    }),
  foreignKey({
      columns: [table.menu_item_id],
      foreignColumns: [menuItems.id],
      name: "order_items_menu_item_id_fkey"
    }),
  foreignKey({
      columns: [table.order_id],
      foreignColumns: [orders.id],
      name: "order_items_order_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "order_items_variant_id_fkey"
    }),
  check("chk_order_items_item_xor_combo", sql`((combo_id IS NOT NULL) AND (menu_item_id IS NULL) AND (variant_id IS NULL)) OR ((combo_id IS NULL) AND (menu_item_id IS NOT NULL) AND (variant_id IS NOT NULL))`),
  check("order_items_quantity_check", sql`(quantity > 0) AND (quantity <= 10000)`),
]);

export const orders = pgTable("orders", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  order_type: text().notNull(),
  table_number: text(),
  customer_name: text(),
  customer_phone: text(),
  address_details: text(),
  subtotal: numeric().default('0').notNull().$type<number>(),
  discount: numeric().default('0').notNull().$type<number>(),
  total: numeric().default('0').notNull().$type<number>(),
  status: text().default('preparing').notNull(),
  kitchen_status: text().default('NEW').notNull(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  legacy_order_id: integer(),
  payment_method_id: uuid(),
  kitchen_accepted_at: timestamp({ withTimezone: true, mode: "date" }),
  kitchen_ready_at: timestamp({ withTimezone: true, mode: "date" }),
  rating_token: uuid().defaultRandom().notNull(),
  client_request_id: uuid(),
  source: text().default('pos').notNull(),
  customer_notes: text(),
  customer_id: uuid(),
}, (table) => [
  index("idx_orders_branch_created_at").using("btree", table.branch_id.asc().nullsLast(), table.created_at.asc().nullsLast()),
  index("idx_orders_created_at").using("btree", table.created_at.desc().nullsFirst()),
  index("idx_orders_status_created_at").using("btree", table.status.asc().nullsLast(), table.created_at.desc().nullsFirst()),
  uniqueIndex("orders_client_request_id_unique").using("btree", table.client_request_id.asc().nullsLast()).where(sql`(client_request_id IS NOT NULL)`),
  index("orders_customer_id_idx").using("btree", table.customer_id.asc().nullsLast(), table.created_at.desc().nullsFirst()).where(sql`(customer_id IS NOT NULL)`),
  foreignKey({
      columns: [table.customer_id],
      foreignColumns: [customers.id],
      name: "orders_customer_id_fkey"
    }).onDelete("set null"),
  index("orders_customer_phone_idx").using("btree", table.customer_phone.asc().nullsLast(), table.created_at.desc().nullsFirst()).where(sql`(customer_phone IS NOT NULL)`),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "orders_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "orders_created_by_fkey"
    }),
  foreignKey({
      columns: [table.payment_method_id],
      foreignColumns: [paymentMethods.id],
      name: "orders_payment_method_id_fkey"
    }),
  check("orders_kitchen_status_check", sql`kitchen_status = ANY (ARRAY['NEW'::text, 'ACCEPTED'::text, 'PREPARING'::text, 'READY'::text])`),
  check("orders_order_type_check", sql`order_type = ANY (ARRAY['dinein'::text, 'takeaway'::text, 'delivery'::text])`),
  check("orders_source_check", sql`source = ANY (ARRAY['pos'::text, 'website'::text, 'whatsapp'::text, 'talabat'::text])`),
  check("orders_status_check", sql`status = ANY (ARRAY['preparing'::text, 'out_for_delivery'::text, 'completed'::text, 'cancelled'::text])`),
]);
