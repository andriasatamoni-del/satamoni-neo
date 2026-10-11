import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { DATABASE, KYSELY } from "../../../src/shared/database/database.module";
import { signMeta, whatsappPayload } from "./meta-webhook.helpers";
import { eq, inArray } from "drizzle-orm";
import { journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { complaints } from "../../../src/contexts/crm/infrastructure/persistence/crm.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import { whatsappConversations, whatsappMessages, whatsappPendingOrderLines, whatsappPendingOrders } from "../../../src/contexts/whatsapp/infrastructure/persistence/whatsapp.tables";
import { truncate } from "../helpers/db";
import type { Database } from "../../../src/shared/database/database.token";

describe("WhatsApp - بوابة استقبال (reviewable-intake) (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let variantId: string;
  let conversationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({ name: "أدمن-واتساب-جست", email: "admin-whatsapp@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin" });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-whatsapp@jest.test", password: "12345678" })).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع واتساب-جست" });
    await branchRepo.save(branch);
    branchId = branch.id;

    const itemRes = await request(app.getHttpServer())
      .post("/catalog/items")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "بيتزا-واتساب-جست", variants: [{ label: "وسط", price: 50 }] });
    variantId = itemRes.body.variants[0].id;
  });

  afterAll(async () => {
    const db = app.get<Database>(DATABASE);
    await db.delete(whatsappPendingOrderLines).where(inArray(whatsappPendingOrderLines.pending_order_id, db.select({ id: whatsappPendingOrders.id }).from(whatsappPendingOrders).where(eq(whatsappPendingOrders.branch_id, branchId))));
    await db.delete(whatsappPendingOrders).where(eq(whatsappPendingOrders.branch_id, branchId));
    await db.delete(whatsappMessages).where(eq(whatsappMessages.conversation_id, conversationId));
    await db.delete(whatsappConversations).where(eq(whatsappConversations.id, conversationId));
    await db.delete(complaints).where(eq(complaints.customer_phone, "+201000000001"));
    await truncate(db, journalEntryLines, journalEntries);
    await db.delete(printJobs).where(eq(printJobs.branch_id, branchId));
    await db.delete(orderItems);
    await db.delete(orders).where(eq(orders.branch_id, branchId));
    await db.delete(menuItemVariants).where(eq(menuItemVariants.id, variantId));
    await db.delete(menuItems).where(eq(menuItems.name, "بيتزا-واتساب-جست"));
    await db.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    await db.delete(branches).where(eq(branches.id, branchId));
    await db.delete(users).where(eq(users.email, "admin-whatsapp@jest.test"));
    await app.close();
  });

  test("POST /whatsapp/webhook - payload حقيقي من Meta بتوقيع صحيح بيسجّل محادثة+رسالة واردة", async () => {
    const body = whatsappPayload({ from: "+201000000001", name: "عميل-واتساب-جست", text: "عايز أطلب بيتزا", id: "wamid.intake-1" });
    const res = await request(app.getHttpServer())
      .post("/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signMeta(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(1);

    const db = app.get(KYSELY);
    const row = await sql<{ id: string }>`SELECT id FROM whatsapp_conversations WHERE channel = 'whatsapp' AND phone = '+201000000001'`.execute(db);
    conversationId = row.rows[0].id;
  });

  test("GET /whatsapp/conversations و /conversations/:id - بيرجّعوا المحادثة والرسالة", async () => {
    const list = await request(app.getHttpServer()).get("/whatsapp/conversations").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((c: { id: string }) => c.id === conversationId)).toBe(true);

    const detail = await request(app.getHttpServer()).get(`/whatsapp/conversations/${conversationId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.conversation.customerName).toBe("عميل-واتساب-جست");
    expect(detail.body.messages).toHaveLength(1);
    expect(detail.body.messages[0].direction).toBe("in");
  });

  test("POST /whatsapp/conversations/:id/reply - بيسجّل رسالة صادرة (من غير إرسال حقيقي)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${conversationId}/reply`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "تمام، هنراجع طلبك" });
    expect(res.status).toBe(201);
    expect(res.body.direction).toBe("out");

    const detail = await request(app.getHttpServer()).get(`/whatsapp/conversations/${conversationId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(detail.body.messages).toHaveLength(2);
  });

  test("طلب معلّق: تسجيل -> تأكيد -> بيتسجّل أوردر حقيقي بنفس RegisterOrderHandler", async () => {
    const create = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${conversationId}/pending-orders`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderType: "delivery", branchId, addressDetails: "شارع تجريبي", items: [{ variantId, quantity: 2 }] });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("PENDING");
    expect(create.body.total).toBe(100);
    const pendingOrderId = create.body.id;

    const confirm = await request(app.getHttpServer())
      .post(`/whatsapp/pending-orders/${pendingOrderId}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(confirm.status).toBe(201);
    expect(confirm.body.status).toBe("CONFIRMED");
    expect(confirm.body.confirmedOrderId).toBeTruthy();

    const orders = await request(app.getHttpServer()).get("/orders").set("Authorization", `Bearer ${adminToken}`);
    const realOrder = orders.body.find((o: { id: string }) => o.id === confirm.body.confirmedOrderId);
    expect(realOrder).toBeTruthy();
    expect(Number(realOrder.total)).toBe(100);
    expect(realOrder.customerPhone).toBe("+201000000001");
  });

  test("طلب معلّق تاني: رفض بيقفله من غير ما يسجّل أوردر", async () => {
    const create = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${conversationId}/pending-orders`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderType: "delivery", branchId, addressDetails: "شارع تجريبي 2", items: [{ variantId, quantity: 1 }] });

    const reject = await request(app.getHttpServer())
      .post(`/whatsapp/pending-orders/${create.body.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "العميل غيّر رأيه" });
    expect(reject.status).toBe(201);
    expect(reject.body.status).toBe("REJECTED");
    expect(reject.body.confirmedOrderId).toBeNull();
  });

  test("تأكيد طلب اتراجع بالفعل -> 409", async () => {
    const create = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${conversationId}/pending-orders`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ orderType: "delivery", branchId, items: [{ variantId, quantity: 1 }] });
    await request(app.getHttpServer()).post(`/whatsapp/pending-orders/${create.body.id}/reject`).set("Authorization", `Bearer ${adminToken}`).send({});

    const secondAction = await request(app.getHttpServer()).post(`/whatsapp/pending-orders/${create.body.id}/confirm`).set("Authorization", `Bearer ${adminToken}`).send({});
    expect(secondAction.status).toBe(409);
  });

  test("POST /whatsapp/conversations/:id/complaints - بيحوّل المحادثة لشكوى حقيقية في CRM (channel=whatsapp)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${conversationId}/complaints`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "late_order", description: "الطلب اتأخر كتير" });
    expect(res.status).toBe(201);
    expect(res.body.channel).toBe("whatsapp");

    const latest = await request(app.getHttpServer())
      .get("/crm/customers/+201000000001/complaints/latest")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(latest.status).toBe(200);
    expect(latest.body.channel).toBe("whatsapp");
    expect(latest.body.category).toBe("late_order");
  });

  test("كاشير معندوش whatsapp.view -> 403", async () => {
    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const db = app.get<Database>(DATABASE);
    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const cashier = User.register({ name: "كاشير-واتساب-جست", email: "cashier-whatsapp@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier" });
    await userRepo.save(cashier);
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-whatsapp@jest.test", password: "12345678" });

    const res = await request(app.getHttpServer()).get("/whatsapp/conversations").set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(403);

    await db.delete(users).where(eq(users.email, "cashier-whatsapp@jest.test"));
  });
});
