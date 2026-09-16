import { Kysely, sql } from "kysely";

// HR & Payroll - Employee (user_id اختياري - نفس فلسفة الريبو القديم بالحرف) + PayrollRun (قائمة رواتب
// شهرية بحالة DRAFT/APPROVED/CANCELLED، بسطور صافي راتب جاهزة لكل موظف).
//
// مبسّط عمدًا عن الريبو القديم (محرك حساب رواتب ضخم مبني على بصمات fingerprint_punches - تأخير متدرّج/
// أوفر تايم/استثناءات/اكتشاف الفرع الأساسي، تحضير يدوي لمطبخ مركزي، إجازات/إنذارات/سلف موظفين، تاريخ
// وظيفي، ربط self-service):
// - **مؤجّل بالكامل**: محرك حساب صافي الراتب من الحضور (services/payroll-engine.js في الريبو القديم) -
//   خدمة حسابية متخصصة ضخمة (مئات الأسطر SQL) مش قاعدة دومين بسيطة، بورتها هنا هتكون مشروع منفصل لوحده.
//   السطور هنا بتاخد gross_pay/advances/penalties/bonuses جاهزة (بالظبط زي شكل payroll_run_employees
//   في الريبو القديم نفسه فعلًا - already-computed، مش خام) - محاسب/HR بيدخلها يدوي أو من مصدر خارجي.
// - **مؤجّل**: attendance_records/attendance_punches (تسجيل حضور خام) - بلا استهلاك حقيقي هنا بما إن
//   محرك الحساب نفسه مؤجّل، إعادة بناءه دلوقتي تصميم بلا مستهلك.
// - **مؤجّل**: employee_leaves/employee_leave_requests/employee_warnings/employee_history/
//   employee_fingerprint_codes/central_kitchen_manual_attendance/payroll_adjustments كجدول منفصل.
//
// **القاعدة الجوهرية المحفوظة بالحرف**: PayrollRun أساسًا - نفس مفهوم قفل شهر/اعتماد/إلغاء، وقيد محاسبي
// تلقائي بعد الاعتماد (PayrollRunApproved event -> Accounting، نفس فلسفة OrderRegistered->Accounting
// بالظبط).
//
// **الباج اللي اتصلّح من الأول (مش بعد ما يتكرر)**: الريبو القديم عنده UNIQUE(year, month) عادي على
// payroll_runs - معناها لو قائمة اتلغت (CANCELLED)، الشهر ده مقفول للأبد، مينفعش تتعمل قائمة جديدة
// ليه أصلًا. هنا بدل منها **partial unique index** بيستثني الحالة CANCELLED - شهر بعد ما قائمته تتلغي
// بيرجع متاح لقائمة جديدة. وبرضه فيه مسار حذف صريح لقائمة DRAFT (لسه من غير أثر مالي) بدل ما تفضل
// عالقة للأبد لو غلط فيها من الأول.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("employees")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (col) => col.references("users.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("department", "text")
    .addColumn("job_title", "text")
    .addColumn("hire_date", "date")
    .addColumn("base_salary", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("wage_type", "text", (col) => col.notNull().defaultTo("fixed_monthly").check(sql`wage_type IN ('fixed_monthly','hourly')`))
    .addColumn("hourly_rate", "numeric")
    .addColumn("working_days_per_month", "integer")
    .addColumn("shift", "text")
    .addColumn("restricted_branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("employee_code", "text")
    .addColumn("phone", "text")
    .addColumn("notes", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active").check(sql`status IN ('active','suspended','terminated')`))
    .addColumn("termination_date", "date")
    .addColumn("termination_reason", "text")
    .addColumn("legacy_employee_id", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("payroll_runs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("year", "integer", (col) => col.notNull())
    .addColumn("month", "integer", (col) => col.notNull().check(sql`month >= 1 AND month <= 12`))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("DRAFT").check(sql`status IN ('DRAFT','APPROVED','CANCELLED')`))
    .addColumn("total_net_pay", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("created_by", "uuid", (col) => col.references("users.id"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("approved_by", "uuid", (col) => col.references("users.id"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("cancelled_by", "uuid", (col) => col.references("users.id"))
    .addColumn("cancelled_at", "timestamptz")
    .addColumn("cancellation_reason", "text")
    .addColumn("legacy_payroll_run_id", "integer")
    .execute();
  // partial unique index عمدًا (مش UNIQUE(year,month) عادي) - راجع تعليق الباج فوق
  await sql`CREATE UNIQUE INDEX idx_payroll_runs_year_month_active ON payroll_runs (year, month) WHERE status <> 'CANCELLED'`.execute(db);

  await db.schema
    .createTable("payroll_run_employees")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("payroll_run_id", "uuid", (col) => col.notNull().references("payroll_runs.id").onDelete("cascade"))
    .addColumn("employee_id", "uuid", (col) => col.notNull().references("employees.id"))
    .addColumn("employee_name", "text", (col) => col.notNull())
    .addColumn("branch_id", "uuid", (col) => col.references("branches.id"))
    .addColumn("gross_pay", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("advances", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("penalties", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("bonuses", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("net_pay", "numeric", (col) => col.notNull().defaultTo(0))
    .execute();
  await db.schema.createIndex("idx_payroll_run_employees_run").on("payroll_run_employees").column("payroll_run_id").execute();

  // نفس فلسفة journal_entry_lines بالظبط - قائمة APPROVED/CANCELLED غير قابلة للتعديل، أي تصحيح
  // لازم يتعمل بقائمة جديدة (بعد ما الشهر يترجع يتاح لو اتلغت، أو لو لسه DRAFT بيتمسح ويتعاد تسجيله)
  await sql`
    CREATE OR REPLACE FUNCTION block_non_draft_payroll_run_employees_changes() RETURNS TRIGGER AS $$
    DECLARE
      run_status TEXT;
    BEGIN
      SELECT status INTO run_status FROM payroll_runs WHERE id = COALESCE(NEW.payroll_run_id, OLD.payroll_run_id);
      IF run_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'قائمة الرواتب دي مش DRAFT - غير قابلة للتعديل، اعمل قائمة جديدة بدل ما تعدّلها';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER trg_block_non_draft_payroll_run_employees_changes
      BEFORE INSERT OR UPDATE OR DELETE ON payroll_run_employees
      FOR EACH ROW EXECUTE FUNCTION block_non_draft_payroll_run_employees_changes()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_block_non_draft_payroll_run_employees_changes ON payroll_run_employees`.execute(db);
  await sql`DROP FUNCTION IF EXISTS block_non_draft_payroll_run_employees_changes()`.execute(db);
  await db.schema.dropTable("payroll_run_employees").execute();
  await db.schema.dropTable("payroll_runs").execute();
  await db.schema.dropTable("employees").execute();
}
