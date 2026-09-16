import { Kysely, sql } from "kysely";

// Payment Control & Reconciliation - يعتمد على مفهومين من الريبو القديم بالحرف ("port with minimal
// redesign" - راجع خطة إعادة البناء): 1) قفل الدفعة فور اختيار الكاشير لطريقة الدفع وقت تسجيل الطلب
// (مايتغيّرش تاني إلا عن طريق طلب تعديل معتمد - PaymentAdjustmentRequest)، و2) مطابقة مصدرين مستقلين
// (الدفعات المقفولة مقابل كشوف حساب خارجية يدوية) من غير توحيد تلقائي - النظام بيسجّل الفرق ويعرضه بس.
//
// مبسّط عمدًا عن الريبو القديم (8 تبويبات، استيراد CSV، مجدول SMS يومي، نظام موافقة PIN token عام):
// - **مؤجّل**: استيراد CSV/Excel لكشوف الحساب (Phase 2 في الريبو القديم) - إدخال يدوي بس هنا لحد ما
//   ملف حقيقي من مزوّد يتاح (نفس القيد الموروث المذكور في docs/PAYMENT-CONTROL.md الأصلي).
// - **مؤجّل**: مجدول إرسال التقرير اليومي للمالك عبر SMS - أتمتة تشغيلية مش جزء من الدومين نفسه.
// - **مبسّط**: موافقة التعديل بسقف مزدوج (عادي/عالي) عن طريق صلاحيات مباشرة (payment_control.
//   adjustment.approve/.approve_high) بدل نظام approval_grants + PIN token العام (مش مبني في النظام
//   الجديد أصلًا لحد دلوقتي - توسعة عامة مؤجّلة، مش خاصة بالسياق ده).
// - **مؤجّل**: سجل تدقيق منفصل (payment_audit_logs) - PaymentAdjustmentRequest نفسه بيحمل
//   requested_by/decided_by/decided_at كتتبع كافي للسلايس ده.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("payment_methods")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull().check(sql`kind IN ('cash','card_or_wallet','credit')`))
    .addColumn("settlement_channel", "text", (col) =>
      col.check(sql`settlement_channel IN ('visa_pos','instapay','orange_cash','vodafone_cash')`)
    )
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("legacy_payment_method_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("payments")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("order_id", "uuid", (col) => col.notNull().unique().references("orders.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("payment_method_id", "uuid", (col) => col.notNull().references("payment_methods.id"))
    .addColumn("method_kind", "text", (col) => col.notNull())
    .addColumn("settlement_channel", "text")
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("locked_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("locked_by", "uuid", (col) => col.references("users.id"))
    .addColumn("legacy_payment_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_payments_branch").on("payments").column("branch_id").execute();
  await db.schema.createIndex("idx_payments_settlement_channel").on("payments").column("settlement_channel").execute();

  await db.schema
    .createTable("payment_adjustment_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("payment_id", "uuid", (col) => col.notNull().references("payments.id"))
    .addColumn("requested_by", "uuid", (col) => col.references("users.id"))
    .addColumn("requested_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("reason", "text")
    // nullable عمدًا - نفس فلسفة الريبو القديم بالحرف: طلب تعديل ممكن يصحّح المبلغ بس (نفس طريقة
    // الدفع)، من غير ما يغيّر تصنيف القناة خالص - null هنا معناها "خليها زي ما هي، غيّر المبلغ بس"
    .addColumn("proposed_payment_method_id", "uuid", (col) => col.references("payment_methods.id"))
    .addColumn("proposed_amount", "numeric", (col) => col.notNull())
    .addColumn("amount_delta", "numeric", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("PENDING").check(sql`status IN ('PENDING','APPROVED','REJECTED')`))
    .addColumn("decided_by", "uuid", (col) => col.references("users.id"))
    .addColumn("decided_at", "timestamptz")
    .addColumn("legacy_adjustment_request_id", "integer")
    .execute();
  await db.schema.createIndex("idx_adjustment_requests_payment").on("payment_adjustment_requests").column("payment_id").execute();

  await db.schema
    .createTable("payment_reconciliation_records")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("source", "text", (col) => col.notNull().check(sql`source IN ('talabat_statement','visa_settlement','instapay','orange_cash')`))
    .addColumn("external_reference", "text")
    .addColumn("external_amount", "numeric", (col) => col.notNull())
    .addColumn("external_date", "date", (col) => col.notNull())
    .addColumn("matched_payment_id", "uuid", (col) => col.references("payments.id"))
    .addColumn("match_status", "text", (col) => col.notNull().defaultTo("UNMATCHED").check(sql`match_status IN ('UNMATCHED','MATCHED','IGNORED')`))
    .addColumn("notes", "text")
    .addColumn("entered_by", "uuid", (col) => col.references("users.id"))
    .addColumn("entered_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("legacy_reconciliation_record_id", "integer")
    .execute();
  await db.schema.createIndex("idx_reconciliation_records_status").on("payment_reconciliation_records").column("match_status").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("payment_reconciliation_records").execute();
  await db.schema.dropTable("payment_adjustment_requests").execute();
  await db.schema.dropTable("payments").execute();
  await db.schema.dropTable("payment_methods").execute();
}
