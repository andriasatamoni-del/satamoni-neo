import "reflect-metadata";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// CHAN-1: رسايل SMS للعميل (تأكيد + طلب تقييم) - بوابة SMS حقيقية بـHTTP (سيرفر محلي في الاختبار)
describe("Notifications - رسايل العميل التلقائية (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;
  let gateway: Server;
  let gatewayUrl: string;
  let gatewayStatus = 200;
  const received: { to: string; message: string; auth?: string }[] = [];

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function createOrder(orderType: string, customerPhone?: string): Promise<string> {
    const res = await request(server())
      .post("/orders")
      .set(auth())
      .send({ branchId, orderType, customerPhone, customerName: "عميل-رسايل-جست", addressDetails: "شارع 1", items: [{ variantId, quantity: 2 }] });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function notificationsFor(orderId: string) {
    const db = app.get(KYSELY);
    return db.selectFrom("order_notifications").selectAll().where("order_id", "=", orderId).orderBy("created_at").execute();
  }

  async function setSettings(body: Record<string, boolean>) {
    const res = await request(server()).patch("/pos-settings").set(auth()).send(body);
    expect(res.status).toBe(200);
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
  }

  beforeAll(async () => {
    gateway = createServer(async (req, res) => {
      const body = JSON.parse((await readBody(req)) || "{}");
      received.push({ ...body, auth: req.headers.authorization });
      res.statusCode = gatewayStatus;
      res.end("{}");
    });
    await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/send`;

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
    await new KyselyUserRepository(db).save(
      User.register({ name: "أدمن-رسايل-جست", email: "admin-notify@jest.test", passwordHash: await new BcryptPasswordHasher().hash("12345678"), role: "admin" })
    );
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-notify@jest.test", password: "12345678" })).body.token;

    const branch = Branch.register({ name: "فرع-رسايل-جست" });
    await new KyselyBranchRepository(db).save(branch);
    branchId = branch.id;

    const item = MenuItem.register({ name: "صنف-رسايل-جست" });
    variantId = item.addVariant({ label: "عادي", price: 75 }).id;
    await new KyselyMenuItemRepository(db).save(item);
  });

  afterEach(() => {
    delete process.env.SMS_WEBHOOK_URL;
    delete process.env.SMS_WEBHOOK_AUTH_HEADER;
    delete process.env.PUBLIC_APP_URL;
    gatewayStatus = 200;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await request(server()).patch("/pos-settings").set(auth()).send({ smsConfirmationsEnabled: false, smsRatingRequestsEnabled: false });
    await sql`UPDATE pos_settings SET updated_by = NULL`.execute(db);
    await sql`DELETE FROM order_notifications WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM print_jobs WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE id = ${variantId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE name = 'صنف-رسايل-جست'`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-notify@jest.test'`.execute(db);
    await app.close();
    await new Promise((resolve) => gateway.close(resolve));
  });

  test("الإعداد مقفول (الافتراضي): مفيش أي رسالة حتى لو فيه بوابة", async () => {
    process.env.SMS_WEBHOOK_URL = gatewayUrl;
    const orderId = await createOrder("takeaway", "01000000301");
    expect(await notificationsFor(orderId)).toHaveLength(0);
    expect(received).toHaveLength(0);
  });

  test("مفعّل من غير بوابة: بيتسجّل not_configured من غير أي اتصال", async () => {
    await setSettings({ smsConfirmationsEnabled: true });
    const orderId = await createOrder("delivery", "01000000302");
    const rows = await notificationsFor(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "confirmation", status: "not_configured", recipient: "01000000302" });
  });

  test("مفعّل + بوابة شغالة: الرسالة بتوصل بالبيانات الصح والـAuthorization", async () => {
    process.env.SMS_WEBHOOK_URL = gatewayUrl;
    process.env.SMS_WEBHOOK_AUTH_HEADER = "Bearer test-sms-key";
    const orderId = await createOrder("takeaway", "01000000303");
    const rows = await notificationsFor(orderId);
    expect(rows[0]).toMatchObject({ status: "sent", error: null });
    const last = received.at(-1)!;
    expect(last.to).toBe("01000000303");
    expect(last.message).toContain(orderId.slice(0, 8));
    expect(last.message).toContain("150.00 ج.م");
    expect(last.auth).toBe("Bearer test-sms-key");
  });

  test("صالة، أو طلب من غير رقم تليفون: مفيش رسالة", async () => {
    process.env.SMS_WEBHOOK_URL = gatewayUrl;
    const dinein = await createOrder("dinein", "01000000304");
    const noPhone = await createOrder("delivery");
    expect(await notificationsFor(dinein)).toHaveLength(0);
    expect(await notificationsFor(noPhone)).toHaveLength(0);
  });

  test("البوابة واقعة: الطلب نفسه بينجح عادي والمحاولة بتتسجّل failed", async () => {
    process.env.SMS_WEBHOOK_URL = gatewayUrl;
    gatewayStatus = 500;
    const orderId = await createOrder("delivery", "01000000305");
    const rows = await notificationsFor(orderId);
    expect(rows[0]).toMatchObject({ status: "failed", error: "HTTP 500" });
  });

  test("طلب تقييم: دليفري بعد completed وتيك أواي بعد READY - مرة واحدة بس لكل طلب، والرابط فيه التوكن", async () => {
    await setSettings({ smsConfirmationsEnabled: false, smsRatingRequestsEnabled: true });
    process.env.SMS_WEBHOOK_URL = gatewayUrl;
    process.env.PUBLIC_APP_URL = "https://app.satamoni.test/";

    const delivery = await createOrder("delivery", "01000000306");
    expect(await notificationsFor(delivery)).toHaveLength(0);
    await request(server()).patch(`/orders/${delivery}/status`).set(auth()).send({ status: "out_for_delivery" });
    expect(await notificationsFor(delivery)).toHaveLength(0);
    await request(server()).patch(`/orders/${delivery}/status`).set(auth()).send({ status: "completed" });
    const rows = await notificationsFor(delivery);
    expect(rows).toHaveLength(1);
    const db = app.get(KYSELY);
    const token = (await db.selectFrom("orders").select("rating_token").where("id", "=", delivery).executeTakeFirstOrThrow()).rating_token;
    expect(rows[0].message).toContain(`https://app.satamoni.test/rate/${delivery}?token=${token}`);
    expect(rows[0].kind).toBe("rating_request");

    const takeaway = await createOrder("takeaway", "01000000307");
    for (const kitchenStatus of ["ACCEPTED", "PREPARING", "READY"]) {
      const res = await request(server()).patch(`/orders/${takeaway}/kitchen-status`).set(auth()).send({ kitchenStatus });
      expect(res.status).toBe(200);
    }
    expect((await notificationsFor(takeaway)).map((r: { kind: string }) => r.kind)).toEqual(["rating_request"]);
  });

  test("GET /order-notifications: السجل + حالة البوابة", async () => {
    process.env.SMS_WEBHOOK_URL = gatewayUrl;
    const res = await request(server()).get("/order-notifications?limit=5").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.gatewayConfigured).toBe(true);
    expect(res.body.notifications.length).toBeGreaterThan(0);
    expect(res.body.notifications.length).toBeLessThanOrEqual(5);
  });
});
