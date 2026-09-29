import { Kysely, sql } from "kysely";

// CHAN-1: رسايل العميل التلقائية (نفس db/order-notifications.js + order_notifications في الريبو القديم):
// تأكيد الطلب وقت التسجيل، وطلب تقييم بعد ما يوصل العميل. كل محاولة (نجحت/فشلت/مفيش بوابة) بتتسجل
// append-only للمراجعة. unique (order_id, kind): نفس الرسالة عمرها ما بتتبعت مرتين لنفس الطلب.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("order_notifications")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("order_id", "uuid", (col) => col.notNull().references("orders.id").onDelete("cascade"))
    .addColumn("kind", "text", (col) => col.notNull().check(sql`kind IN ('confirmation','rating_request')`))
    .addColumn("channel", "text", (col) => col.notNull().check(sql`channel IN ('sms')`))
    .addColumn("recipient", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().check(sql`status IN ('sent','failed','not_configured')`))
    .addColumn("error", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("order_notifications_order_kind_key", ["order_id", "kind"])
    .execute();
  await db.schema.createIndex("order_notifications_created_at_idx").on("order_notifications").column("created_at").execute();

  await sql`ALTER TABLE pos_settings ADD COLUMN sms_confirmations_enabled boolean NOT NULL DEFAULT false`.execute(db);
  await sql`ALTER TABLE pos_settings ADD COLUMN sms_rating_requests_enabled boolean NOT NULL DEFAULT false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pos_settings DROP COLUMN sms_rating_requests_enabled`.execute(db);
  await sql`ALTER TABLE pos_settings DROP COLUMN sms_confirmations_enabled`.execute(db);
  await db.schema.dropTable("order_notifications").execute();
}
