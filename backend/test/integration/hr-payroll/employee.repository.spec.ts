import type { Database } from "../../../src/shared/database/database.token";
import { EmployeeRepository } from "../../../src/contexts/hr-payroll/infrastructure/persistence/employee.repository";
import { Employee } from "../../../src/contexts/hr-payroll/domain/employee.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { employees } from "../../../src/contexts/hr-payroll/infrastructure/persistence/hr-payroll.tables";

describe("EmployeeRepository", () => {
  let db: Database;
  let repo: EmployeeRepository;

  beforeAll(() => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new EmployeeRepository(db);
  });

  afterAll(async () => {
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(employees);
  });

  test("save بيسجّل موظف، وfindById بيرجّعه بنفس البيانات", async () => {
    const employee = Employee.register({ name: "أحمد-جست", baseSalary: 4000, departmentId: null });
    await repo.save(employee);
    const found = await repo.findById(employee.id);
    expect(found?.name).toBe("أحمد-جست");
    expect(found?.departmentId).toBeNull();
  });

  test("findByLegacyEmployeeId بيلاقيه صح", async () => {
    const employee = Employee.register({ name: "أحمد-جست", legacyEmployeeId: 777 });
    await repo.save(employee);
    expect((await repo.findByLegacyEmployeeId(777))?.id).toBe(employee.id);
  });

  test("save تاني بعد updateDetails/terminate بيحدّث مش يكرر", async () => {
    const employee = Employee.register({ name: "أحمد-جست" });
    await repo.save(employee);
    employee.updateDetails({ name: "أحمد-جست معدّل", baseSalary: 6000 });
    employee.terminate({ date: new Date("2026-01-01"), reason: "استقالة" });
    await repo.save(employee);

    const found = await repo.findById(employee.id);
    expect(found?.name).toBe("أحمد-جست معدّل");
    expect(found?.baseSalary).toBe(6000);
    expect(found?.status).toBe("terminated");
    expect(await repo.list()).toHaveLength(1);
  });

  test("list بيفلتر بالـstatus صح", async () => {
    const active = Employee.register({ name: "أحمد-جست" });
    const terminated = Employee.register({ name: "محمد-جست" });
    terminated.terminate({ date: new Date() });
    await repo.save(active);
    await repo.save(terminated);

    expect(await repo.list({ status: "active" })).toHaveLength(1);
    expect(await repo.list({ status: "terminated" })).toHaveLength(1);
  });
});
