import { Kysely, sql } from "kysely";

// دعم بوابة الخدمة الذاتية للموظفين (employee self-service): طلبات الإجازة الخاصة بالموظف نفسه،
// وحضور/انصراف بسيط بيسجّله الموظف نفسه (بدون بصمة/جهاز - مؤجّل بالكامل، راجع تعليق migration
// 012_create_hr_payroll_tables.ts). EmployeeAttendanceShift هنا معلوماتي بحت (للعرض في "بياناتي" بس) -
// من غير حقول أجر/بونص زي DriverAttendanceShift، لأن PayrollRun هنا مدخلات يدوية بالكامل ومفيش محرك
// بيحسب الراتب من الحضور (نفس قرار عدم بناء ذلك المحرك أصلًا)
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("employee_leave_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("employee_id", "uuid", (col) => col.notNull().references("employees.id"))
    .addColumn("leave_type", "text", (col) => col.notNull())
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date", (col) => col.notNull())
    .addColumn("days", "integer", (col) => col.notNull())
    .addColumn("reason", "text")
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("PENDING").check(sql`status IN ('PENDING','APPROVED','REJECTED','CANCELLED')`)
    )
    .addColumn("reviewed_by", "uuid", (col) => col.references("users.id"))
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("review_notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("employee_attendance_shifts")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("employee_id", "uuid", (col) => col.notNull().references("employees.id"))
    .addColumn("branch_id", "uuid", (col) => col.notNull().references("branches.id"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("ACTIVE").check(sql`status IN ('ACTIVE','CLOSED')`))
    .addColumn("checked_in_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("checked_out_at", "timestamptz")
    .addColumn("hours_worked", "numeric")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // شيفت واحد ACTIVE بس لكل موظف - نفس نمط idx_driver_attendance_shifts_one_active_per_driver
  await sql`CREATE UNIQUE INDEX idx_employee_attendance_shifts_one_active_per_employee
    ON employee_attendance_shifts (employee_id) WHERE status = 'ACTIVE'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("employee_attendance_shifts").execute();
  await db.schema.dropTable("employee_leave_requests").execute();
}
