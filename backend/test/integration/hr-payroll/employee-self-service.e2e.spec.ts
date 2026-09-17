import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("HR & Payroll - بوابة الخدمة الذاتية للموظف (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let employeeId: string;
  let employeeToken: string;
  let otherEmployeeId: string;
  let otherEmployeeToken: string;
  let unlinkedUserToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();

    const admin = User.register({ name: "أدمن-ذاتي-جست", email: "admin-self-service@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin" });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-self-service@jest.test", password: "12345678" })).body.token;

    const cashierUser = User.register({ name: "كاشير-ذاتي-جست", email: "cashier-self-service@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier" });
    await userRepo.save(cashierUser);
    employeeToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-self-service@jest.test", password: "12345678" })).body.token;

    const otherUser = User.register({ name: "كاشير-ذاتي-تاني-جست", email: "cashier-self-service-2@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier" });
    await userRepo.save(otherUser);
    otherEmployeeToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-self-service-2@jest.test", password: "12345678" })).body.token;

    const unlinkedUser = User.register({ name: "كاشير-من-غير-ملف-جست", email: "cashier-unlinked-self-service@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier" });
    await userRepo.save(unlinkedUser);
    unlinkedUserToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-unlinked-self-service@jest.test", password: "12345678" })).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع خدمة ذاتية-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const employeeRes = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-ذاتي-جست", baseSalary: 3000, userId: cashierUser.id });
    employeeId = employeeRes.body.id;

    const otherEmployeeRes = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-ذاتي-تاني-جست", baseSalary: 3000, userId: otherUser.id });
    otherEmployeeId = otherEmployeeRes.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM employee_attendance_shifts WHERE employee_id IN (${employeeId}, ${otherEmployeeId})`.execute(db);
    await sql`DELETE FROM employee_leave_requests WHERE employee_id IN (${employeeId}, ${otherEmployeeId})`.execute(db);
    await sql`TRUNCATE payroll_run_employees, payroll_runs CASCADE`.execute(db);
    await sql`DELETE FROM employees WHERE id IN (${employeeId}, ${otherEmployeeId})`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-self-service@jest.test','cashier-self-service@jest.test','cashier-self-service-2@jest.test','cashier-unlinked-self-service@jest.test')`.execute(db);
    await app.close();
  });

  test("GET /hr/self/profile - بيرجّع بيانات الموظف المربوط بالحساب", async () => {
    const res = await request(app.getHttpServer()).get("/hr/self/profile").set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(employeeId);
    expect(res.body.name).toBe("موظف-ذاتي-جست");
  });

  test("GET /hr/self/profile - حساب مش مربوط بملف موظف -> 404", async () => {
    const res = await request(app.getHttpServer()).get("/hr/self/profile").set("Authorization", `Bearer ${unlinkedUserToken}`);
    expect(res.status).toBe(404);
  });

  test("GET /hr/self/payslips - قائمة DRAFT مش بتظهر، وبعد الاعتماد بتظهر", async () => {
    const run = await request(app.getHttpServer())
      .post("/hr/payroll-runs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2033, month: 5, employees: [{ employeeId, grossPay: 3000, bonuses: 100 }] });

    const beforeApprove = await request(app.getHttpServer()).get("/hr/self/payslips").set("Authorization", `Bearer ${employeeToken}`);
    expect(beforeApprove.body).toHaveLength(0);

    await request(app.getHttpServer()).post(`/hr/payroll-runs/${run.body.id}/approve`).set("Authorization", `Bearer ${adminToken}`);

    const afterApprove = await request(app.getHttpServer()).get("/hr/self/payslips").set("Authorization", `Bearer ${employeeToken}`);
    expect(afterApprove.body).toHaveLength(1);
    expect(afterApprove.body[0].netPay).toBe(3100);
  });

  test("طلب إجازة: تسجيل -> عرض -> إلغاء بنفسه", async () => {
    const create = await request(app.getHttpServer())
      .post("/hr/self/leave-requests")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ leaveType: "سنوية", startDate: "2033-06-01", endDate: "2033-06-03", reason: "سفر" });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("PENDING");
    expect(create.body.days).toBe(3);

    const list = await request(app.getHttpServer()).get("/hr/self/leave-requests").set("Authorization", `Bearer ${employeeToken}`);
    expect(list.body.some((r: { id: string }) => r.id === create.body.id)).toBe(true);

    const cancel = await request(app.getHttpServer())
      .post(`/hr/self/leave-requests/${create.body.id}/cancel`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe("CANCELLED");
  });

  test("طلب إجازة موظف تاني -> مينفعش تلغيه (404)", async () => {
    const create = await request(app.getHttpServer())
      .post("/hr/self/leave-requests")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ leaveType: "سنوية", startDate: "2033-07-01", endDate: "2033-07-01" });

    const cancelByOther = await request(app.getHttpServer())
      .post(`/hr/self/leave-requests/${create.body.id}/cancel`)
      .set("Authorization", `Bearer ${otherEmployeeToken}`);
    expect(cancelByOther.status).toBe(404);
  });

  test("مراجعة الإدارة: اعتماد طلب إجازة PENDING", async () => {
    const create = await request(app.getHttpServer())
      .post("/hr/self/leave-requests")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ leaveType: "مرضية", startDate: "2033-08-01", endDate: "2033-08-02" });

    const review = await request(app.getHttpServer())
      .post(`/hr/leave-requests/${create.body.id}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve", notes: "تمام" });
    expect(review.status).toBe(201);
    expect(review.body.status).toBe("APPROVED");

    const secondReview = await request(app.getHttpServer())
      .post(`/hr/leave-requests/${create.body.id}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "reject" });
    expect(secondReview.status).toBe(400); // مش PENDING تاني
  });

  test("حضور: تسجيل دخول -> مينفعش يدخل تاني وهو شغال -> خروج بيحسب ساعات العمل", async () => {
    const checkIn = await request(app.getHttpServer())
      .post("/hr/self/attendance/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ branchId });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.status).toBe("ACTIVE");

    const duplicateCheckIn = await request(app.getHttpServer())
      .post("/hr/self/attendance/check-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ branchId });
    expect(duplicateCheckIn.status).toBe(400);

    const checkOut = await request(app.getHttpServer())
      .post(`/hr/self/attendance/${checkIn.body.id}/check-out`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ notes: "خلصت الشيفت" });
    expect(checkOut.status).toBe(201);
    expect(checkOut.body.status).toBe("CLOSED");
    expect(typeof checkOut.body.hoursWorked).toBe("number");

    const history = await request(app.getHttpServer()).get("/hr/self/attendance").set("Authorization", `Bearer ${employeeToken}`);
    expect(history.body.some((s: { id: string }) => s.id === checkIn.body.id)).toBe(true);
  });

  test("خروج من شيفت موظف تاني -> 404", async () => {
    const checkIn = await request(app.getHttpServer())
      .post("/hr/self/attendance/check-in")
      .set("Authorization", `Bearer ${otherEmployeeToken}`)
      .send({ branchId });

    const checkOutByWrongUser = await request(app.getHttpServer())
      .post(`/hr/self/attendance/${checkIn.body.id}/check-out`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(checkOutByWrongUser.status).toBe(404);

    await request(app.getHttpServer())
      .post(`/hr/self/attendance/${checkIn.body.id}/check-out`)
      .set("Authorization", `Bearer ${otherEmployeeToken}`);
  });
});
