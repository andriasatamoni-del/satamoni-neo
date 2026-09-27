import { Kysely, sql } from "kysely";

// سجل تغييرات جوهرية على بيانات الموظف (فرع/قسم/وظيفة/حالة) - append-only زي أي سجل تدقيق في المشروع،
// مفيش UPDATE ولا DELETE عليه أبدًا من التطبيق. سطر واحد لكل حقل اتغيّر فعليًا (مش سطر واحد لكل عملية
// تحديث مهما كان عدد الحقول) عشان الفلترة/التقرير حسب حقل معيّن يبقى مباشر - نفس مفهوم employee_history
// بالريبو القديم بالظبط (راجع db/employee-history.js هناك)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("employee_history")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("employee_id", "uuid", (col) => col.notNull().references("employees.id").onDelete("cascade"))
    .addColumn("field_name", "text", (col) => col.notNull())
    .addColumn("old_value", "text")
    .addColumn("new_value", "text")
    .addColumn("effective_date", "date", (col) => col.notNull().defaultTo(sql`current_date`))
    .addColumn("changed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("reason", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("idx_employee_history_employee").on("employee_history").column("employee_id").execute();
  await db.schema.createIndex("idx_employee_history_effective_date").on("employee_history").column("effective_date").execute();
  await db.schema.createIndex("idx_employee_history_field").on("employee_history").column("field_name").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("employee_history").execute();
}
