// Drizzle table definitions for the catalog tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, check, uuid, boolean, integer, numeric, foreignKey, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../../../identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { kitchenStations } from "../../../printing/infrastructure/persistence/printing.tables";

export const menuItemVariants = pgTable("menu_item_variants", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  item_id: uuid().notNull(),
  label: text().notNull(),
  price: numeric().notNull().$type<number>(),
  talabat_price: numeric().$type<number>(),
  legacy_variant_id: integer(),
}, (table) => [
  foreignKey({
      columns: [table.item_id],
      foreignColumns: [menuItems.id],
      name: "menu_item_variants_item_id_fkey"
    }).onDelete("cascade"),
  unique("menu_item_variants_item_label_unique").on(table.item_id, table.label),
]);

export const recipes = pgTable("recipes", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  recipe_type: text().notNull(),
  variant_id: uuid(),
  inventory_item_id: uuid(),
  legacy_recipe_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
      columns: [table.inventory_item_id],
      foreignColumns: [inventoryItems.id],
      name: "recipes_inventory_item_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "recipes_variant_id_fkey"
    }).onDelete("cascade"),
  unique("recipes_variant_id_key").on(table.variant_id),
  unique("recipes_inventory_item_id_key").on(table.inventory_item_id),
  check("recipes_recipe_type_check", sql`recipe_type = ANY (ARRAY['sellable_variant'::text, 'manufactured_item'::text])`),
]);

export const recipeVersions = pgTable("recipe_versions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  recipe_id: uuid().notNull(),
  version_number: integer().notNull(),
  status: text().default('DRAFT').notNull(),
  created_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  activated_at: timestamp({ withTimezone: true, mode: "date" }),
  archived_at: timestamp({ withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("idx_recipe_versions_one_active").using("btree", table.recipe_id.asc().nullsLast()).where(sql`(status = 'ACTIVE'::text)`),
  foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: "recipe_versions_created_by_fkey"
    }),
  foreignKey({
      columns: [table.recipe_id],
      foreignColumns: [recipes.id],
      name: "recipe_versions_recipe_id_fkey"
    }).onDelete("cascade"),
  unique("recipe_versions_recipe_version_unique").on(table.recipe_id, table.version_number),
  check("recipe_versions_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'ARCHIVED'::text])`),
]);

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  recipe_version_id: uuid().notNull(),
  ingredient_item_id: uuid().notNull(),
  quantity: numeric().notNull().$type<number>(),
  unit: text(),
}, (table) => [
  foreignKey({
      columns: [table.ingredient_item_id],
      foreignColumns: [inventoryItems.id],
      name: "recipe_ingredients_ingredient_item_id_fkey"
    }),
  foreignKey({
      columns: [table.recipe_version_id],
      foreignColumns: [recipeVersions.id],
      name: "recipe_ingredients_recipe_version_id_fkey"
    }).onDelete("cascade"),
]);

export const menuItems = pgTable("menu_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  category_id: uuid(),
  name: text().notNull(),
  description: text(),
  image_url: text(),
  is_best: boolean().default(false).notNull(),
  is_active: boolean().default(true).notNull(),
  legacy_menu_item_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  station_id: uuid(),
}, (table) => [
  foreignKey({
      columns: [table.category_id],
      foreignColumns: [menuCategories.id],
      name: "menu_items_category_id_fkey"
    }),
  foreignKey({
      columns: [table.station_id],
      foreignColumns: [kitchenStations.id],
      name: "menu_items_station_id_fkey"
    }).onDelete("set null"),
]);

export const menuItemModifiers = pgTable("menu_item_modifiers", {
  id: uuid().primaryKey().notNull(),
  item_id: uuid().notNull(),
  name: text().notNull(),
  price_delta: numeric().default('0').notNull().$type<number>(),
  is_active: boolean().default(true).notNull(),
  legacy_modifier_id: integer(),
}, (table) => [
  foreignKey({
      columns: [table.item_id],
      foreignColumns: [menuItems.id],
      name: "menu_item_modifiers_item_id_fkey"
    }).onDelete("cascade"),
  unique("menu_item_modifiers_item_name_unique").on(table.item_id, table.name),
]);

