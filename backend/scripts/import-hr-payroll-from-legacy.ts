// استيراد HR & Payroll من الريبو القديم - الموظفين (employees) وقوائم الرواتب بحالتها التاريخية
// النهائية بالفعل (DRAFT/APPROVED/CANCELLED زي ما هي، مش بيتعاد اعتمادها/إلغاؤها هنا - القيد المحاسبي
// المرتبط بيها مؤجّل نفس فلسفة import-orders-from-legacy.ts: الأثر التاريخي مش المطلوب إعادة توليده).
//
// مؤجّل بالكامل (راجع migration 012_create_hr_payroll_tables.ts): محرك حساب صافي الراتب من الحضور
// (fingerprint_punches)، attendance_records/attendance_punches، employee_leaves/warnings/history/
// fingerprint_codes، payroll_adjustments كجدول منفصل.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyEmployeeRepository } from "../src/contexts/hr-payroll/infrastructure/persistence/kysely-employee.repository";
import { KyselyDepartmentRepository } from "../src/contexts/hr-payroll/infrastructure/persistence/kysely-department.repository";
import { KyselyPositionRepository } from "../src/contexts/hr-payroll/infrastructure/persistence/kysely-position.repository";
import { KyselyPayrollRunRepository } from "../src/contexts/hr-payroll/infrastructure/persistence/kysely-payroll-run.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { Employee } from "../src/contexts/hr-payroll/domain/employee.aggregate";
import { Department } from "../src/contexts/hr-payroll/domain/department.aggregate";
import { Position } from "../src/contexts/hr-payroll/domain/position.aggregate";
import { PayrollRun, type PayrollRunStatus } from "../src/contexts/hr-payroll/domain/payroll-run.aggregate";

interface LegacyDepartmentRow {
  id: number; code: string; name: string; description: string | null; status: string;
}
interface LegacyPositionRow {
  id: number; code: string; name: string; department_id: number | null; description: string | null; status: string;
}
interface LegacyEmployeeRow {
  id: number; user_id: number | null; name: string; department_id: number | null; position_id: number | null;
  hire_date: Date | null; base_salary: string; wage_type: string; hourly_rate: string | null;
  working_days_per_month: number | null; shift: string | null; restricted_branch_id: number | null;
  employee_code: string | null; phone: string | null; notes: string | null; status: string;
  termination_date: Date | null; termination_reason: string | null;
}
interface LegacyPayrollRunRow {
  id: number; year: number; month: number; status: string; created_by: number | null; created_at: Date;
  approved_by: number | null; approved_at: Date | null; cancelled_by: number | null; cancelled_at: Date | null;
  cancellation_reason: string | null;
}
interface LegacyPayrollRunEmployeeRow {
  id: number; payroll_run_id: number; employee_id: number; employee_name: string; branch_id: number | null;
  gross_pay: string; advances: string; penalties: string; bonuses: string;
}

export interface ImportCounts { created: number; updated: number; skipped: number; }
export interface HrPayrollImportResult {
  departments: ImportCounts;
  positions: ImportCounts;
  employees: ImportCounts;
  payrollRuns: ImportCounts;
}

