import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لسلف/جزاءات/مكافآت الموظفين (payroll_adjustments) - راجع تعليق payroll-adjustment.aggregate.ts
// و migration 036: سجل تاريخي دائم، الإلغاء soft-cancel بس مع سبب إجباري (نفس فلسفة الريبو القديم
// بعد HRF-4). التدقيق (مين سجّل/ألغى وإمتى) بيتسجّل تلقائيًا في سجل التدقيق العام - مفيش استدعاء
// يدوي هنا (AuditLogInterceptor)
describe("HR & Payroll - سلف وجزاءات ومكافآت الموظفين (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeId: string;
  let adjustmentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-سلف-جست", email: "admin-payroll-adjustments@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-payroll-adjustments@jest.test", password: "12345678" })
    ).body.token;

    const employeeRes = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-سلف-جست", baseSalary: 4000 });
    employeeId = employeeRes.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM payroll_adjustments WHERE employee_id = ${employeeId}`.execute(db);
    await sql`DELETE FROM employees WHERE id = ${employeeId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-payroll-adjustments@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /hr/adjustments بيسجّل سلفة لموظف حقيقي", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ employeeId, entryDate: "2026-01-05", adjustmentType: "advance", amount: 500, notes: "سلفة طارئة" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.amount).toBe(500);
    adjustmentId = res.body.id;
  });

  test("POST /hr/adjustments لموظف مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/adjustments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ employeeId: "00000000-0000-0000-0000-000000000000", entryDate: "2026-01-05", adjustmentType: "bonus", amount: 100 });
    expect(res.status).toBe(404);
  });

  test("GET /hr/adjustments?employeeId= بيرجّع السجل المسجّل", async () => {
    const res = await request(app.getHttpServer())
      .get(`/hr/adjustments?employeeId=${employeeId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((a: { id: string }) => a.id === adjustmentId)).toBe(true);
  });

  test("POST /hr/adjustments/:id/cancel من غير سبب -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post(`/hr/adjustments/${adjustmentId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("POST /hr/adjustments/:id/cancel بسبب - بيلغي السجل (soft-cancel، مش حذف)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/hr/adjustments/${adjustmentId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "اتسجّلت غلط" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.cancellationReason).toBe("اتسجّلت غلط");

    // السجل لسه موجود (مش محذوف) في القائمة
    const list = await request(app.getHttpServer())
      .get(`/hr/adjustments?employeeId=${employeeId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.find((a: { id: string }) => a.id === adjustmentId).status).toBe("CANCELLED");

    // تسجّل تلقائيًا في سجل التدقيق العام (AuditLogInterceptor) من غير أي استدعاء يدوي
    const audit = await request(app.getHttpServer())
      .get(`/audit-logs?entityType=hr&entityId=${adjustmentId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(audit.body.length).toBeGreaterThan(0);
  });

  test("POST /hr/adjustments/:id/cancel لسجل ملغى بالفعل -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post(`/hr/adjustments/${adjustmentId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "تاني" });
    expect(res.status).toBe(400);
  });
});
