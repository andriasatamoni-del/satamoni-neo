// Drizzle table definitions for the inventory tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, pgSequence, text, timestamp, unique, check, uuid, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { localDate } from "../../../../shared/database/columns";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";

export const inventoryBatchNumberSeq = pgSequence("inventory_batch_number_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const inventoryItems = pgTable("inventory_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  unit: text().notNull(),
  unit_cost: numeric().$type<number>(),
  item_type: text().default('raw').notNull(),
  negative_stock_policy: text().default('STRICT').notNull(),
  legacy_inventory_item_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("inventory_items_name_key").on(table.name),
  check("inventory_items_item_type_check", sql`item_type = ANY (ARRAY['raw'::text, 'manufactured'::text])`),
  check("inventory_items_negative_stock_policy_check", sql`negative_stock_policy = ANY (ARRAY['STRICT'::text, 'ALLOW_WITH_APPROVAL'::text])`),
]);

export const stocktakes = pgTable("stocktakes", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  created_by: uuid(),
  notes: text(),
  total_variance_value: numeric().default('0').notNull().$type<number>(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "stocktakes_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "stocktakes_created_by_fkey"
    }),
]);

export const stocktakeLines = pgTable("stocktake_lines", {
  id: uuid().primaryKey().notNull(),
  stocktake_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  system_quantity: numeric().notNull().$type<number>(),
  actual_quantity: numeric().notNull().$type<number>(),
  variance_quantity: numeric().notNull().$type<number>(),
  unit_cost: numeric().$type<number>(),
  variance_value: numeric().$type<number>(),
  reason: text(),
  charge_account_code: text(),
  inventory_movement_id: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_stocktake_lines_stocktake").using("btree", table.stocktake_id.asc().nullsLast()),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "stocktake_lines_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.inventory_movement_id],
      foreignColumns: [stockMovements.id],
      name: "stocktake_lines_inventory_movement_id_fkey"
    }),
  foreignKey({
      columns: [table.stocktake_id],
      foreignColumns: [stocktakes.id],
      name: "stocktake_lines_stocktake_id_fkey"
    }).onDelete("cascade"),
]);

export const transferRequests = pgTable("transfer_requests", {
  id: uuid().primaryKey().notNull(),
  from_branch_id: uuid().notNull(),
  to_branch_id: uuid().notNull(),
  requested_by: uuid(),
  required_date: localDate(),
  notes: text(),
  status: text().default('SUBMITTED').notNull(),
  approved_by: uuid(),
  approved_at: timestamp({ withTimezone: true, mode: "date" }),
  rejected_by: uuid(),
  rejection_reason: text(),
  dispatched_by: uuid(),
  dispatched_at: timestamp({ withTimezone: true, mode: "date" }),
  received_by: uuid(),
  received_at: timestamp({ withTimezone: true, mode: "date" }),
  cancelled_by: uuid(),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  cancellation_reason: text(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_transfer_requests_from_branch").using("btree", table.from_branch_id.asc().nullsLast()),
  index("idx_transfer_requests_required_date").using("btree", table.required_date.asc().nullsLast()),
  index("idx_transfer_requests_to_branch").using("btree", table.to_branch_id.asc().nullsLast()),
  foreignKey({
      columns: [table.approved_by],
      foreignColumns: [users.id],
      name: "transfer_requests_approved_by_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "transfer_requests_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.dispatched_by],
      foreignColumns: [users.id],
      name: "transfer_requests_dispatched_by_fkey"
    }),
  foreignKey({
      columns: [table.from_branch_id],
      foreignColumns: [branches.id],
      name: "transfer_requests_from_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.received_by],
      foreignColumns: [users.id],
      name: "transfer_requests_received_by_fkey"
    }),
  foreignKey({
      columns: [table.rejected_by],
      foreignColumns: [users.id],
      name: "transfer_requests_rejected_by_fkey"
    }),
  foreignKey({
      columns: [table.requested_by],
      foreignColumns: [users.id],
      name: "transfer_requests_requested_by_fkey"
    }),
  foreignKey({
      columns: [table.to_branch_id],
      foreignColumns: [branches.id],
      name: "transfer_requests_to_branch_id_fkey"
    }),
  check("transfer_requests_status_check", sql`status = ANY (ARRAY['SUBMITTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'DISPATCHED'::text, 'RECEIVED'::text, 'CANCELLED'::text])`),
]);

export const transferRequestLines = pgTable("transfer_request_lines", {
  id: uuid().primaryKey().notNull(),
  transfer_request_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  requested_quantity: numeric().notNull().$type<number>(),
  approved_quantity: numeric().$type<number>(),
  dispatched_quantity: numeric().$type<number>(),
  received_quantity: numeric().$type<number>(),
  dispatch_movement_id: uuid(),
  receive_movement_id: uuid(),
}, (table) => [
  index("idx_transfer_request_lines_request").using("btree", table.transfer_request_id.asc().nullsLast()),
  foreignKey({
      columns: [table.dispatch_movement_id],
      foreignColumns: [stockMovements.id],
      name: "transfer_request_lines_dispatch_movement_id_fkey"
    }),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "transfer_request_lines_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.receive_movement_id],
      foreignColumns: [stockMovements.id],
      name: "transfer_request_lines_receive_movement_id_fkey"
    }),
  foreignKey({
      columns: [table.transfer_request_id],
      foreignColumns: [transferRequests.id],
      name: "transfer_request_lines_transfer_request_id_fkey"
    }).onDelete("cascade"),
]);

