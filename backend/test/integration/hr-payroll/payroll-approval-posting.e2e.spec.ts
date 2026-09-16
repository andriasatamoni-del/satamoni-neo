import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e حقيقي بيغطي تالت مسار event-driven في النظام: اعتماد قائمة رواتب (HR & Payroll) ->
// PayrollRunApprovedEvent -> Accounting (subscriber) بيترحّل قيد رواتب تلقائي POSTED متزن على حسابي
// الرواتب/رواتب مستحقة (6100/2400) - نفس فلسفة OrderRegistered->Accounting بالحرف. وبرضه بيثبت إن
// الباج الموروث (قفل شهر للأبد بعد ما يتلغي) اتصلّح فعليًا عبر الـAPI الحقيقي، مش بس على مستوى الريبو.
describe("HR & Payroll - اعتماد قائمة رواتب (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeId: string;
  let salariesExpenseAccountId: string;
  let salariesPayableAccountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyAccountRepository } = await import("../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository");
    const { Account } = await import("../../../src/contexts/accounting/domain/account.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-رواتب-e2e", email: "admin-payroll-e2e@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-payroll-e2e@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const accountRepo = new KyselyAccountRepository(db);
    const expenseAccount = Account.register({ code: "6100", name: "الرواتب", accountType: "EXPENSE", isSystemAccount: true });
    const payableAccount = Account.register({ code: "2400", name: "رواتب مستحقة", accountType: "LIABILITY", isSystemAccount: true });
    await accountRepo.save(expenseAccount);
    await accountRepo.save(payableAccount);
    salariesExpenseAccountId = expenseAccount.id;
    salariesPayableAccountId = payableAccount.id;

    const employee = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-رواتب-e2e", baseSalary: 4000 });
    employeeId = employee.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM accounts WHERE id IN (${sql.join([salariesExpenseAccountId, salariesPayableAccountId])})`.execute(db);
    await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(db);
    await sql`DELETE FROM employees WHERE id = ${employeeId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-payroll-e2e@jest.test'`.execute(db);
    await app.close();
  });

  test("اعتماد قائمة رواتب بينشر حدث بيترحّل قيد رواتب POSTED متزن تلقائي على الرواتب/رواتب مستحقة", async () => {
    const run = await request(app.getHttpServer())
      .post("/hr/payroll-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2031, month: 1, employees: [{ employeeId, grossPay: 4000, bonuses: 200 }] });
    expect(run.status).toBe(201);
    expect(run.body.totalNetPay).toBe(4200);

    const approved = await request(app.getHttpServer())
      .post(`/hr/payroll-runs/${run.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("APPROVED");

    const entries = await request(app.getHttpServer())
      .get("/accounting/journal-entries?sourceType=payroll_run")
      .set("Authorization", `Bearer ${adminToken}`);
    const posted = entries.body.find((e: { sourceId: string }) => e.sourceId === run.body.id);
    expect(posted).toBeTruthy();
    expect(posted.status).toBe("POSTED");
    const expenseLine = posted.lines.find((l: { accountId: string }) => l.accountId === salariesExpenseAccountId);
    const payableLine = posted.lines.find((l: { accountId: string }) => l.accountId === salariesPayableAccountId);
    expect(Number(expenseLine.debit)).toBe(4200);
    expect(Number(payableLine.credit)).toBe(4200);
  });

  test("الباج الموروث اتصلّح فعليًا عبر الـAPI: قائمة اتلغت بترجّع الشهر متاح لقائمة جديدة", async () => {
    const first = await request(app.getHttpServer())
      .post("/hr/payroll-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2032, month: 3, employees: [] });
    await request(app.getHttpServer()).post(`/hr/payroll-runs/${first.body.id}/approve`).set("Authorization", `Bearer ${adminToken}`);

    const duplicateWhileActive = await request(app.getHttpServer())
      .post("/hr/payroll-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2032, month: 3, employees: [] });
    expect(duplicateWhileActive.status).toBe(400); // DuplicatePayrollPeriodError

    await request(app.getHttpServer())
      .post(`/hr/payroll-runs/${first.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "غلط في الحساب" });

    const afterCancel = await request(app.getHttpServer())
      .post("/hr/payroll-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2032, month: 3, employees: [] });
    expect(afterCancel.status).toBe(201); // الشهر رجع متاح
  });
});
