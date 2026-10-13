// Drizzle table definitions for the production tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, check, uuid, numeric, foreignKey, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { recipeVersions, recipes } from "../../../catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems, stockMovements } from "../../../inventory/infrastructure/persistence/inventory.tables";

export const conversionOrders = pgTable("conversion_orders", {
  id: uuid().primaryKey().notNull(),
  branch_id: uuid().notNull(),
  recipe_id: uuid().notNull(),
  recipe_version_id: uuid().notNull(),
  output_item_id: uuid().notNull(),
  status: text().default('DRAFT').notNull(),
  planned_output_quantity: numeric().notNull().$type<number>(),
  actual_output_quantity: numeric().$type<number>(),
  output_unit_cost: numeric().$type<number>(),
  output_movement_id: uuid(),
  variance_reason: text(),
  notes: text(),
  created_by: uuid(),
  approved_by: uuid(),
  completed_by: uuid(),
  cancelled_by: uuid(),
  approved_at: timestamp({ withTimezone: true, mode: "date" }),
  started_at: timestamp({ withTimezone: true, mode: "date" }),
  completed_at: timestamp({ withTimezone: true, mode: "date" }),
  cancelled_at: timestamp({ withTimezone: true, mode: "date" }),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.approved_by],
      foreignColumns: [users.id],
      name: "conversion_orders_approved_by_fkey"
    }),
  foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
      name: "conversion_orders_branch_id_fkey"
    }),
  foreignKey({
      columns: [table.cancelled_by],
      foreignColumns: [users.id],
      name: "conversion_orders_cancelled_by_fkey"
    }),
  foreignKey({
      columns: [table.completed_by],
      foreignColumns: [users.id],
      name: "conversion_orders_completed_by_fkey"
    }),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "conversion_orders_created_by_fkey"
    }),
  foreignKey({
      columns: [table.output_item_id],
      foreignColumns: [inventoryItems.id],
      name: "conversion_orders_output_item_id_fkey"
    }),
  foreignKey({
      columns: [table.output_movement_id],
      foreignColumns: [stockMovements.id],
      name: "conversion_orders_output_movement_id_fkey"
    }),
  foreignKey({
      columns: [table.recipe_id],
      foreignColumns: [recipes.id],
      name: "conversion_orders_recipe_id_fkey"
    }),
  foreignKey({
      columns: [table.recipe_version_id],
      foreignColumns: [recipeVersions.id],
      name: "conversion_orders_recipe_version_id_fkey"
    }),
  check("conversion_orders_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])`),
]);

export const conversionOrderInputLines = pgTable("conversion_order_input_lines", {
  id: uuid().primaryKey().notNull(),
  conversion_order_id: uuid().notNull(),
  ingredient_item_id: uuid().notNull(),
  planned_quantity_per_unit: numeric().notNull().$type<number>(),
  planned_quantity: numeric().notNull().$type<number>(),
  actual_quantity: numeric().$type<number>(),
  unit_cost: numeric().$type<number>(),
  movement_id: uuid(),
}, (table) => [
  foreignKey({
      columns: [table.conversion_order_id],
      foreignColumns: [conversionOrders.id],
      name: "conversion_order_input_lines_conversion_order_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.ingredient_item_id],
      foreignColumns: [inventoryItems.id],
      name: "conversion_order_input_lines_ingredient_item_id_fkey"
    }),
  foreignKey({
      columns: [table.movement_id],
      foreignColumns: [stockMovements.id],
      name: "conversion_order_input_lines_movement_id_fkey"
    }),
]);
