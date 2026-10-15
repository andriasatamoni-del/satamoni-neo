import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq, inArray } from "drizzle-orm";
import { branchDays } from "../../../src/contexts/branch-day/infrastructure/persistence/branch-day.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import type { Database } from "../../../src/shared/database/database.token";

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

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع قفل-يوم-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const manager = User.register({
      name: "مدير-قفل-يوم-جست", email: "manager-branch-day@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["branch_manager"],
      branchId,
    });
    await userRepo.save(manager);
    managerToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "manager-branch-day@jest.test", password: "12345678" })
    ).body.token;

    const cashier = User.register({
      name: "كاشير-قفل-يوم-جست", email: "cashier-branch-day@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["cashier"],
      branchId,
    });
    await userRepo.save(cashier);
    cashierToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-branch-day@jest.test", password: "12345678" })
    ).body.token;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(branchDays).where(eq(branchDays.branch_id, branchId));
    if (orderId) await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(inArray(users.email, ["manager-branch-day@jest.test", "cashier-branch-day@jest.test"]));
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
    const db = app.get<Database>(DATABASE);
    const [row] = await db
      .insert(orders)
      .values({ branch_id: branchId, order_type: "takeaway", total: 150, status: "preparing" })
      .returning({ id: orders.id });
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
    const db = app.get<Database>(DATABASE);
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, orderId));

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
