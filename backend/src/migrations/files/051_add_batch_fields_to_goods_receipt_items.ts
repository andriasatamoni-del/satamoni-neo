import { Kysely } from "kysely";

// BATCH-1: لو بند استلام محدد له تاريخ صلاحية فعلي، بيتسجّل جوّه الاستلام نفسه وقت التسجيل (DRAFT)،
// وبيتقرا وقت التأكيد (ConfirmGoodsReceiptHandler) عشان يعمل دفعة (inventory_batches) - نفس فكرة
// goods_receipt_items.batch_id/expiry_date بالريبو القديم، بس هنا مباشرة على السطر (مفيش batch_id FK
// عائد - العلاقة معكوسة: الدفعة هي اللي بتحمل source_id يرجّع للاستلام، راجع migration 050)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("goods_receipt_items").addColumn("expiry_date", "date").execute();
  await db.schema.alterTable("goods_receipt_items").addColumn("production_date", "date").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("goods_receipt_items").dropColumn("production_date").execute();
  await db.schema.alterTable("goods_receipt_items").dropColumn("expiry_date").execute();
}
