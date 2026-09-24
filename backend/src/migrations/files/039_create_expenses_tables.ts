import { Kysely, sql } from "kysely";

// Expense/ExpenseCategory - نفس مفهوم expenses/expense_categories في الريبو القديم بس بحالتين انتقاليتين
// بدل أربعة (راجع تعليق expense.aggregate.ts). بند المصروف (category) من ليستة مقفولة يديرها الأدمن،
// مش نص حر وقت التسجيل - عشان التقارير تفضل قابلة للتجميع الحقيقي
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("expense_categories")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("alert_threshold", "numeric")
    .addColumn("account_id", "uuid", (col) => col.references("accounts.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("expenses")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("business_date", "date", (col) => col.notNull())
    .addColumn("category_id", "uuid", (col) => col.notNull().references("expense_categories.id"))
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("supplier_id", "uuid", (col) => col.references("suppliers.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("SUBMITTED").check(sql`status IN ('DRAFT','SUBMITTED','POSTED','CANCELLED')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("posted_by", "uuid", (col) => col.references("users.id"))
    .addColumn("posted_at", "timestamptz")
    .addColumn("journal_entry_id", "uuid", (col) => col.references("journal_entries.id"))
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancellation_reason", "text")
    .addColumn("idempotency_key", "text", (col) => col.unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_expenses_branch_date").on("expenses").columns(["branch_id", "business_date"]).execute();
  await db.schema.createIndex("idx_expenses_status").on("expenses").column("status").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("expenses").execute();
  await db.schema.dropTable("expense_categories").execute();
}
