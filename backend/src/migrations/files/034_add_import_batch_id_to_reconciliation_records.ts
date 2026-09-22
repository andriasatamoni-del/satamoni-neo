import { Kysely } from "kysely";

// استيراد كشف حساب (CSV) بالجملة بدل إدخال كل سطر يدوي - كل سطور نفس الاستيراد بتتوسم بـ
// import_batch_id مشترك (يتولّد في السيرفر وقت الـcommit)، عشان لو عمود اتحدد غلط في الملف، الدفعة
// كلها تتلغي مرة واحدة (بس لو لسه كل سطورها UNMATCHED - راجع CancelReconciliationImportBatchHandler)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("payment_reconciliation_records").addColumn("import_batch_id", "uuid").execute();
  await db.schema
    .createIndex("idx_payment_reconciliation_records_import_batch")
    .on("payment_reconciliation_records")
    .column("import_batch_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_payment_reconciliation_records_import_batch").execute();
  await db.schema.alterTable("payment_reconciliation_records").dropColumn("import_batch_id").execute();
}
