import { Kysely, sql } from "kysely";

// سلف/جزاءات/مكافآت فردية لموظف - سجل مستقل بيتجمّع لاحقًا في قائمة رواتب (PayrollRun.employees[].
// advances/penalties/bonuses بيتحسبوا يدويًا وقت التسجيل حاليًا، مش من هنا تلقائيًا - راجع تعليق
// employee.aggregate.ts "محرك حساب صافي الراتب من الحضور مؤجّل بالكامل"، الجدول ده بيسجّل الحركة
// الفردية نفسها بس عشان يكون فيه سجل/تدقيق قابل للمراجعة، مش عشان يتربط تلقائي بقائمة رواتب لسه).
// soft-cancel بس (status) - نفس فلسفة الريبو القديم بعد HRF-4 بالظبط: مفيش DELETE فعلي أبدًا، السجل
// التاريخي بيفضل موجود حتى لو اتلغى، الإلغاء بيتطلب سبب صريح ومسجّل تلقائيًا في سجل التدقيق العام
// (AuditLogInterceptor - مفيش استدعاء يدوي هنا، نفس فلسفة كل الـcontexts التانية في النظام الجديد)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("payroll_adjustments")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("employee_id", "uuid", (col) => col.notNull().references("employees.id").onDelete("cascade"))
    .addColumn("entry_date", "date", (col) => col.notNull())
    .addColumn("adjustment_type", "text", (col) => col.notNull().check(sql`adjustment_type IN ('advance','penalty','bonus')`))
    .addColumn("amount", "numeric", (col) => col.notNull().check(sql`amount > 0`))
    .addColumn("notes", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("ACTIVE").check(sql`status IN ('ACTIVE','CANCELLED')`))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancellation_reason", "text")
    .execute();
  await db.schema.createIndex("idx_payroll_adjustments_employee").on("payroll_adjustments").column("employee_id").execute();
  await db.schema.createIndex("idx_payroll_adjustments_entry_date").on("payroll_adjustments").column("entry_date").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("payroll_adjustments").execute();
}
