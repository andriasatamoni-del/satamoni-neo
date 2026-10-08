import { Kysely, sql } from "kysely";

// A combo ("عرض") order line now carries a SNAPSHOT of what the combo contained at the moment of sale:
// order_items.combo_components = [{ menuItemId, variantId, itemName, variantLabel, quantity }] (quantity per ONE combo).
// The order screen, the kitchen display and the kitchen/prep tickets read it, so the contents shown for an order never change
// when the combo is edited later. Regular lines and old combo lines keep '[]' (the readers then fall back to the live combo).
// Additive and reversible; nothing is rewritten.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE order_items ADD COLUMN combo_components jsonb NOT NULL DEFAULT '[]'::jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE order_items DROP COLUMN IF EXISTS combo_components`.execute(db);
}
