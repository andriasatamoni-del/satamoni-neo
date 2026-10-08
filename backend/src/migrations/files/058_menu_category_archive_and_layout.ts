import { Kysely, sql } from "kysely";

// POS category groups: archive a category (instead of deleting it) and a user-defined display order that also places
// the "العروض" (combos) tab among the categories.
//  * menu_categories.archived_at - an archived category is hidden from the POS, the storefront, the bot and the settings list
//    (archiving also pauses it: is_active = false, which every reader already filters on). Items, orders and reports that
//    reference it are untouched; it can be restored from the settings screen.
//  * catalog_layout - tiny key/value table owned by the catalog context. Key "combos_position" is where the combos tab sits in the
//    category order (no row = first, which is where the offers were shown before).
// Additive and reversible; nothing is deleted or rewritten.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE menu_categories ADD COLUMN archived_at timestamptz`.execute(db);
  await sql`CREATE INDEX menu_categories_archived_idx ON menu_categories (archived_at)`.execute(db);
  await sql`CREATE TABLE catalog_layout (
    key text PRIMARY KEY,
    value integer NOT NULL
  )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS catalog_layout`.execute(db);
  await sql`DROP INDEX IF EXISTS menu_categories_archived_idx`.execute(db);
  await sql`ALTER TABLE menu_categories DROP COLUMN IF EXISTS archived_at`.execute(db);
}
