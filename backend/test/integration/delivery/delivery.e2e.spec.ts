import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Delivery & Dispatch - /delivery (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let orderId: string;

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
    const { KyselyBranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyMenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-توصيل", email: "admin-delivery@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-delivery@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع توصيل-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "بيتزا-توصيل-جست" });
    const variant = item.addVariant({ label: "وسط", price: 90 });
    await menuItemRepo.save(item);

    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "delivery", items: [{ variantId: variant.id, quantity: 1 }] });
    orderId = orderRes.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM delivery_assignments`.execute(db);
    await sql`DELETE FROM drivers`.execute(db);
    await sql`DELETE FROM print_jobs`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-delivery@jest.test'`.execute(db);
    await app.close();
  });

  let driverId: string;
  let assignmentId: string;

  test("POST /delivery/drivers - بيعمل سائق جديد", async () => {
    const res = await request(app.getHttpServer())
      .post("/delivery/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سائق-e2e-جست", branchId });
    expect(res.status).toBe(201);
    driverId = res.body.id;
  });

  test("POST /delivery/assignments - بيحوّل الطلب لسائق", async () => {
    const res = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, driverId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ASSIGNED");
    assignmentId = res.body.id;
  });

  test("POST /delivery/assignments لنفس الطلب تاني -> 400 (اتحوّل بالفعل)", async () => {
    const res = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, driverId });
    expect(res.status).toBe(400);
  });

  test("PATCH /delivery/assignments/:id/status - رحلة كاملة لحد التسليم", async () => {
    const outForDelivery = await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "OUT_FOR_DELIVERY" });
    expect(outForDelivery.body.status).toBe("OUT_FOR_DELIVERY");

    const delivered = await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "DELIVERED" });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe("DELIVERED");
    expect(delivered.body.deliveredAt).not.toBeNull();

    const rejected = await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "FAILED" });
    expect(rejected.status).toBe(400);
  });

  test("POST /delivery/assignments بطلب مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId: "00000000-0000-0000-0000-000000000000", driverId });
    expect(res.status).toBe(404);
  });

  test("GET /delivery/assignments?branchId= بيرجّع تكليفات الفرع", async () => {
    const res = await request(app.getHttpServer())
      .get(`/delivery/assignments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
