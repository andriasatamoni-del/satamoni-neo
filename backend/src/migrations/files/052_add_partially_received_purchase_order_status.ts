import { Kysely, sql } from "kysely";

// PROC-BUG-1: أمر الشراء عمره ما كان بيتحوّل لـRECEIVED لما إذن استلام مربوط بيه يتأكد. الإصلاح بيحسب
// الحالة من الكميات المستلمة فعليًا مقابل المطلوبة (نفس منطق routes/goods-receipts.js في الريبو القديم)،
// وده محتاج حالة وسيطة PARTIALLY_RECEIVED - نفس الحالة الموجودة في الريبو القديم بالظبط
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check`.execute(db);
  await sql`ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('DRAFT','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE purchase_orders SET status = 'SENT' WHERE status = 'PARTIALLY_RECEIVED'`.execute(db);
  await sql`ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check`.execute(db);
  await sql`ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('DRAFT','SENT','RECEIVED','CANCELLED'))`.execute(db);
}
