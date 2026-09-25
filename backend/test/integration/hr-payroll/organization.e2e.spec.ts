import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e للهيكل التنظيمي (departments/positions) - نفس فلسفة HRF-6 بالريبو القديم بالحرف: أقسام ومسميات
// وظيفية حقيقية بدل نص حر على employees.department/job_title، وربط الموظف بيهم عن طريق
// departmentId/positionId وقت التسجيل
describe("HR & Payroll - الهيكل التنظيمي (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let departmentId: string;
  let positionId: string;

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
      name: "أدمن-تنظيمي-جست", email: "admin-organization@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-organization@jest.test", password: "12345678" })
    ).body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM employees WHERE name LIKE '%تنظيمي-جست%'`.execute(db);
    await sql`DELETE FROM positions WHERE code LIKE '%TEST-ORG-JEST%'`.execute(db);
    await sql`DELETE FROM departments WHERE code LIKE '%TEST-ORG-JEST%'`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-organization@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /hr/departments بيسجّل قسم جديد", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "KITCHEN-TEST-ORG-JEST", name: "المطبخ-تنظيمي-جست" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
    departmentId = res.body.id;
  });

  test("POST /hr/departments بنفس الكود -> 409", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "KITCHEN-TEST-ORG-JEST", name: "قسم تاني-تنظيمي-جست" });
    expect(res.status).toBe(409);
  });

  test("PATCH /hr/departments/:id بيعطّل القسم", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/hr/departments/${departmentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "inactive" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inactive");

    // نرجّعه نشط تاني عشان باقي التيست
    await request(app.getHttpServer()).patch(`/hr/departments/${departmentId}`).set("Authorization", `Bearer ${adminToken}`).send({ status: "active" });
  });

  test("POST /hr/positions بيسجّل مسمى وظيفي مرتبط بالقسم", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "CHEF-TEST-ORG-JEST", name: "شيف-تنظيمي-جست", departmentId });
    expect(res.status).toBe(201);
    expect(res.body.departmentId).toBe(departmentId);
    positionId = res.body.id;
  });

  test("POST /hr/positions بقسم مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/positions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "GHOST-TEST-ORG-JEST", name: "وهمي-تنظيمي-جست", departmentId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  test("GET /hr/departments و/hr/positions بيرجّعوا اللي اتسجّل", async () => {
    const departments = await request(app.getHttpServer()).get("/hr/departments").set("Authorization", `Bearer ${adminToken}`);
    expect(departments.body.some((d: { id: string }) => d.id === departmentId)).toBe(true);

    const positions = await request(app.getHttpServer()).get(`/hr/positions?departmentId=${departmentId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(positions.body.some((p: { id: string }) => p.id === positionId)).toBe(true);
  });

  test("POST /hr/employees بـdepartmentId/positionId - بيسجّل الموظف مربوط بيهم", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-تنظيمي-جست", baseSalary: 3500, departmentId, positionId });
    expect(res.status).toBe(201);
    expect(res.body.departmentId).toBe(departmentId);
    expect(res.body.positionId).toBe(positionId);
  });

  test("POST /hr/employees بقسم مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/hr/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "موظف-وهمي-تنظيمي-جست", departmentId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });
});
