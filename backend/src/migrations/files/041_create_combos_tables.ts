import { Kysely, sql } from "kysely";

// Combo/ComboItem - نفس مفهوم combos+combo_items في الريبو القديم: عرض أكتر من صنف (حجم) بسعر واحد
// مختلف عن مجموع أسعار الأصناف. order_items بيحمل combo_id بدل menu_item_id/variant_id لما السطر
// عرض - نفس تصميم الريبو القديم بالظبط (عمود واحد إما للصنف أو للعرض، مش الاتنين مع بعض)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("combos")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("price", "numeric", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_combo_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("combo_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("combo_id", "uuid", (col) => col.notNull().references("combos.id").onDelete("cascade"))
    .addColumn("variant_id", "uuid", (col) => col.notNull().references("menu_item_variants.id"))
    .addColumn("quantity", "integer", (col) => col.notNull().defaultTo(1).check(sql`quantity > 0`))
    .addUniqueConstraint("uq_combo_items_combo_variant", ["combo_id", "variant_id"])
    .execute();

  // order_items: عمود combo_id جديد + menu_item_id/variant_id بقوا اختياريين (سطر عرض ملوش صنف/حجم
  // مباشر) - وCHECK بيتأكد إن كل سطر إما صنف عادي (menu_item_id+variant_id) أو عرض (combo_id)، مش
  // الاتنين ومش من غيرهم خالص
  await db.schema.alterTable("order_items").alterColumn("menu_item_id", (col) => col.dropNotNull()).execute();
  await db.schema.alterTable("order_items").alterColumn("variant_id", (col) => col.dropNotNull()).execute();
  await db.schema
    .alterTable("order_items")
    .addColumn("combo_id", "uuid", (col) => col.references("combos.id"))
    .execute();
  await db.schema
    .alterTable("order_items")
    .addCheckConstraint(
      "chk_order_items_item_xor_combo",
      sql`(combo_id IS NOT NULL AND menu_item_id IS NULL AND variant_id IS NULL) OR (combo_id IS NULL AND menu_item_id IS NOT NULL AND variant_id IS NOT NULL)`
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("order_items").dropConstraint("chk_order_items_item_xor_combo").execute();
  await db.schema.alterTable("order_items").dropColumn("combo_id").execute();
  await db.schema.alterTable("order_items").alterColumn("variant_id", (col) => col.setNotNull()).execute();
  await db.schema.alterTable("order_items").alterColumn("menu_item_id", (col) => col.setNotNull()).execute();
  await db.schema.dropTable("combo_items").execute();
  await db.schema.dropTable("combos").execute();
}