export async function importHrPayrollFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<HrPayrollImportResult> {
  const employeeRepo = new KyselyEmployeeRepository(neoDb);
  const departmentRepo = new KyselyDepartmentRepository(neoDb);
  const positionRepo = new KyselyPositionRepository(neoDb);
  const payrollRunRepo = new KyselyPayrollRunRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);
  const userRepo = new KyselyUserRepository(neoDb);

  const branchIdCache = new Map<number, string | null>();
  async function resolveBranchId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (!branchIdCache.has(legacyId)) branchIdCache.set(legacyId, (await branchRepo.findByLegacyBranchId(legacyId))?.id ?? null);
    return branchIdCache.get(legacyId)!;
  }
  const userIdCache = new Map<number, string | null>();
  async function resolveUserId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (!userIdCache.has(legacyId)) userIdCache.set(legacyId, (await userRepo.findByLegacyUserId(legacyId))?.id ?? null);
    return userIdCache.get(legacyId)!;
  }
  const employeeIdCache = new Map<number, string | null>();
  async function resolveEmployeeId(legacyId: number): Promise<string | null> {
    if (!employeeIdCache.has(legacyId)) employeeIdCache.set(legacyId, (await employeeRepo.findByLegacyEmployeeId(legacyId))?.id ?? null);
    return employeeIdCache.get(legacyId)!;
  }
  const departmentIdCache = new Map<number, string | null>();
  async function resolveDepartmentId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (!departmentIdCache.has(legacyId)) departmentIdCache.set(legacyId, (await departmentRepo.findByLegacyDepartmentId(legacyId))?.id ?? null);
    return departmentIdCache.get(legacyId)!;
  }
  const positionIdCache = new Map<number, string | null>();
  async function resolvePositionId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (!positionIdCache.has(legacyId)) positionIdCache.set(legacyId, (await positionRepo.findByLegacyPositionId(legacyId))?.id ?? null);
    return positionIdCache.get(legacyId)!;
  }

  // 1) الأقسام - راجع فلسفة HRF-6 بالريبو القديم بالحرف (department.aggregate.ts)
  const departments: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: departmentRows } = await legacyPool.query<LegacyDepartmentRow>(
    `SELECT id, code, name, description, status FROM departments ORDER BY id`
  );
  for (const row of departmentRows) {
    const existing = await departmentRepo.findByLegacyDepartmentId(row.id);
    try {
      if (existing) {
        existing.update({ name: row.name, description: row.description, status: row.status as "active" | "inactive" });
        await departmentRepo.save(existing);
        departments.updated++;
      } else {
        const department = Department.register({ code: row.code, name: row.name, description: row.description, legacyDepartmentId: row.id });
        if (row.status === "inactive") department.update({ status: "inactive" });
        await departmentRepo.save(department);
        departments.created++;
      }
    } catch (err) {
      console.warn(`⚠ تخطّي قسم legacy_id=${row.id} (${row.name}): ${(err as Error).message}`);
      departments.skipped++;
    }
  }

  // 2) المسميات الوظيفية
  const positions: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: positionRows } = await legacyPool.query<LegacyPositionRow>(
    `SELECT id, code, name, department_id, description, status FROM positions ORDER BY id`
  );
  for (const row of positionRows) {
    const departmentId = await resolveDepartmentId(row.department_id);
    const existing = await positionRepo.findByLegacyPositionId(row.id);
    try {
      if (existing) {
        existing.update({ name: row.name, departmentId, description: row.description, status: row.status as "active" | "inactive" });
        await positionRepo.save(existing);
        positions.updated++;
      } else {
        const position = Position.register({ code: row.code, name: row.name, departmentId, description: row.description, legacyPositionId: row.id });
        if (row.status === "inactive") position.update({ status: "inactive" });
        await positionRepo.save(position);
        positions.created++;
      }
    } catch (err) {
      console.warn(`⚠ تخطّي مسمى وظيفي legacy_id=${row.id} (${row.name}): ${(err as Error).message}`);
      positions.skipped++;
    }
  }

  // 3) الموظفين
  const employees: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: employeeRows } = await legacyPool.query<LegacyEmployeeRow>(
    `SELECT id, user_id, name, department_id, position_id, hire_date, base_salary, wage_type, hourly_rate,
            working_days_per_month, shift, restricted_branch_id, employee_code, phone, notes, status,
            termination_date, termination_reason
     FROM employees ORDER BY id`
  );
  for (const row of employeeRows) {
    const userId = await resolveUserId(row.user_id);
    const restrictedBranchId = await resolveBranchId(row.restricted_branch_id);
    const departmentId = await resolveDepartmentId(row.department_id);
    const positionId = await resolvePositionId(row.position_id);
    const existing = await employeeRepo.findByLegacyEmployeeId(row.id);
    try {
      if (existing) {
        existing.updateDetails({
          name: row.name, departmentId, positionId, hireDate: row.hire_date,
          baseSalary: Number(row.base_salary), wageType: row.wage_type,
          hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
          workingDaysPerMonth: row.working_days_per_month, shift: row.shift,
          restrictedBranchId, employeeCode: row.employee_code, phone: row.phone, notes: row.notes,
        });
        if (row.status === "terminated") existing.terminate({ date: row.termination_date ?? new Date(), reason: row.termination_reason });
        else existing.setStatus(row.status);
        await employeeRepo.save(existing);
        employees.updated++;
      } else {
        const employee = Employee.register({
          userId, name: row.name, departmentId, positionId, hireDate: row.hire_date,
          baseSalary: Number(row.base_salary), wageType: row.wage_type,
          hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
          workingDaysPerMonth: row.working_days_per_month, shift: row.shift,
          restrictedBranchId, employeeCode: row.employee_code, phone: row.phone, notes: row.notes,
          legacyEmployeeId: row.id,
        });
        if (row.status === "terminated") employee.terminate({ date: row.termination_date ?? new Date(), reason: row.termination_reason });
        else if (row.status !== "active") employee.setStatus(row.status);
        await employeeRepo.save(employee);
        employees.created++;
      }
    } catch (err) {
      console.warn(`⚠ تخطّي موظف legacy_id=${row.id} (${row.name}): ${(err as Error).message}`);
      employees.skipped++;
    }
  }

  // 4) قوائم الرواتب بسطورها - بحالتها التاريخية النهائية زي ما هي (مش re-approve/re-cancel)
  const payrollRuns: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: runRows } = await legacyPool.query<LegacyPayrollRunRow>(
    `SELECT id, year, month, status, created_by, created_at, approved_by, approved_at, cancelled_by,
            cancelled_at, cancellation_reason
     FROM payroll_runs ORDER BY id`
  );
  const { rows: runEmployeeRows } = await legacyPool.query<LegacyPayrollRunEmployeeRow>(
    `SELECT id, payroll_run_id, employee_id, employee_name, branch_id, gross_pay, advances, penalties, bonuses
     FROM payroll_run_employees ORDER BY id`
  );
  const employeesByRun = new Map<number, LegacyPayrollRunEmployeeRow[]>();
  for (const e of runEmployeeRows) {
    const list = employeesByRun.get(e.payroll_run_id) ?? [];
    list.push(e);
    employeesByRun.set(e.payroll_run_id, list);
  }

  for (const row of runRows) {
    const existing = await payrollRunRepo.findByLegacyPayrollRunId(row.id);
    if (existing) {
      payrollRuns.updated++; // قوائم الرواتب التاريخية مبتتغيّرش - بس بنعدّها كإشارة "شغال زي المتوقع"
      continue;
    }

    const lines: { id: string; employeeId: string; employeeName: string; branchId: string | null; grossPay: number; advances: number; penalties: number; bonuses: number; netPay: number }[] = [];
    for (const e of employeesByRun.get(row.id) ?? []) {
      const employeeId = await resolveEmployeeId(e.employee_id);
      if (!employeeId) {
        console.warn(`⚠ تخطّي سطر موظف legacy_id=${e.employee_id} في قائمة رواتب legacy_id=${row.id} - الموظف مش مستورد لسه`);
        continue;
      }
      const grossPay = Number(e.gross_pay);
      const advances = Number(e.advances);
      const penalties = Number(e.penalties);
      const bonuses = Number(e.bonuses);
      lines.push({
        id: randomUUID(), employeeId, employeeName: e.employee_name,
        branchId: await resolveBranchId(e.branch_id), grossPay, advances, penalties, bonuses,
        netPay: grossPay - advances - penalties + bonuses,
      });
    }

    try {
      const run = PayrollRun.reconstitute(randomUUID(), {
        year: row.year,
        month: row.month,
        status: row.status as PayrollRunStatus,
        employees: lines,
        totalNetPay: lines.reduce((sum, l) => sum + l.netPay, 0),
        createdBy: await resolveUserId(row.created_by),
        createdAt: row.created_at,
        approvedBy: await resolveUserId(row.approved_by),
        approvedAt: row.approved_at,
        cancelledBy: await resolveUserId(row.cancelled_by),
        cancelledAt: row.cancelled_at,
        cancellationReason: row.cancellation_reason,
        legacyPayrollRunId: row.id,
      });
      await payrollRunRepo.save(run);
      payrollRuns.created++;
    } catch (err) {
      console.warn(`⚠ تخطّي قائمة رواتب legacy_id=${row.id} (${row.month}/${row.year}): ${(err as Error).message}`);
      payrollRuns.skipped++;
    }
  }

  return { departments, positions, employees, payrollRuns };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl, ssl: pgSslOption() });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }) });

  const result = await importHrPayrollFromLegacy(legacyPool, neoDb);
  console.log("✅ الاستيراد خلص:");
  console.log(`  الأقسام: ${result.departments.created} جديد، ${result.departments.updated} اتحدّث، ${result.departments.skipped} اتخطّى`);
  console.log(`  المسميات الوظيفية: ${result.positions.created} جديد، ${result.positions.updated} اتحدّث، ${result.positions.skipped} اتخطّى`);
  console.log(`  الموظفين: ${result.employees.created} جديد، ${result.employees.updated} اتحدّث، ${result.employees.skipped} اتخطّى`);
  console.log(`  قوائم الرواتب: ${result.payrollRuns.created} جديد، ${result.payrollRuns.updated} اتحدّث، ${result.payrollRuns.skipped} اتخطّى`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
