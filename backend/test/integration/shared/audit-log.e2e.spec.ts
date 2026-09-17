import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Audit Log - سجل التدقيق العام (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: string;
  let cashierToken: string;
  let branchId: string;
  let createdUserId: string;

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

    const admin = User.register({ name: "أدمن-تدقيق-جست", email: "admin-audit@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin" });
    await userRepo.save(admin);
    adminId = admin.id;
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-audit@jest.test", password: "12345678" })).body.token;

    const cashier = User.register({ name: "كاشير-تدقيق-جست", email: "cashier-audit@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier" });
    await userRepo.save(cashier);
    cashierToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-audit@jest.test", password: "12345678" })).body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM audit_logs WHERE actor_user_id IN (${adminId}, ${sql.raw(
      "(SELECT id FROM users WHERE email = 'cashier-audit@jest.test')"
    )})`.execute(db);
    await sql`DELETE FROM audit_logs WHERE entity_type = 'users' AND metadata->>'email' = 'not-found@jest.test'`.execute(db);
    if (branchId) await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    if (branchId) await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    if (createdUserId) await sql`DELETE FROM audit_logs WHERE actor_user_id = ${createdUserId} OR entity_id = ${createdUserId}`.execute(db);
    if (createdUserId) await sql`DELETE FROM users WHERE id = ${createdUserId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-audit@jest.test','cashier-audit@jest.test')`.execute(db);
    await app.close();
  });

  test("POST بينجح بيسجّل سطر تدقيق فيه actor/action/entityType/entityId صح", async () => {
    const branchName = "فرع تدقيق-جست";
    const res = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: branchName });
    expect(res.status).toBe(201);
    branchId = res.body.id;

    await new Promise((r) => setTimeout(r, 100)); // الكتابة async/fire-and-forget

    const db = app.get(KYSELY);
    const row = await db.selectFrom("audit_logs").selectAll().where("entity_id", "=", branchId).executeTakeFirst();
    expect(row).toBeTruthy();
    expect(row?.actor_user_id).toBe(adminId);
    expect(row?.action).toContain("POST");
    expect(row?.entity_type).toBe("branches");
  });

  test("GET مش بيتسجّل في سجل التدقيق خالص", async () => {
    const db = app.get(KYSELY);
    const before = (await db.selectFrom("audit_logs").select(db.fn.countAll().as("c")).executeTakeFirst()) as { c: string };

    await request(app.getHttpServer()).get("/branches").set("Authorization", `Bearer ${adminToken}`);
    await new Promise((r) => setTimeout(r, 100));

    const after = (await db.selectFrom("audit_logs").select(db.fn.countAll().as("c")).executeTakeFirst()) as { c: string };
    expect(Number(after.c)).toBe(Number(before.c));
  });

  test("محاولة دخول فاشلة بتتسجل LOGIN_FAILED من غير actor", async () => {
    await request(app.getHttpServer()).post("/auth/login").send({ email: "not-found@jest.test", password: "wrong" });
    await new Promise((r) => setTimeout(r, 100));

    const db = app.get(KYSELY);
    const row = await db
      .selectFrom("audit_logs")
      .selectAll()
      .where("action", "=", "LOGIN_FAILED")
      .where(sql<boolean>`metadata->>'email' = 'not-found@jest.test'`)
      .executeTakeFirst();
    expect(row).toBeTruthy();
    expect(row?.actor_user_id).toBeNull();
  });

  test("دخول ناجح بيتسجل LOGIN_SUCCEEDED مع الـuser id الصح", async () => {
    await new Promise((r) => setTimeout(r, 100));
    const db = app.get(KYSELY);
    const row = await db
      .selectFrom("audit_logs")
      .selectAll()
      .where("action", "=", "LOGIN_SUCCEEDED")
      .where("actor_user_id", "=", adminId)
      .executeTakeFirst();
    expect(row).toBeTruthy();
  });

  test("حقول حساسة زي الباسورد بتتخفى (***) في الـmetadata", async () => {
    const res = await request(app.getHttpServer())
      .post("/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مستخدم-تدقيق-جست", email: "created-by-audit-test@jest.test", password: "secret12345", role: "cashier" });
    expect(res.status).toBe(201);
    createdUserId = res.body.id;

    await new Promise((r) => setTimeout(r, 100));
    const db = app.get(KYSELY);
    const row = await db.selectFrom("audit_logs").selectAll().where("entity_id", "=", createdUserId).executeTakeFirst();
    expect(row).toBeTruthy();
    const metadata = row?.metadata as { password?: string } | null;
    expect(metadata?.password).toBe("***");
  });

  test("GET /audit-logs بيرجع سجل التدقيق للأدمن، وممنوع على كاشير من غير audit.view", async () => {
    const asAdmin = await request(app.getHttpServer())
      .get(`/audit-logs?entityType=branches&entityId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.some((r: { entityId: string }) => r.entityId === branchId)).toBe(true);

    const asCashier = await request(app.getHttpServer()).get("/audit-logs").set("Authorization", `Bearer ${cashierToken}`);
    expect(asCashier.status).toBe(403);
  });
});
