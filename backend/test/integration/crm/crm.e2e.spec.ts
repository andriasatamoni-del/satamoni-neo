import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("CRM & Complaints - /crm (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let callcenterToken: string;

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
    const repo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();

    const admin = User.register({
      name: "أدمن-كرم", email: "admin-crm@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await repo.save(admin);
    const callcenter = User.register({
      name: "كول سنتر-كرم", email: "callcenter-crm@jest.test", passwordHash: await hasher.hash("12345678"), role: "callcenter",
    });
    await repo.save(callcenter);

    const adminLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-crm@jest.test", password: "12345678" });
    adminToken = adminLogin.body.token;

    const callcenterLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "callcenter-crm@jest.test", password: "12345678" });
    callcenterToken = callcenterLogin.body.token;
  });

  afterAll(async () => {
    // بننضّف الصفوف اللي عملناها هنا (complaints/customer_followups بترجع لليوزرز دول بـFK حقيقي)
    // عشان ملفات اختبار تانية بتعمل DELETE شامل على جدول users متتعثرش في constraint violation
    const db = app.get(KYSELY);
    await sql`DELETE FROM complaints`.execute(db);
    await sql`DELETE FROM customer_followups`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-crm@jest.test', 'callcenter-crm@jest.test', 'driver-crm@jest.test')`.execute(db);
    await app.close();
  });

  test("POST /crm/followups من غير توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).post("/crm/followups").send({
      customerPhone: "01011111111", callResult: "answered",
    });
    expect(res.status).toBe(401);
  });

  test("POST /crm/followups بموظف كول سنتر - بيسجّل متابعة وشكوى مرتبطة بيها مع بعض", async () => {
    const res = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${callcenterToken}`)
      .send({
        legacyOrderId: 555,
        customerPhone: "01022222222",
        callResult: "answered",
        satisfactionRating: "bad",
        hasComplaint: true,
        complaint: { category: "wrong_item", description: "أوردر غلط" },
      });
    expect(res.status).toBe(201);
    expect(res.body.followup.hasComplaint).toBe(true);
    expect(res.body.complaint).not.toBeNull();
    expect(res.body.complaint.status).toBe("open");
    expect(res.body.complaint.followupId).toBe(res.body.followup.id);
  });

  test("محاولة اتصال تانية على نفس legacyOrderId بتحدّث نفس المتابعة مش تعمل واحدة جديدة", async () => {
    const first = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${callcenterToken}`)
      .send({ legacyOrderId: 777, customerPhone: "01033333333", callResult: "no_answer" });

    const second = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${callcenterToken}`)
      .send({ legacyOrderId: 777, customerPhone: "01033333333", callResult: "answered", satisfactionRating: "excellent" });

    expect(second.body.followup.id).toBe(first.body.followup.id);
    expect(second.body.followup.callResult).toBe("answered");
  });

  test("POST /crm/followups بنتيجة اتصال مش معروفة -> 400 (validation)", async () => {
    const res = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${callcenterToken}`)
      .send({ customerPhone: "01044444444", callResult: "ghost" });
    expect(res.status).toBe(400);
  });

  test("GET /crm/complaints?status=open بيرجّع الشكاوى المفتوحة بس", async () => {
    const res = await request(app.getHttpServer())
      .get("/crm/complaints?status=open")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((c: { status: string }) => c.status === "open")).toBe(true);
  });

  test("PATCH /crm/complaints/:id بيحل الشكوى ويحط resolvedBy", async () => {
    const created = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${callcenterToken}`)
      .send({
        customerPhone: "01055555555", callResult: "answered", hasComplaint: true,
        complaint: { category: "quality" },
      });
    const complaintId = created.body.complaint.id;

    const res = await request(app.getHttpServer())
      .patch(`/crm/complaints/${complaintId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "resolved", resolutionNotes: "اتحل" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("resolved");
    expect(res.body.resolvedBy).not.toBeNull();
    expect(res.body.resolutionNotes).toBe("اتحل");
  });

  test("PATCH /crm/complaints/:id لشكوى مش موجودة -> 404", async () => {
    const res = await request(app.getHttpServer())
      .patch("/crm/complaints/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "resolved" });
    expect(res.status).toBe(404);
  });

  test("GET /crm/customers/:phone/complaints/latest بيرجّع آخر شكوى للعميل ده", async () => {
    const res = await request(app.getHttpServer())
      .get("/crm/customers/01022222222/complaints/latest")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.customerPhone).toBe("01022222222");
  });

  test("GET /crm/complaints من غير صلاحية crm.complaints.view -> 403", async () => {
    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get(KYSELY);
    const repo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const driver = User.register({
      name: "سواق-كرم", email: "driver-crm@jest.test", passwordHash: await hasher.hash("12345678"), role: "driver",
    });
    await repo.save(driver);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "driver-crm@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer())
      .get("/crm/complaints")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(403);
  });
});