export const menuItemModifierVariantPrices = pgTable("menu_item_modifier_variant_prices", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  modifier_id: uuid().notNull(),
  variant_id: uuid().notNull(),
  price_delta: numeric().notNull().$type<number>(),
}, (table) => [
  foreignKey({
      columns: [table.modifier_id],
      foreignColumns: [menuItemModifiers.id],
      name: "menu_item_modifier_variant_prices_modifier_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "menu_item_modifier_variant_prices_variant_id_fkey"
    }).onDelete("cascade"),
  unique("menu_item_modifier_variant_prices_unique").on(table.modifier_id, table.variant_id),
]);

export const comboItems = pgTable("combo_items", {
  id: uuid().primaryKey().notNull(),
  combo_id: uuid().notNull(),
  variant_id: uuid().notNull(),
  quantity: integer().default(1).notNull(),
}, (table) => [
  foreignKey({
      columns: [table.combo_id],
      foreignColumns: [combos.id],
      name: "combo_items_combo_id_fkey"
    }).onDelete("cascade"),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "combo_items_variant_id_fkey"
    }),
  unique("uq_combo_items_combo_variant").on(table.combo_id, table.variant_id),
  check("combo_items_quantity_check", sql`quantity > 0`),
]);

export const menuPriceHistory = pgTable("menu_price_history", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  entity_type: text().notNull(),
  entity_id: uuid().notNull(),
  variant_id: uuid(),
  field_name: text().notNull(),
  old_price: numeric().$type<number>(),
  new_price: numeric().$type<number>(),
  changed_by: uuid(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_menu_price_history_entity").using("btree", table.entity_type.asc().nullsLast(), table.entity_id.asc().nullsLast()),
  index("idx_menu_price_history_variant").using("btree", table.variant_id.asc().nullsLast()),
  foreignKey({
      columns: [table.changed_by],
      foreignColumns: [users.id],
      name: "menu_price_history_changed_by_fkey"
    }),
  foreignKey({
      columns: [table.variant_id],
      foreignColumns: [menuItemVariants.id],
      name: "menu_price_history_variant_id_fkey"
    }).onDelete("cascade"),
  check("menu_price_history_entity_type_check", sql`entity_type = ANY (ARRAY['variant'::text, 'modifier'::text, 'modifier_variant_price'::text])`),
]);

export const combos = pgTable("combos", {
  id: uuid().primaryKey().notNull(),
  name: text().notNull(),
  price: numeric().notNull().$type<number>(),
  is_active: boolean().default(true).notNull(),
  legacy_combo_id: integer(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  image_url: text(),
  description: text(),
  online_only: boolean().default(false).notNull(),
}, (table) => [
  unique("combos_name_key").on(table.name),
]);

export const menuCategories = pgTable("menu_categories", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  display_order: integer().default(0).notNull(),
  menu_group: text().default('regular').notNull(),
  is_active: boolean().default(true).notNull(),
  legacy_category_id: integer(),
  station_id: uuid(),
  archived_at: timestamp({ withTimezone: true, mode: "date" }),
}, (table) => [
  index("menu_categories_archived_idx").using("btree", table.archived_at.asc().nullsLast()),
  foreignKey({
      columns: [table.station_id],
      foreignColumns: [kitchenStations.id],
      name: "menu_categories_station_id_fkey"
    }).onDelete("set null"),
  unique("menu_categories_name_key").on(table.name),
  check("menu_categories_menu_group_check", sql`menu_group = ANY (ARRAY['regular'::text, 'fasting'::text])`),
]);

export const catalogLayout = pgTable("catalog_layout", {
  key: text().primaryKey().notNull(),
  value: integer().notNull(),
});
