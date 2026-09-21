import { Kysely, sql } from "kysely";

// إعدادات النظام (TIER3-5) - نفس مفهوم pos_settings في الريبو القديم: صف واحد ثابت (id=1) بيحل محل
// القيم اللي كانت متثبّتة في كود contexts تانية (shifts, delivery, payment-control, production).
// الصف بيتنشئ lazily أول ما حد يقرأ الإعدادات (راجع KyselyPosSettingsRepository.get) مش هنا في
// الـmigration، عشان التطبيق يفضل شغال حتى لو حد شغّل migration من غير سيرفر يشتغل بعدها فورًا.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("pos_settings")
    .addColumn("id", "integer", (col) => col.primaryKey().check(sql`id = 1`))
    .addColumn("shift_variance_ack_threshold_egp", "numeric", (col) => col.notNull().defaultTo(20))
    .addColumn("driver_settlement_variance_ack_threshold_egp", "numeric", (col) => col.notNull().defaultTo(30))
    .addColumn("driver_hourly_rate_egp", "numeric", (col) => col.notNull().defaultTo(33))
    .addColumn("payment_adjustment_high_threshold_egp", "numeric", (col) => col.notNull().defaultTo(500))
    .addColumn("production_variance_alert_percent", "numeric", (col) => col.notNull().defaultTo(10))
    .addColumn("updated_by", "uuid", (col) => col.references("users.id"))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("pos_settings").execute();
}
