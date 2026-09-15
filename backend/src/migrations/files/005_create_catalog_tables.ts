import { Kysely, sql } from "kysely";

// Catalog context - MenuCategory + MenuItem (مع الأحجام كـentities تابعة) + Recipe المُنسّخ. نسخة
// مبسّطة من workflow اعتماد الوصفات في الريبو القديم (DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/ARCHIVED/
// REJECTED) لـ3 حالات بس (DRAFT/ACTIVE/ARCHIVED) - القاعدة الجوهرية (نسخة ACTIVE واحدة بس) محفوظة
// بالكامل، دورة الاعتماد الرسمية (submit/approve/reject) مؤجّلة لسلايس تاني. مفيش أيضًا: المرفقات
// (modifiers)، الكومبوهات، سجل تاريخ الأسعار، wastage/yield percent، sub-recipes، substitute
// ingredients - كل دول موجودين في الريبو القديم كمرجع، هيتضافوا لما فعليًا يحتاجهم Orders/Production.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("menu_categories")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("display_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("menu_group", "text", (col) => col.notNull().defaultTo("regular").check(sql`menu_group IN ('regular','fasting')`))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_category_id", "integer")
    .execute();

  await db.schema
    .createTable("menu_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("category_id", "uuid", (col) => col.references("menu_categories.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("image_url", "text")
    .addColumn("is_best", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_menu_item_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("menu_item_variants")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("item_id", "uuid", (col) => col.notNull().references("menu_items.id").onDelete("cascade"))
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("price", "numeric", (col) => col.notNull())
    .addColumn("talabat_price", "numeric")
    .addColumn("legacy_variant_id", "integer")
    .addUniqueConstraint("menu_item_variants_item_label_unique", ["item_id", "label"])
    .execute();

  await db.schema
    .createTable("recipes")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("recipe_type", "text", (col) => col.notNull().check(sql`recipe_type IN ('sellable_variant','manufactured_item')`))
    .addColumn("variant_id", "uuid", (col) => col.references("menu_item_variants.id").onDelete("cascade").unique())
    .addColumn("inventory_item_id", "uuid", (col) => col.references("inventory_items.id").onDelete("cascade").unique())
    .addColumn("legacy_recipe_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("recipe_versions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("recipe_id", "uuid", (col) => col.notNull().references("recipes.id").onDelete("cascade"))
    .addColumn("version_number", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','ACTIVE','ARCHIVED')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("activated_at", "timestamptz")
    .addColumn("archived_at", "timestamptz")
    .addUniqueConstraint("recipe_versions_recipe_version_unique", ["recipe_id", "version_number"])
    .execute();
  // نسخة واحدة بس ACTIVE لكل وصفة - نفس فلسفة idx_recipe_versions_one_active في الريبو القديم بالظبط
  await db.schema
    .createIndex("idx_recipe_versions_one_active")
    .on("recipe_versions")
    .column("recipe_id")
    .unique()
    .where(sql.ref("status"), "=", "ACTIVE")
    .execute();

  await db.schema
    .createTable("recipe_ingredients")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("recipe_version_id", "uuid", (col) => col.notNull().references("recipe_versions.id").onDelete("cascade"))
    .addColumn("ingredient_item_id", "uuid", (col) => col.notNull().references("inventory_items.id"))
    .addColumn("quantity", "numeric", (col) => col.notNull())
    .addColumn("unit", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("recipe_ingredients").execute();
  await db.schema.dropTable("recipe_versions").execute();
  await db.schema.dropTable("recipes").execute();
  await db.schema.dropTable("menu_item_variants").execute();
  await db.schema.dropTable("menu_items").execute();
  await db.schema.dropTable("menu_categories").execute();
}
