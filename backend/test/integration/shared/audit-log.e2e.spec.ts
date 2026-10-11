import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { deleteAuditLogsForTest } from "../helpers/audit";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { auditLogs } from "../../../src/shared/database/shared.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";

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

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
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
    const database = app.get<Database>(DATABASE);
    await deleteAuditLogsForTest(
      database,
      or(
        eq(auditLogs.actor_user_id, adminId),
        inArray(auditLogs.actor_user_id, database.select({ id: users.id }).from(users).where(eq(users.email, "cashier-audit@jest.test")))
      )
    );
    await deleteAuditLogsForTest(database, and(eq(auditLogs.entity_type, "users"), sql`${auditLogs.metadata}->>'email' = 'not-found@jest.test'`));
    if (branchId) await database.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    if (branchId) await database.delete(branches).where(eq(branches.id, branchId));
    if (createdUserId) await deleteAuditLogsForTest(database, or(eq(auditLogs.actor_user_id, createdUserId), eq(auditLogs.entity_id, createdUserId)));
    if (createdUserId) await database.delete(users).where(eq(users.id, createdUserId));
    await database.delete(users).where(inArray(users.email, ["admin-audit@jest.test", "cashier-audit@jest.test"]));
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

    const db = app.get<Database>(DATABASE);
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.entity_id, branchId)).limit(1);
    expect(row).toBeTruthy();
    expect(row?.actor_user_id).toBe(adminId);
    expect(row?.action).toContain("POST");
    expect(row?.entity_type).toBe("branches");
  });

  test("GET مش بيتسجّل في سجل التدقيق خالص", async () => {
    const db = app.get<Database>(DATABASE);
    const [before] = await db.select({ c: count() }).from(auditLogs);

    await request(app.getHttpServer()).get("/branches").set("Authorization", `Bearer ${adminToken}`);
    await new Promise((r) => setTimeout(r, 100));

    const [after] = await db.select({ c: count() }).from(auditLogs);
    expect(Number(after.c)).toBe(Number(before.c));
  });

  test("محاولة دخول فاشلة بتتسجل LOGIN_FAILED من غير actor", async () => {
    await request(app.getHttpServer()).post("/auth/login").send({ email: "not-found@jest.test", password: "wrong" });
    await new Promise((r) => setTimeout(r, 100));

    const db = app.get<Database>(DATABASE);
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "LOGIN_FAILED"), sql`${auditLogs.metadata}->>'email' = 'not-found@jest.test'`))
      .limit(1);
    expect(row).toBeTruthy();
    expect(row?.actor_user_id).toBeNull();
  });

  test("دخول ناجح بيتسجل LOGIN_SUCCEEDED مع الـuser id الصح", async () => {
    await new Promise((r) => setTimeout(r, 100));
    const db = app.get<Database>(DATABASE);
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "LOGIN_SUCCEEDED"), eq(auditLogs.actor_user_id, adminId)))
      .limit(1);
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
    const db = app.get<Database>(DATABASE);
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.entity_id, createdUserId)).limit(1);
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
