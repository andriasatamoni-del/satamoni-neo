import { Kysely, sql } from "kysely";

// إقفال شهري وسنوي - نفس قواعد الريبو القديم بالظبط (راجع تعليق migration 009 "مؤجّل: accounting_periods
// - مفيش orchestration لإقفال شهر لسه محتاجه فعليًا"، الوقت جه). شهر مفقول من الجدول = مفتوح ضمنيًا
// (نفس فلسفة ensurePeriodOpen في الريبو القديم - أول قيد في شهر جديد بيسجّله OPEN تلقائيًا، مفيش داعي
// نمليء كل الشهور مقدّمًا). التحقق هنا defense مزدوج: تريجر حقيقي على مستوى القاعدة (زي اتزان القيد
// وعدم قابلية التعديل بعد الترحيل بالظبط) + تحقق تطبيقي في KyselyJournalEntryRepository.save() لرسالة
// خطأ واضحة بدل استثناء Postgres خام.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("accounting_periods")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("year", "integer", (col) => col.notNull())
    .addColumn("month", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("OPEN").check(sql`status IN ('OPEN','CLOSED')`))
    .addColumn("closed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("closed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("accounting_periods_year_month_unique", ["year", "month"])
    .execute();

  await db.schema
    .createTable("fiscal_year_closings")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("year", "integer", (col) => col.notNull().unique())
    .addColumn("net_income", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("closed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("closed_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("journal_entry_id", "uuid", (col) => col.notNull().references("journal_entries.id"))
    .execute();

  // بيتفعّل بس وقت انتقال القيد من DRAFT للحالة الحقيقية (POSTED عادةً) - نفس اللحظة اللي
  // KyselyJournalEntryRepository.save() بيعمل فيها الـUPDATE التاني بعد إدخال كل السطور. شهر مفقود من
  // accounting_periods = مفتوح ضمنيًا (مفيش صف يترجعه SELECT، الشرط IF FOUND بيتخطّى)
  await sql`
    CREATE OR REPLACE FUNCTION prevent_posting_to_closed_period() RETURNS TRIGGER AS $$
    DECLARE
      period_status TEXT;
    BEGIN
      IF NEW.status = 'DRAFT' OR OLD.status <> 'DRAFT' THEN RETURN NEW; END IF;
      SELECT status INTO period_status FROM accounting_periods
        WHERE year = EXTRACT(YEAR FROM NEW.entry_date)::int AND month = EXTRACT(MONTH FROM NEW.entry_date)::int;
      IF period_status = 'CLOSED' THEN
        RAISE EXCEPTION 'الشهر المحاسبي %-% مقفول - مينفعش يترحّل عليه أي قيد جديد',
          EXTRACT(YEAR FROM NEW.entry_date)::int, EXTRACT(MONTH FROM NEW.entry_date)::int;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER trg_prevent_posting_to_closed_period
      BEFORE UPDATE ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION prevent_posting_to_closed_period()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_prevent_posting_to_closed_period ON journal_entries`.execute(db);
  await sql`DROP FUNCTION IF EXISTS prevent_posting_to_closed_period()`.execute(db);
  await db.schema.dropTable("fiscal_year_closings").execute();
  await db.schema.dropTable("accounting_periods").execute();
}
