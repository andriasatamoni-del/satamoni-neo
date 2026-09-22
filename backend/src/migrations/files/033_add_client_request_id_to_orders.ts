import { Kysely, sql } from "kysely";

// معرّف بيولّده الكاشير (uuid عشوائي) وقت إنشاء الطلب في الفرونت إند - جزء من وضع الكاشير الأوفلاين
// (OFFLINE): الطلب بيتسجّل في طابور محلي (IndexedDB) لو مفيش نت، وبيتزامن تاني لما النت يرجع. لو
// المزامنة اتكررت (مثلًا النت اتقطع بعد ما الطلب اتسجّل فعليًا بس قبل ما الرد يوصل للكاشير)، القيد
// UNIQUE ده بيمنع تسجيل نفس الطلب مرتين - RegisterOrderHandler بيدوّر بالـclientRequestId الأول قبل
// ما يسجّل طلب جديد.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("orders").addColumn("client_request_id", "uuid").execute();
  await sql`CREATE UNIQUE INDEX orders_client_request_id_unique ON orders (client_request_id) WHERE client_request_id IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS orders_client_request_id_unique`.execute(db);
  await db.schema.alterTable("orders").dropColumn("client_request_id").execute();
}
