import { Kysely } from "kysely";

// الشاشة الوحيدة اللي بتحتاج polling في الريبو القديم (kitchen staff إيديهم مشغولة، مش هيدوسوا refresh) -
// عشان الـUI يحسب badge وقت الانتظار (أخضر/برتقالي/أحمر) محتاج يعرف امتى الطلب اتقبل وامتى بقى جاهز،
// مش بس آخر تحديث. نفس الأعمدة اللي في الريبو القديم (orders.kitchen_accepted_at/kitchen_ready_at).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("orders").addColumn("kitchen_accepted_at", "timestamptz").execute();
  await db.schema.alterTable("orders").addColumn("kitchen_ready_at", "timestamptz").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("orders").dropColumn("kitchen_ready_at").execute();
  await db.schema.alterTable("orders").dropColumn("kitchen_accepted_at").execute();
}
