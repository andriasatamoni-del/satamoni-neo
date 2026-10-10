// Drizzle table definitions for the home-tiles tables.
// Column keys keep the database's snake_case names, so query rows have the same shape the API has always returned.
// Triggers and functions are not modelled here; they live in the SQL migrations under backend/drizzle/.
import { pgTable, text, timestamp, unique, uuid, integer, primaryKey } from "drizzle-orm/pg-core";

export const homeTiles = pgTable("home_tiles", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  tile_key: text().notNull(),
  href: text().notNull(),
  icon: text().notNull(),
  title: text().notNull(),
  description: text().notNull(),
  display_order: integer().default(0).notNull(),
  created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("home_tiles_tile_key_key").on(table.tile_key),
]);
