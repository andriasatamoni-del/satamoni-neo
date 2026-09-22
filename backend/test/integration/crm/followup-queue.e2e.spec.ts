import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لطابور متابعة العملاء (followup-queue) - بيشتغل على أوردرات دليفري حقيقية اتسلّمت فعليًا
// (delivery_assignments.status='DELIVERED') مش بس المستوردة من الريبو القديم (راجع migration 030 -
// customer_followups بقى ليه orderId حقيقي (FK) جنب legacyOrderId)
describe("CRM Followup Queue - /crm/followup-queue", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let orderId: string;
  let driverId: string;
  let assignmentId: string;

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
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-طابور-متابعة-جست", email: "admin-followup-queue@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-followup-queue@jest.test", password: "12345678" })
    ).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع طابور-متابعة-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const menuItemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "ساندوتش-طابور-متابعة-جست" });
    const variant = item.addVariant({ label: "عادي", price: 60 });
    await menuItemRepo.save(item);

    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, orderType: "delivery", items: [{ variantId: variant.id, quantity: 1 }], customerPhone: "01099999999" });
    orderId = orderRes.body.id;

    const driverRes = await request(app.getHttpServer())
      .post("/delivery/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "سائق-طابور-متابعة-جست", branchId });
    driverId = driverRes.body.id;

    const assignmentRes = await request(app.getHttpServer())
      .post("/delivery/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, driverId });
    assignmentId = assignmentRes.body.id;

    await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "OUT_FOR_DELIVERY" });
    await request(app.getHttpServer())
      .patch(`/delivery/assignments/${assignmentId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "DELIVERED" });
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM complaints WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM customer_followups WHERE order_id = ${orderId}`.execute(db);
    await sql`DELETE FROM delivery_assignments WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM drivers WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM print_jobs`.execute(db);
    await sql`DELETE FROM order_items`.execute(db);
    await sql`DELETE FROM orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM menu_item_variants`.execute(db);
    await sql`DELETE FROM menu_items WHERE name = 'ساندوتش-طابور-متابعة-جست'`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-followup-queue@jest.test'`.execute(db);
    await app.close();
  });

  test("GET /crm/followup-queue بيظهر الطلب المتسلّم اللي لسه محتاج مكالمة متابعة", async () => {
    const res = await request(app.getHttpServer())
      .get(`/crm/followup-queue?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { orderId: string }) => r.orderId === orderId);
    expect(row).toBeTruthy();
    expect(row.customerPhone).toBe("01099999999");
    expect(row.lastCallResult).toBeNull();
  });

  test("تسجيل مكالمة no_answer بيسيب الطلب في الطابور", async () => {
    const res = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, customerPhone: "01099999999", callResult: "no_answer" });
    expect(res.status).toBe(201);
    expect(res.body.followup.orderId).toBe(orderId);

    const queueRes = await request(app.getHttpServer())
      .get(`/crm/followup-queue?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const row = queueRes.body.find((r: { orderId: string }) => r.orderId === orderId);
    expect(row).toBeTruthy();
    expect(row.lastCallResult).toBe("no_answer");
  });

  test("تسجيل مكالمة answered بيشيل الطلب من الطابور نهائيًا", async () => {
    const res = await request(app.getHttpServer())
      .post("/crm/followups")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderId, customerPhone: "01099999999", callResult: "answered", satisfactionRating: "good" });
    expect(res.status).toBe(201);

    const queueRes = await request(app.getHttpServer())
      .get(`/crm/followup-queue?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(queueRes.body.some((r: { orderId: string }) => r.orderId === orderId)).toBe(false);
  });
});
