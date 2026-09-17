import { Kysely, sql } from "kysely";

// الخزائن (خزينة رئيسية لكل فرع + حسابات بنكية) - نفس مفهوم الريبو القديم بالظبط: خزينة = واجهة صديقة
// فوق حساب حقيقي في دليل الحسابات (accounts)، الرصيد بيتحسب لحظيًا من journal_entry_lines مش عمود
// مخزّن هنا. درج الكاشير أثناء شيفته (المفهوم التالت في الريبو القديم) مش موجود هنا كنوع خزينة منفصل -
// ده بالظبط cashier_shifts (migration 013) اللي اتبنى قبل كده، مفيش داعي لتكرار نفس المفهوم.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("treasuries")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull().check(sql`kind IN ('MAIN','BANK')`))
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("account_id", "uuid", (col) => col.notNull().unique().references("accounts.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // خزينة رئيسية واحدة بس لكل فرع - نفس فلسفة idempotency_key/الشيفت النشط الواحد (partial unique
  // index) بالظبط. البنوك (kind='BANK') مستثناة عمدًا - ممكن يكون فيه أكتر من حساب بنكي لنفس الفرع
  await sql`CREATE UNIQUE INDEX idx_treasuries_one_main_per_branch ON treasuries (branch_id) WHERE kind = 'MAIN'`.execute(db);

  await db.schema
    .createTable("banks")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("bank_accounts")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("bank_id", "uuid", (col) => col.notNull().references("banks.id"))
    .addColumn("treasury_id", "uuid", (col) => col.notNull().unique().references("treasuries.id"))
    .addColumn("account_number", "text")
    .addColumn("iban", "text")
    .addColumn("bank_branch_name", "text")
    .addColumn("notes", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("bank_accounts").execute();
  await db.schema.dropTable("banks").execute();
  await db.schema.dropTable("treasuries").execute();
}
