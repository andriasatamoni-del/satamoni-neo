import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لقفل يوم الفرع - بيغطي: checklist أحمر (طلب مفتوح) بيمنع القفل، القفل بيرجع أخضر بعد ما يتحل،
// قفل مزدوج لنفس اليوم -> 409 (نفس فلسفة الريبو القديم - UNIQUE(branch_id, business_date) هي الحماية
// الحقيقية)، والسجل التاريخي بيرجّع اسم اللي قفل
describe("Branch Day Close - قفل يوم الفرع", () => {
  let app: INestApplication;
  let managerToken: string;
  let cashierToken: string;
  let branchId: string;
  let orderId: string;

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

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع قفل-يوم-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const manager = User.register({
      name: "مدير-قفل-يوم-جست", email: "manager-branch-day@jest.test", passwordHash: await hasher.hash("12345678"), role: "branch_manager",
      branchId,
    });
    await userRepo.save(manager);
    managerToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "manager-branch-day@jest.test", password: "12345678" })
    ).body.token;

    const cashier = User.register({
      name: "كاشير-قفل-يوم-جست", email: "cashier-branch-day@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
      branchId,
    });
    await userRepo.save(cashier);
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-branch-day@jest.test", password: "12345678" })
    ).body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM branch_days WHERE branch_id = ${branchId}`.execute(db);
    if (orderId) await sql`DELETE FROM orders WHERE id = ${orderId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('manager-branch-day@jest.test', 'cashier-branch-day@jest.test')`.execute(db);
    await app.close();
  });

  test("GET status لفرع نضيف من غير شيفتات/طلبات -> أخضر وينفع يقفل", async () => {
    const res = await request(app.getHttpServer())
      .get(`/branch-days/${branchId}/status`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.color).toBe("GREEN");
    expect(res.body.canClose).toBe(true);
    expect(res.body.alreadyClosed).toBe(false);
  });

  test("طلب مفتوح (preparing) -> أحمر ومينفعش يقفل", async () => {
    const db = app.get(KYSELY);
    const row = await db
      .insertInto("orders")
      .values({ branch_id: branchId, order_type: "takeaway", total: 150, status: "preparing" })
      .returning("id")
      .executeTakeFirstOrThrow();
    orderId = row.id;

    const statusRes = await request(app.getHttpServer())
      .get(`/branch-days/${branchId}/status`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.color).toBe("RED");
    expect(statusRes.body.canClose).toBe(false);
    expect(statusRes.body.redItems.some((i: { code: string }) => i.code === "OPEN_ORDERS")).toBe(true);

    const closeRes = await request(app.getHttpServer())
      .post(`/branch-days/${branchId}/close`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    expect(closeRes.status).toBe(400);
    expect(closeRes.body.redItems.some((i: { code: string }) => i.code === "OPEN_ORDERS")).toBe(true);
  });

  test("كاشير من غير branch_day.close مينفعش يقفل -> 403", async () => {
    const res = await request(app.getHttpServer())
      .post(`/branch-days/${branchId}/close`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test("بعد ما الطلب يخلص -> أخضر، والقفل بينجح، وقفل تاني بيرجع 409", async () => {
    const db = app.get(KYSELY);
    await db.updateTable("orders").set({ status: "completed" }).where("id", "=", orderId).execute();

    const statusRes = await request(app.getHttpServer())
      .get(`/branch-days/${branchId}/status`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(statusRes.body.color).toBe("GREEN");
    expect(statusRes.body.canClose).toBe(true);
    expect(statusRes.body.todaySummary.totalSales).toBe(150);
    expect(statusRes.body.todaySummary.orderCount).toBe(1);

    const closeRes = await request(app.getHttpServer())
      .post(`/branch-days/${branchId}/close`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ managerNotes: "يوم عادي" });
    expect(closeRes.status).toBe(201);
    expect(closeRes.body.totalSales).toBe(150);
    expect(closeRes.body.orderCount).toBe(1);
    expect(closeRes.body.managerNotes).toBe("يوم عادي");

    const afterStatusRes = await request(app.getHttpServer())
      .get(`/branch-days/${branchId}/status`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(afterStatusRes.body.alreadyClosed).toBe(true);

    const doubleCloseRes = await request(app.getHttpServer())
      .post(`/branch-days/${branchId}/close`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    expect(doubleCloseRes.status).toBe(409);
  });

  test("GET history بيرجّع اليوم المقفول مع اسم اللي قفل", async () => {
    const res = await request(app.getHttpServer())
      .get(`/branch-days/${branchId}/history`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].branchId).toBe(branchId);
    expect(res.body[0].closedByName).toBe("مدير-قفل-يوم-جست");
  });
});
