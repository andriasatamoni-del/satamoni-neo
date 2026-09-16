import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importHrPayrollFromLegacy } from "../../../scripts/import-hr-payroll-from-legacy";
import { KyselyEmployeeRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/kysely-employee.repository";
import { KyselyPayrollRunRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/kysely-payroll-run.repository";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importHrPayrollFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let employeeRepo: KyselyEmployeeRepository;
  let payrollRunRepo: KyselyPayrollRunRepository;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS payroll_run_employees, payroll_runs, employees");
    await legacyPool.query(`
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY, user_id INTEGER, name TEXT NOT NULL, department TEXT, job_title TEXT,
        hire_date DATE, base_salary NUMERIC NOT NULL DEFAULT 0, wage_type TEXT NOT NULL DEFAULT 'fixed_monthly',
        hourly_rate NUMERIC, working_days_per_month INTEGER, shift TEXT, restricted_branch_id INTEGER,
        employee_code TEXT, phone TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'active',
        termination_date DATE, termination_reason TEXT
      )
    `);
    await legacyPool.query(`
      CREATE TABLE payroll_runs (
        id SERIAL PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
        created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), approved_by INTEGER, approved_at TIMESTAMPTZ,
        cancelled_by INTEGER, cancelled_at TIMESTAMPTZ, cancellation_reason TEXT
      )
    `);
    await legacyPool.query(`
      CREATE TABLE payroll_run_employees (
        id SERIAL PRIMARY KEY, payroll_run_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, employee_name TEXT NOT NULL,
        branch_id INTEGER, gross_pay NUMERIC NOT NULL DEFAULT 0, advances NUMERIC NOT NULL DEFAULT 0,
        penalties NUMERIC NOT NULL DEFAULT 0, bonuses NUMERIC NOT NULL DEFAULT 0
      )
    `);

    neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    employeeRepo = new KyselyEmployeeRepository(neoDb);
    payrollRunRepo = new KyselyPayrollRunRepository(neoDb);
    await sql`DELETE FROM employees`.execute(neoDb);
  });

  afterAll(async () => {
    await legacyPool.end();
    await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(neoDb);
    await sql`DELETE FROM employees`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM payroll_run_employees");
    await legacyPool.query("DELETE FROM payroll_runs");
    await legacyPool.query("DELETE FROM employees");
    await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(neoDb);
    await sql`DELETE FROM employees`.execute(neoDb);
  });

  test("بيستورد موظف + قائمة رواتب APPROVED بحالتها التاريخية النهائية بسطرها", async () => {
    await legacyPool.query(`INSERT INTO employees (name, base_salary) VALUES ('موظف-استيراد-رواتب-جست', 4000)`);
    await legacyPool.query(
      `INSERT INTO payroll_runs (year, month, status, approved_at) VALUES (2028, 1, 'APPROVED', now())`
    );
    await legacyPool.query(
      `INSERT INTO payroll_run_employees (payroll_run_id, employee_id, employee_name, gross_pay, bonuses)
       VALUES (1, 1, 'موظف-استيراد-رواتب-جست', 4000, 200)`
    );

    const result = await importHrPayrollFromLegacy(legacyPool, neoDb);
    expect(result.employees).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.payrollRuns).toEqual({ created: 1, updated: 0, skipped: 0 });

    const employee = await employeeRepo.findByLegacyEmployeeId(1);
    expect(employee?.name).toBe("موظف-استيراد-رواتب-جست");

    const run = await payrollRunRepo.findByLegacyPayrollRunId(1);
    expect(run?.status).toBe("APPROVED");
    expect(run?.employees).toHaveLength(1);
    expect(run?.totalNetPay).toBe(4200);
  });

  test("تشغيلة تانية بنفس البيانات - الموظف بيتحدّث، قائمة الرواتب بتتعدّ idempotent من غير تكرار", async () => {
    await legacyPool.query(`INSERT INTO employees (name, base_salary) VALUES ('موظف-استيراد-رواتب-جست', 4000)`);
    await legacyPool.query(`INSERT INTO payroll_runs (year, month, status) VALUES (2028, 2, 'DRAFT')`);
    const first = await importHrPayrollFromLegacy(legacyPool, neoDb);
    expect(first.employees).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(first.payrollRuns).toEqual({ created: 1, updated: 0, skipped: 0 });

    await legacyPool.query(`UPDATE employees SET name = 'موظف-استيراد-رواتب-جست معدّل'`);
    const second = await importHrPayrollFromLegacy(legacyPool, neoDb);
    expect(second.employees).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(second.payrollRuns).toEqual({ created: 0, updated: 1, skipped: 0 });

    const employees = await employeeRepo.list();
    expect(employees).toHaveLength(1);
    expect(employees[0].name).toBe("موظف-استيراد-رواتب-جست معدّل");
  });

  test("بيتخطّى سطر موظف مش مستورد لسه في قائمة رواتب، من غير ما يوقف باقي الاستيراد", async () => {
    const { rows: [{ id: legacyRunId }] } = await legacyPool.query<{ id: number }>(
      `INSERT INTO payroll_runs (year, month, status) VALUES (2028, 3, 'DRAFT') RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO payroll_run_employees (payroll_run_id, employee_id, employee_name, gross_pay) VALUES ($1, 999999, 'موظف مش موجود', 1000)`,
      [legacyRunId]
    );

    const result = await importHrPayrollFromLegacy(legacyPool, neoDb);
    expect(result.payrollRuns).toEqual({ created: 1, updated: 0, skipped: 0 }); // القائمة نفسها بتتسجّل، بس بلا السطر ده
    const run = await payrollRunRepo.findByLegacyPayrollRunId(legacyRunId);
    expect(run?.employees).toHaveLength(0);
    expect(run?.totalNetPay).toBe(0);
  });
});