export const stockMovements = pgTable("stock_movements", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  inventory_item_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  movement_type: text().notNull(),
  quantity_delta: numeric().notNull().$type<number>(),
  reason: text(),
  reference_type: text(),
  reference_id: text(),
  performed_by: uuid(),
  occurred_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  legacy_reference_key: text(),
  unit_cost: numeric().$type<number>(),
  total_cost: numeric().$type<number>(),
}, (table) => [
  index("idx_stock_movements_item_branch").using("btree", table.inventory_item_id.asc().nullsLast(), table.branch_id.asc().nullsLast()),
  index("idx_stock_movements_reference").using("btree", table.reference_type.asc().nullsLast(), table.reference_id.asc().nullsLast()),
  uniqueIndex("uq_stock_movements_business_effect").using("btree", table.reference_type.asc().nullsLast(), table.reference_id.asc().nullsLast(), table.inventory_item_id.asc().nullsLast(), table.movement_type.asc().nullsLast()).where(sql`((reference_id IS NOT NULL) AND (reference_type = ANY (ARRAY['order'::text, 'order_cancellation'::text, 'conversion_order'::text])) AND (occurred_at >= '2026-10-02 00:00:00+00'::timestamp with time zone))`),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "stock_movements_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "stock_movements_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.performed_by],
      foreignColumns: [users.id],
      name: "stock_movements_performed_by_fkey"
    }),
  unique("stock_movements_legacy_reference_key_key").on(table.legacy_reference_key),
  check("stock_movements_movement_type_check", sql`movement_type = ANY (ARRAY['RECEIPT'::text, 'CONSUMPTION'::text, 'ADJUSTMENT'::text, 'TRANSFER_OUT'::text, 'TRANSFER_IN'::text, 'OPENING_BALANCE'::text, 'RETURN_TO_SUPPLIER'::text, 'STOCK_COUNT'::text, 'PRODUCTION_OUT'::text, 'PRODUCTION_IN'::text, 'PRODUCTION_REVERSAL'::text])`),
  check("stock_movements_quantity_delta_check", sql`quantity_delta <> (0)::numeric`),
]);

export const inventoryBatches = pgTable("inventory_batches", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  batch_number: text().notNull(),
  inventory_item_id: uuid().notNull(),
  branch_id: uuid().notNull(),
  received_quantity: numeric().notNull().$type<number>(),
  remaining_quantity: numeric().notNull().$type<number>(),
  unit_cost: numeric().$type<number>(),
  expiry_date: localDate(),
  production_date: localDate(),
  source_type: text().notNull(),
  source_id: uuid().notNull(),
  status: text().default('active').notNull(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_inventory_batches_expiry").using("btree", table.expiry_date.asc().nullsLast()),
  index("idx_inventory_batches_item_branch_status").using("btree", table.inventory_item_id.asc().nullsLast(), table.branch_id.asc().nullsLast(), table.status.asc().nullsLast()),
  index("idx_inventory_batches_source").using("btree", table.source_type.asc().nullsLast(), table.source_id.asc().nullsLast()),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "inventory_batches_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "inventory_batches_created_by_fkey"
    }),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "inventory_batches_inventory_item_id_fkey"
    }),
  unique("inventory_batches_batch_number_key").on(table.batch_number),
  check("inventory_batches_source_type_check", sql`source_type = ANY (ARRAY['purchase'::text, 'production'::text])`),
  check("inventory_batches_status_check", sql`status = ANY (ARRAY['active'::text, 'depleted'::text, 'expired'::text])`),
]);

export const branchStockBalances = pgTable("branch_stock_balances", {
  branch_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  quantity: numeric().default('0').notNull().$type<number>(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "branch_stock_balances_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "branch_stock_balances_inventory_item_id_fkey"
    }),
  primaryKey({ columns: [table.branch_id, table.inventory_item_id], name: "branch_stock_balances_pk"}),
]);

export const branchStockThresholds = pgTable("branch_stock_thresholds", {
  branch_id: uuid().notNull(),
  inventory_item_id: uuid().notNull(),
  reorder_point: numeric().$type<number>(),
  min_stock: numeric().$type<number>(),
  max_stock: numeric().$type<number>(),
  updated_by: uuid(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "branch_stock_thresholds_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "branch_stock_thresholds_inventory_item_id_fkey"
    }),
  foreignKey({
      columns: [table.updated_by],
      foreignColumns: [users.id],
      name: "branch_stock_thresholds_updated_by_fkey"
    }),
  primaryKey({ columns: [table.branch_id, table.inventory_item_id], name: "branch_stock_thresholds_pkey"}),
]);
