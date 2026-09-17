import { Kysely, sql } from "kysely";

// شيفتات الكاشير (فتح/قفل الدرج + تسوية الكاش) - راجع routes/shifts.js + db/shift-engine.js في الريبو
// القديم لمواصفة كاملة. النسخة هنا مبسّطة عمدًا للسلايس الأول: الكاش المتوقع = رصيد الافتتاح + مبيعات
// كاش الشيفت بس (من غير استرجاعات/مصروفات/مشتريات نقدية - دول مش موديلات بشكل يسمح بحسابهم هنا لسه في
// النظام الجديد)، وحد اعتماد الفرق ثابت مش من إعدادات (POS_SETTINGS مش موجود). التسليم المحاسبي
// (درج الكاشير -> خزينة الفرع) وربط العجز بسلفة موظف حقيقية في الرواتب مؤجّلين - بس بتصفية الفرق
// (لو موجود) كقيد واحد بسيط، راجع post-shift-variance-journal-entry.handler.ts
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("cashier_shifts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id"))
    .addColumn("status", "text", (col) =>
      col.notNull().check(sql`status IN ('ACTIVE','CLOSED','PENDING_REVIEW')`)
    )
    .addColumn("opened_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("opening_cash", "numeric", (col) => col.notNull())
    .addColumn("opening_notes", "text")
    .addColumn("closed_at", "timestamptz")
    .addColumn("closed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("actual_cash", "numeric")
    .addColumn("expected_cash", "numeric")
    .addColumn("cash_variance", "numeric")
    .addColumn("closing_notes", "text")
    .addColumn("cash_sales", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("card_sales", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("other_sales", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("order_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("variance_status", "text", (col) =>
      col.notNull().defaultTo("NONE").check(sql`variance_status IN ('NONE','PENDING_REVIEW','APPROVED','ACKNOWLEDGED')`)
    )
    .addColumn("variance_reviewed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("variance_reviewed_at", "timestamptz")
    .addColumn("variance_review_notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // نفس فلسفة orders.idempotency_key - partial unique index هو الحماية الحقيقية ضد فتح شيفتين متزامنين
  // لنفس الكاشير، مش بس فحص مبدئي في الكود
  await sql`CREATE UNIQUE INDEX idx_cashier_shifts_one_active_per_user ON cashier_shifts (user_id) WHERE status = 'ACTIVE'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("cashier_shifts").execute();
}
