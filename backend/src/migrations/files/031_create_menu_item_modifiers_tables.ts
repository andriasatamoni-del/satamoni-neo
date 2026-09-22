import { Kysely, sql } from "kysely";

// مرفقات الصنف (modifiers) - نفس مفهوم menu_item_modifiers/menu_item_modifier_variant_prices في
// الريبو القديم بالظبط: إضافة/استبعاد اختيارية بسعر (زي "إضافة جبنة" أو "بدون طماطم")، ممكن يكون
// ليها سعر مخصوص على حجم معيّن (يغلب priceDelta الافتراضي، راجع MenuItem.resolveModifierPrice).
// مؤجّل عمدًا من السلايس ده: ربط المرفق باستبعاد مكوّن من الوصفة (excluded_ingredient_item_id في
// الريبو القديم) - ده بيأثر على حساب المخزون/التكلفة وقت البيع، أعقد من مجرد سعر إضافي على الفاتورة
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("menu_item_modifiers")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("item_id", "uuid", (col) => col.notNull().references("menu_items.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("price_delta", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_modifier_id", "integer")
    .addUniqueConstraint("menu_item_modifiers_item_name_unique", ["item_id", "name"])
    .execute();

  await db.schema
    .createTable("menu_item_modifier_variant_prices")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("modifier_id", "uuid", (col) => col.notNull().references("menu_item_modifiers.id").onDelete("cascade"))
    .addColumn("variant_id", "uuid", (col) => col.notNull().references("menu_item_variants.id").onDelete("cascade"))
    .addColumn("price_delta", "numeric", (col) => col.notNull())
    .addUniqueConstraint("menu_item_modifier_variant_prices_unique", ["modifier_id", "variant_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("menu_item_modifier_variant_prices").execute();
  await db.schema.dropTable("menu_item_modifiers").execute();
}
