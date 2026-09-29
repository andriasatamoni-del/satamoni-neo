import { Kysely, sql } from "kysely";

// STORE-1: موقع الطلب أونلاين للعملاء (نفس public/order.html + orders.source في الريبو القديم):
// - orders.source: مصدر الطلب (pos/website/whatsapp/talabat) - الكاشير والمطبخ لازم يعرفوا إن الطلب جه
//   من الموقع. الطلبات القديمة كلها pos، ما عدا اللي ليها صف في talabat_orders/whatsapp_pending_orders.
// - orders.customer_notes: ملاحظة العميل على الطلب (بدون بصل، الدور التالت...) - بتظهر للمطبخ والكاشير.
// - pos_settings.online_ordering_enabled: مقفول افتراضيًا - الموقع بيقول "الطلب أونلاين مقفول حاليًا"
//   لحد ما الإدارة تفعّله (نفس فلسفة البوت ورسايل SMS).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE orders ADD COLUMN source text NOT NULL DEFAULT 'pos'
    CHECK (source IN ('pos','website','whatsapp','talabat'))`.execute(db);
  await sql`ALTER TABLE orders ADD COLUMN customer_notes text`.execute(db);
  await sql`UPDATE orders SET source = 'talabat' WHERE id IN (SELECT pos_order_id FROM talabat_orders WHERE pos_order_id IS NOT NULL)`.execute(db);
  await sql`UPDATE orders SET source = 'whatsapp'
    WHERE id IN (SELECT confirmed_order_id FROM whatsapp_pending_orders WHERE confirmed_order_id IS NOT NULL)`.execute(db);
  await sql`CREATE INDEX orders_customer_phone_idx ON orders (customer_phone, created_at DESC) WHERE customer_phone IS NOT NULL`.execute(db);

  await sql`ALTER TABLE pos_settings ADD COLUMN online_ordering_enabled boolean NOT NULL DEFAULT false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pos_settings DROP COLUMN online_ordering_enabled`.execute(db);
  await sql`DROP INDEX IF EXISTS orders_customer_phone_idx`.execute(db);
  await sql`ALTER TABLE orders DROP COLUMN customer_notes`.execute(db);
  await sql`ALTER TABLE orders DROP COLUMN source`.execute(db);
}
