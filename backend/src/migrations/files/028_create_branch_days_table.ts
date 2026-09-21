import { Kysely, sql } from "kysely";

// قفل يوم الفرع (TIER: branch-day-close) - نفس مفهوم branch_days في الريبو القديم: "اليوم" مفهوم
// ضمني، القفل هو الفعل الوحيد اللي بيسجل صف. UNIQUE(branch_id, business_date) هي الحماية الحقيقية
// ضد قفل مزدوج (راجع BranchDay aggregate + CloseBranchDayHandler)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("branch_days")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("business_date", "date", (col) => col.notNull())
    .addColumn("closed_by", "uuid", (col) => col.notNull().references("users.id"))
    .addColumn("closed_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("total_sales", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("order_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("cash_variance_total", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("manager_notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("branch_days_branch_date_unique", ["branch_id", "business_date"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("branch_days").execute();
}
