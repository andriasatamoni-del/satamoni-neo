import { Kysely, sql } from "kysely";

// نسخة (snapshot) من المرفقات المختارة وقت البيع - نفس مفهوم order_item_modifiers في الريبو القديم
// بالظبط: اسم/سعر المرفق وقت البيع مش دلوقتي (لو المرفق اتغيّر بعدين، الطلب القديم يفضل بيعكس اللي
// كان وقتها). modifier_id اختياري (nullable، من غير ON DELETE) عشان لو المرفق اتشال من الصنف بعدين،
// السطر التاريخي يفضل موجود بالاسم/السعر المسجّلين - نفس فلسفة orders.legacy_order_id هنا (مرجع
// تاريخي، مش مصدر الحقيقة للعرض)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("order_item_modifiers")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("order_item_id", "uuid", (col) => col.notNull().references("order_items.id").onDelete("cascade"))
    .addColumn("modifier_id", "uuid")
    .addColumn("name_at_sale", "text", (col) => col.notNull())
    .addColumn("price_at_sale", "numeric", (col) => col.notNull().defaultTo(0))
    // بيسمح بـupsert آمن لما save() يتنادى تاني على طلب موجود (تحديث حالة المطبخ/الطلب بيعيد حفظ الـ
    // aggregate كله - راجع AdvanceKitchenStatusHandler/UpdateOrderStatusHandler) من غير ما يكرر سطور
    // المرفقات في كل مرة. modifier_id مش نص - القيد ده بيحمي الحالة الحقيقية بتاعت الكود دلوقتي بس
    // (كل مرفق مسجّل ليه modifier_id فعلي وقت التسجيل، راجع RegisterOrderHandler)
    .addUniqueConstraint("order_item_modifiers_item_modifier_unique", ["order_item_id", "modifier_id"])
    .execute();
  await db.schema.createIndex("idx_order_item_modifiers_order_item").on("order_item_modifiers").column("order_item_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("order_item_modifiers").execute();
}
