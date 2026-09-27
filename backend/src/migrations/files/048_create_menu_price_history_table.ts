import { Kysely, sql } from "kysely";

// سجل تاريخ تغيير أسعار المنيو - نفس نمط employee_history بالظبط (field_name عام، old/new، مين غيّر
// وامتى)، ونفس مفهوم menu_price_history بالريبو القديم بالحرف (راجع db/menu-price-history.js وschema.sql
// هناك). entity_id بيشاور على menu_item_variants.id أو menu_item_modifiers.id حسب entity_type - من غير
// FK صريح لأنه بيشاور على جداول مختلفة حسب النوع (زي audit_logs.entity_id). variant_id بس بيتاخد قيمة
// لصفوف modifier_variant_price (السعر المخصوص لمرفق على حجم معيّن).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("menu_price_history")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("entity_type", "text", (col) =>
      col.notNull().check(sql`entity_type IN ('variant', 'modifier', 'modifier_variant_price')`)
    )
    .addColumn("entity_id", "uuid", (col) => col.notNull())
    .addColumn("variant_id", "uuid", (col) => col.references("menu_item_variants.id").onDelete("cascade"))
    .addColumn("field_name", "text", (col) => col.notNull())
    .addColumn("old_price", "numeric")
    .addColumn("new_price", "numeric")
    .addColumn("changed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_menu_price_history_entity").on("menu_price_history").columns(["entity_type", "entity_id"]).execute();
  await db.schema.createIndex("idx_menu_price_history_variant").on("menu_price_history").column("variant_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("menu_price_history").execute();
}
