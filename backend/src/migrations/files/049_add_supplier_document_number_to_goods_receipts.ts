import { Kysely } from "kysely";

// SAFE-1: نفس فكرة رقم مستند المورد اللي عندها الـpurchases (المشترى النقدي السريع) خلال 9A-3 بالريبو
// القديم، بس هنا على GRN (goods_receipts) كمان - مطلوب عشان فحص التكرار (راجع
// shared/procurement/purchase-duplicate-check.service.ts) يقدر يقارن نفس المورد+رقم المستند سواء
// اتسجل كمشترى نقدي أو كـGRN رسمي (نفس الحل اللي قدّمه db/purchase-duplicate-check.js في الريبو القديم)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("goods_receipts").addColumn("supplier_document_number", "text").execute();
  await db.schema
    .createIndex("idx_goods_receipts_supplier_doc")
    .on("goods_receipts")
    .columns(["supplier_id", "supplier_document_number"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_goods_receipts_supplier_doc").execute();
  await db.schema.alterTable("goods_receipts").dropColumn("supplier_document_number").execute();
}
