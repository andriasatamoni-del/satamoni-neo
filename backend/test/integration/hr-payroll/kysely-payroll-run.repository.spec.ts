import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyEmployeeRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/kysely-employee.repository";
import { KyselyPayrollRunRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/kysely-payroll-run.repository";
import { Employee } from "../../../src/contexts/hr-payroll/domain/employee.aggregate";
import { PayrollRun } from "../../../src/contexts/hr-payroll/domain/payroll-run.aggregate";

describe("KyselyPayrollRunRepository + DB-level invariants (trigger + partial unique index حقيقيين)", () => {
  let db: Kysely<Database>;
  let employeeRepo: KyselyEmployeeRepository;
  let runRepo: KyselyPayrollRunRepository;
  let employeeId: string;

  beforeAll(async () => {
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    employeeRepo = new KyselyEmployeeRepository(db);
    runRepo = new KyselyPayrollRunRepository(db);

    const employee = Employee.register({ name: "موظف رواتب-جست", baseSalary: 4000 });
    await employeeRepo.save(employee);
    employeeId = employee.id;
  });

  afterAll(async () => {
    await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(db);
    await sql`DELETE FROM employees WHERE id = ${employeeId}`.execute(db);
    await db.destroy();
  });

  // TRUNCATE عمدًا (مش DELETE) - قوائم اتعتمدت بتبقى APPROVED فعليًا خلال التستات، والـtrigger اللي
  // بيمنع التعديل على سطور قائمة مش DRAFT (block_non_draft_payroll_run_employees_changes) بيرفض أي
  // DELETE عليها كمان - نفس فلسفة تنظيف تستات journal_entry_lines بالظبط
  afterEach(async () => {
    await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(db);
  });

  test("save بيسجّل قائمة DRAFT بسطورها", async () => {
    const run = PayrollRun.register({
      year: 2026, month: 1,
      employees: [{ employeeId, employeeName: "موظف رواتب-جست", grossPay: 4000 }],
    });
    await runRepo.save(run);

    const found = await runRepo.findById(run.id);
    expect(found?.employees).toHaveLength(1);
    expect(found?.totalNetPay).toBe(4000);
  });

  // ريجريشن: reconstitute() مباشرة (زي سكريبت الاستيراد بالظبط) لقائمة اتسجّلت APPROVED من الأول
  // بسطورها في نفس save() واحد - نفس فخ journal_entry_lines بالحرف لو الصف اتسجّل بحالته النهائية
  // قبل السطور مش بعدها
  test("save بيسجّل قائمة APPROVED مباشرة (مش عن طريق approve()) بسطورها من غير ما التريجر يرفض", async () => {
    const historical = PayrollRun.reconstitute(crypto.randomUUID(), {
      year: 2027, month: 8, status: "APPROVED",
      employees: [{ id: crypto.randomUUID(), employeeId, employeeName: "موظف رواتب-جست", branchId: null, grossPay: 3000, advances: 0, penalties: 0, bonuses: 0, netPay: 3000 }],
      totalNetPay: 3000, createdBy: null, createdAt: new Date(), approvedBy: null, approvedAt: new Date(),
      cancelledBy: null, cancelledAt: null, cancellationReason: null, legacyPayrollRunId: 999,
    });
    await runRepo.save(historical);

    const found = await runRepo.findById(historical.id);
    expect(found?.status).toBe("APPROVED");
    expect(found?.employees).toHaveLength(1);
    expect(found?.totalNetPay).toBe(3000);
  });

  test("save بعد approve بيحدّث حالة القائمة من غير ما يلمس سطورها", async () => {
    const run = PayrollRun.register({
      year: 2026, month: 2,
      employees: [{ employeeId, employeeName: "موظف رواتب-جست", grossPay: 4000 }],
    });
    await runRepo.save(run);
    run.approve(null);
    await runRepo.save(run);

    const found = await runRepo.findById(run.id);
    expect(found?.status).toBe("APPROVED");
    expect(found?.employees).toHaveLength(1);
  });

  test("الـDB trigger بيرفض فعليًا أي تعديل على سطور قائمة مش DRAFT", async () => {
    const run = PayrollRun.register({
      year: 2026, month: 3,
      employees: [{ employeeId, employeeName: "موظف رواتب-جست", grossPay: 4000 }],
    });
    await runRepo.save(run);
    run.approve(null);
    await runRepo.save(run);

    await expect(
      sql`UPDATE payroll_run_employees SET gross_pay = 9999 WHERE payroll_run_id = ${run.id}`.execute(db)
    ).rejects.toThrow(/مش DRAFT/);
    await expect(
      sql`DELETE FROM payroll_run_employees WHERE payroll_run_id = ${run.id}`.execute(db)
    ).rejects.toThrow(/مش DRAFT/);
  });

  test("partial unique index بيسمح بقائمة جديدة لنفس الشهر بعد ما القديمة تتلغي - الباج الموروث اتصلّح", async () => {
    const first = PayrollRun.register({ year: 2099, month: 5, employees: [] });
    await runRepo.save(first);
    first.approve(null);
    await runRepo.save(first);

    // لسه فعّالة (APPROVED) - محاولة تسجيل قائمة تانية لنفس الشهر لازم ترفض على مستوى القاعدة
    const duplicate = PayrollRun.register({ year: 2099, month: 5, employees: [] });
    await expect(runRepo.save(duplicate)).rejects.toThrow();

    first.cancel({ reason: "غلط" });
    await runRepo.save(first);

    // دلوقتي اتلغت - الشهر لازم يرجع متاح لقائمة جديدة (نفس duplicate object، بس هنسجّلها تاني بعد الإلغاء)
    await expect(runRepo.save(duplicate)).resolves.not.toThrow();
    const active = await runRepo.findActiveByPeriod(2099, 5);
    expect(active?.id).toBe(duplicate.id);
  });

  test("deleteDraft بيمسح قائمة DRAFT فعليًا، ومش بيمسح قائمة APPROVED", async () => {
    const draft = PayrollRun.register({ year: 2026, month: 4, employees: [{ employeeId, employeeName: "موظف رواتب-جست", grossPay: 1000 }] });
    await runRepo.save(draft);
    await runRepo.deleteDraft(draft.id);
    expect(await runRepo.findById(draft.id)).toBeNull();

    const approved = PayrollRun.register({ year: 2026, month: 6, employees: [] });
    await runRepo.save(approved);
    approved.approve(null);
    await runRepo.save(approved);
    await runRepo.deleteDraft(approved.id); // status != DRAFT في الـWHERE - محتوى بلا أثر، بيفضل موجود
    expect(await runRepo.findById(approved.id)).not.toBeNull();
  });
});
