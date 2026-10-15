import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import { eq } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { deliveryAssignments, drivers } from "../../../src/contexts/delivery/infrastructure/persistence/delivery.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import type { Database } from "../../../src/shared/database/database.token";

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

    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const { BranchRepository } = await import(
      "../../../src/contexts/branches/infrastructure/persistence/branch.repository"
    );
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { MenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-توصيل", email: "admin-delivery@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-delivery@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع توصيل-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
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
    const db = app.get<Database>(DATABASE);
    await db.delete(deliveryAssignments);
    await db.delete(drivers);
    await db.delete(printJobs);
    await db.delete(orderItems);
    await db.delete(orders);
    await db.delete(menuItemVariants);
    await db.delete(menuItems);
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-delivery@jest.test"));
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

  test("POST /delivery/assignments لنفس الطلب تاني -> 409 (اتحوّل بالفعل)", async () => {
    const res = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, driverId });
    expect(res.status).toBe(409);
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
    expect(rejected.status).toBe(409);
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
