import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لسجل تغييرات الموظف (employee_history) وتبعات إنهاء الخدمة (بنود معلّقة + تعطيل حساب الدخول) -
// راجع تعليق set-employee-status.handler.ts وupdate-employee.handler.ts: نفس منطق
// db/employee-termination.js وdb/employee-history.js بالريبو القديم، مع قرارات نطاق موثّقة (مفيش بند
// "مديون للشركة" أو بنود السائق المرتبط - راجع تعليق termination-blockers.service.ts)
describe("HR & Payroll - سجل تغييرات الموظف وتبعات إنهاء الخدمة (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let accountantToken: string;
  let cashierToken: string;
  let branchId: string;
  let departmentId: string;
  let positionId: string;
  let cashierUserId: string;
  let employeeWithUserId: string;
  let employeeNoUserId: string;
  let shiftId: string;
  let payrollRunId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();

    const admin = User.register({
      name: "أدمن-تاريخ-موظف-جست", email: "admin-emphist@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-emphist@jest.test", password: "12345678" })).body.token;

    const accountant = User.register({
      name: "محاسب-تاريخ-موظف-جست", email: "accountant-emphist@jest.test", passwordHash: await hasher.hash("12345678"), role: "accountant",
    });
    await userRepo.save(accountant);
    accountantToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "accountant-emphist@jest.test", password: "12345678" })).body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع-تاريخ-موظف-جست" });
    branchId = branchRes.body.id;

    const cashierUser = User.register({
      name: "كاشير-تاريخ-موظف-جست", email: "cashier-emphist@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
      branchId,
    });
    await userRepo.save(cashierUser);
    cashierUserId = cashierUser.id;
    cashierToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-emphist@jest.test", password: "12345678" })).body.token;

    const deptRes = await request(app.getHttpServer())
      .post("/hr/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "DEPT-EMPHIST-جست", name: "قسم-تاريخ-موظف-جست" });
    departmentId = deptRes.body.id;

    const posRes = await request(app.getHttpServer())
      .post("/hr/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "POS-EMPHIST-جست", name: "وظيفة-تاريخ-موظف-جست" });
    positionId = posRes.body.id;

    const emp1Res = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-مرتبط-بحساب-جست", userId: cashierUserId, baseSalary: 3000 });
    employeeWithUserId = emp1Res.body.id;

    const emp2Res = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-بدون-حساب-جست", baseSalary: 4000 });
    employeeNoUserId = emp2Res.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM employee_history WHERE employee_id IN (${employeeWithUserId}, ${employeeNoUserId})`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    if (payrollRunId) await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(db);
    if (shiftId) await sql`DELETE FROM cash_drawer_entries WHERE shift_id = ${shiftId}`.execute(db);
    if (shiftId) await sql`DELETE FROM cashier_shifts WHERE id = ${shiftId}`.execute(db);
    await sql`DELETE FROM employees WHERE id IN (${employeeWithUserId}, ${employeeNoUserId})`.execute(db);
    await sql`DELETE FROM positions WHERE id = ${positionId}`.execute(db);
    await sql`DELETE FROM departments WHERE id = ${departmentId}`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-emphist@jest.test', 'accountant-emphist@jest.test', 'cashier-emphist@jest.test')`.execute(db);
    await app.close();
  });

  test("PATCH /hr/employees/:id - تعديل القسم والوظيفة بيتسجّل في employee_history", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeNoUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId, positionId, reason: "إعادة هيكلة" });
    expect(res.status).toBe(200);
    expect(res.body.departmentId).toBe(departmentId);
    expect(res.body.positionId).toBe(positionId);

    const historyRes = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeNoUserId}/history`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(historyRes.status).toBe(200);
    const deptEntry = historyRes.body.find((h: { fieldName: string }) => h.fieldName === "department_id");
    const posEntry = historyRes.body.find((h: { fieldName: string }) => h.fieldName === "position_id");
    expect(deptEntry.newValue).toBe(departmentId);
    expect(deptEntry.oldValue).toBeNull();
    expect(deptEntry.reason).toBe("إعادة هيكلة");
    expect(posEntry.newValue).toBe(positionId);
  });

  test("PATCH /hr/employees/:id بنفس القيم تاني - مفيش سطر تاني يتسجّل (مش كل PATCH تغيير فعلي)", async () => {
    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeNoUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId });
    const historyRes = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeNoUserId}/history`)
      .set("Authorization", `Bearer ${adminToken}`);
    const deptEntries = historyRes.body.filter((h: { fieldName: string }) => h.fieldName === "department_id");
    expect(deptEntries.length).toBe(1);
  });

  test("PATCH /hr/employees/:id بنقل فرع (restrictedBranchId) - محاسب (مش أدمن) بيرجّع 403", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeNoUserId}`)
      .set("Authorization", `Bearer ${accountantToken}`)
      .send({ restrictedBranchId: branchId });
    expect(res.status).toBe(403);
  });

  test("PATCH /hr/employees/:id بنقل فرع - أدمن بينجح", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeNoUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ restrictedBranchId: branchId });
    expect(res.status).toBe(200);
    expect(res.body.restrictedBranchId).toBe(branchId);
  });

  test("إنهاء خدمة موظف عنده شيفت شغال - بيترفض 409 مع OPEN_SHIFT blocker", async () => {
    const shiftRes = await request(app.getHttpServer())
      .post("/shifts/open")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId, openingCash: 100 });
    expect(shiftRes.status).toBe(201);
    shiftId = shiftRes.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeWithUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "terminated", terminationReason: "استقالة" });
    expect(res.status).toBe(409);
    expect(res.body.blockers.some((b: { code: string }) => b.code === "OPEN_SHIFT")).toBe(true);
  });

  test("إنهاء خدمة موظف مع acknowledgeBlockers:true - بينفّذ ويعطّل حساب الدخول المرتبط", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeWithUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "terminated", terminationReason: "استقالة", acknowledgeBlockers: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("terminated");
    expect(res.body.terminationCascade.userDisabled).toBe(true);

    // حساب الدخول المرتبط اتعطّل فعليًا - محاولة تسجيل دخول جديدة تفشل
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "cashier-emphist@jest.test", password: "12345678" });
    expect(loginRes.status).toBe(401);

    const historyRes = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeWithUserId}/history`)
      .set("Authorization", `Bearer ${adminToken}`);
    const statusEntry = historyRes.body.find((h: { fieldName: string }) => h.fieldName === "status");
    expect(statusEntry.oldValue).toBe("active");
    expect(statusEntry.newValue).toBe("terminated");
    expect(statusEntry.reason).toBeNull();
  });

  test("إنهاء خدمة موظف عنده تشغيلة راتب معتمدة - بيترفض 409 مع UNPAID_PAYROLL blocker", async () => {
    const runRes = await request(app.getHttpServer())
      .post("/hr/payroll-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2031, month: 1, employees: [{ employeeId: employeeNoUserId, branchId, grossPay: 4000 }] });
    expect(runRes.status).toBe(201);
    payrollRunId = runRes.body.id;

    await request(app.getHttpServer())
      .post(`/hr/payroll-runs/${payrollRunId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    const res = await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeNoUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "terminated", terminationReason: "إنهاء تجريبي" });
    expect(res.status).toBe(409);
    expect(res.body.blockers.some((b: { code: string }) => b.code === "UNPAID_PAYROLL")).toBe(true);
  });

  test("GET /hr/employees/:id/history - مرتّب من الأحدث، مع اسم مين غيّر", async () => {
    const res = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeNoUserId}/history`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].changedByName).toBe("أدمن-تاريخ-موظف-جست");
  });
});
