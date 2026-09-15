import { Kysely, sql } from "kysely";

// Accounting context - دليل حسابات + قيود يومية بنفس القواعد الجوهرية للريبو القديم بالظبط (خطة إعادة
// البناء: "Explicitly do not redesign the double-entry ledger's rules"). القاعدتين محفوظتين كـDB
// triggers حقيقية (مش تطبيقي بس)، نفس فلسفة الريبو القديم بالحرف:
// 1) كل قيد لازم يكون متزن (SUM(debit) = SUM(credit)) - deferred constraint trigger بيتأكد وقت commit
//    المعاملة كلها (بعد كل سطور القيد)، مش بعد كل سطر لوحده.
// 2) قيد POSTED غير قابل للتعديل إطلاقًا - أي محاولة INSERT/UPDATE/DELETE على سطوره بترفض.
// مؤجّل: accounting_periods (قفل شهري) - مفيش orchestration لإقفال شهر لسه محتاجه فعليًا.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("accounts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("code", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("account_type", "text", (col) => col.notNull().check(sql`account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE')`))
    .addColumn("parent_account_id", "uuid", (col) => col.references("accounts.id"))
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("is_system_account", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("legacy_account_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE SEQUENCE journal_entry_number_seq START 1`.execute(db);

  await db.schema
    .createTable("journal_entries")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("entry_number", "text", (col) => col.unique())
    .addColumn("entry_date", "date", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("source_type", "text", (col) => col.notNull())
    .addColumn("source_id", "text")
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("POSTED").check(sql`status IN ('DRAFT','POSTED','REVERSED')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("posted_at", "timestamptz")
    .addColumn("reversed_at", "timestamptz")
    .addColumn("reversal_of_entry_id", "uuid", (col) => col.references("journal_entries.id"))
    .addColumn("reversal_reason", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_journal_entries_source").on("journal_entries").columns(["source_type", "source_id"]).execute();
  await db.schema.createIndex("idx_journal_entries_branch_date").on("journal_entries").columns(["branch_id", "entry_date"]).execute();

  await db.schema
    .createTable("journal_entry_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("journal_entry_id", "uuid", (col) => col.notNull().references("journal_entries.id").onDelete("cascade"))
    .addColumn("account_id", "uuid", (col) => col.notNull().references("accounts.id"))
    .addColumn("debit", "numeric", (col) => col.notNull().defaultTo(0).check(sql`debit >= 0`))
    .addColumn("credit", "numeric", (col) => col.notNull().defaultTo(0).check(sql`credit >= 0`))
    .addColumn("description", "text")
    .addColumn("reference_type", "text")
    .addColumn("reference_id", "text")
    .addCheckConstraint("journal_entry_lines_not_both_check", sql`NOT (debit > 0 AND credit > 0)`)
    .execute();
  await db.schema.createIndex("idx_journal_entry_lines_entry").on("journal_entry_lines").column("journal_entry_id").execute();
  await db.schema.createIndex("idx_journal_entry_lines_account").on("journal_entry_lines").column("account_id").execute();

  // تحقق مزدوج على مستوى القاعدة: مجموع المدين = مجموع الدائن بالظبط، بعد كل سطور القيد (deferred - وقت الـcommit)
  await sql`
    CREATE OR REPLACE FUNCTION check_journal_entry_balanced() RETURNS TRIGGER AS $$
    DECLARE
      target_entry_id UUID;
      total_debit NUMERIC;
      total_credit NUMERIC;
    BEGIN
      target_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO total_debit, total_credit
      FROM journal_entry_lines WHERE journal_entry_id = target_entry_id;
      IF total_debit <> total_credit THEN
        RAISE EXCEPTION 'القيد رقم % غير متزن: مدين % ≠ دائن % - لازم يتساووا بالظبط', target_entry_id, total_debit, total_credit;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE CONSTRAINT TRIGGER trg_journal_entry_lines_balanced
      AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION check_journal_entry_balanced()
  `.execute(db);

  // عدم قابلية التعديل بعد الترحيل - قيد POSTED مينفعش أي سطر فيه يتضاف/يتعدّل/يتمسح
  await sql`
    CREATE OR REPLACE FUNCTION block_posted_journal_entry_line_changes() RETURNS TRIGGER AS $$
    DECLARE
      entry_status TEXT;
    BEGIN
      SELECT status INTO entry_status FROM journal_entries WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
      IF entry_status = 'POSTED' THEN
        RAISE EXCEPTION 'القيد ده POSTED بالفعل - غير قابل للتعديل، اعمل قيد عكسي بدل ما تعدّله';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER trg_block_posted_journal_entry_line_changes
      BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
      FOR EACH ROW EXECUTE FUNCTION block_posted_journal_entry_line_changes()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_block_posted_journal_entry_line_changes ON journal_entry_lines`.execute(db);
  await sql`DROP FUNCTION IF EXISTS block_posted_journal_entry_line_changes()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_journal_entry_lines_balanced ON journal_entry_lines`.execute(db);
  await sql`DROP FUNCTION IF EXISTS check_journal_entry_balanced()`.execute(db);
  await db.schema.dropTable("journal_entry_lines").execute();
  await db.schema.dropTable("journal_entries").execute();
  await sql`DROP SEQUENCE IF EXISTS journal_entry_number_seq`.execute(db);
  await db.schema.dropTable("accounts").execute();
}
