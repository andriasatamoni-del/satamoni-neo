import { Kysely, sql } from "kysely";

// تقييم الطلب (TIER3-3) - نفس مفهوم order_ratings + orders.rating_token في الريبو القديم (routes/
// order-ratings.js + db/migrations/0028_order_ratings_whatsapp.js): توكن عشوائي على كل طلب (مش رقم
// الطلب لوحده) عشان محدش يقدر يشوف/يقيّم طلب مش بتاعه بمجرد تخمين رقم الطلب، وتقييم واحد بس لكل طلب
// (order_id UNIQUE) - إعادة الإرسال بنفس اللينك بتحدّث نفس التقييم مش تنشئ واحد جديد (upsert في
// الـrepository). إرسال رسالة "قيّم طلبك" فعليًا (واتساب/SMS) بعد وصول/تسليم الطلب مؤجّل لحد TIER3-5
// (POS settings) - محتاج إعداد enable/disable زي pos_settings.sms_rating_requests_enabled في الريبو
// القديم، ومفيش context للإعدادات ده لسه.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE orders ADD COLUMN rating_token UUID NOT NULL DEFAULT gen_random_uuid()`.execute(db);

  await db.schema
    .createTable("order_ratings")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_id", "uuid", (col) => col.notNull().unique().references("orders.id").onDelete("cascade"))
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("stars", "integer", (col) => col.notNull().check(sql`stars BETWEEN 1 AND 5`))
    .addColumn("comment", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX idx_order_ratings_branch ON order_ratings (branch_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("order_ratings").execute();
  await sql`ALTER TABLE orders DROP COLUMN rating_token`.execute(db);
}
