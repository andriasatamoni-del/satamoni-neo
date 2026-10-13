import type { Database } from "../../../src/shared/database/database.token";
import { EmployeeRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/employee.repository";
import { PayrollRunRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/payroll-run.repository";
import { Employee } from "../../../src/contexts/hr-payroll/domain/employee.aggregate";
import { PayrollRun } from "../../../src/contexts/hr-payroll/domain/payroll-run.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { eq } from "drizzle-orm";
import { employees, payrollRunEmployees, payrollRuns } from "../../../src/contexts/hr-payroll/infrastructure/persistence/hr-payroll.tables";
import { dbCause, truncate } from "../helpers/db";

describe("PayrollRunRepository + DB-level invariants (trigger + partial unique index حقيقيين)", () => {
  let db: Database;
  let employeeRepo: EmployeeRepository;
  let runRepo: PayrollRunRepository;
  let employeeId: string;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    employeeRepo = new EmployeeRepository(db);
    runRepo = new PayrollRunRepository(db);

    const employee = Employee.register({ name: "موظف رواتب-جست", baseSalary: 4000 });
    await employeeRepo.save(employee);
    employeeId = employee.id;
  });

  afterAll(async () => {
    await truncate(db, payrollRunEmployees, payrollRuns);
    await db.delete(employees).where(eq(employees.id, employeeId));
    await closeScriptDb(db);
  });

  // TRUNCATE عمدًا (مش DELETE) - قوائم اتعتمدت بتبقى APPROVED فعليًا خلال التستات، والـtrigger اللي
  // بيمنع التعديل على سطور قائمة مش DRAFT (block_non_draft_payroll_run_employees_changes) بيرفض أي
  // DELETE عليها كمان - نفس فلسفة تنظيف تستات journal_entry_lines بالظبط
  afterEach(async () => {
    await truncate(db, payrollRunEmployees, payrollRuns);
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
      dbCause(db.update(payrollRunEmployees).set({ gross_pay: 9999 }).where(eq(payrollRunEmployees.payroll_run_id, run.id)))
    ).rejects.toThrow(/مش DRAFT/);
    await expect(
      dbCause(db.delete(payrollRunEmployees).where(eq(payrollRunEmployees.payroll_run_id, run.id)))
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
