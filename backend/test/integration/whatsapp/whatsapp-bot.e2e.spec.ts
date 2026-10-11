import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { AI_CHAT_CLIENT, type AiChatClientPort, type RunToolLoopInput } from "../../../src/contexts/whatsapp/domain/ports/ai-chat-client.port";
import { OUTBOUND_MESSENGER, type OutboundMessengerPort } from "../../../src/contexts/whatsapp/domain/ports/outbound-messenger.port";
import { signMeta, socialPayload, whatsappPayload } from "./meta-webhook.helpers";
import { journalEntries, journalEntryLines } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemModifiers, menuItemVariants, menuItems, menuPriceHistory } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { complaints } from "../../../src/contexts/crm/infrastructure/persistence/crm.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import { whatsappConversations, whatsappMessages, whatsappPendingOrderLines, whatsappPendingOrders } from "../../../src/contexts/whatsapp/infrastructure/persistence/whatsapp.tables";
import { truncate } from "../helpers/db";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { posSettings } from "../../../src/contexts/settings/infrastructure/persistence/settings.tables";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { orderItemModifiers, orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";

// Gemini مكانه "سكريبت" ثابت: بيقرا آخر رسالة من العميل وبينده نفس الأدوات الحقيقية اللي الموديل كان
// هينده عليها - كده الاختبار بيغطي الأدوات والقاعدة والمسودة والتأكيد فعليًا، من غير أي اتصال بـGoogle
class ScriptedAi implements AiChatClientPort {
  configured = true;
  toolResults: { name: string; result: string }[] = [];
  lastSystem = "";
  constructor(private readonly branchName: () => string) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async runToolLoop(input: RunToolLoopInput): Promise<string> {
    this.lastSystem = input.system;
    const last = input.messages[input.messages.length - 1]?.content ?? "";
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await input.executeTool(name, args);
      this.toolResults.push({ name, result });
      return result;
    };
    if (last.includes("المنيو")) return call("get_menu");
    if (last.includes("عايز")) {
      return call("save_draft_order", {
        orderType: "takeaway",
        customerName: "أحمد-بوت-جست",
        branchName: this.branchName(),
        items: [{ itemName: "بيتزا-بوت-جست", variantLabel: "كبير", quantity: 2, modifierNames: ["جبنة"] }],
      });
    }
    if (last.includes("صنف مش موجود")) return call("save_draft_order", { items: [{ itemName: "كباب-مش-موجود", quantity: 1 }] });
    if (last.includes("أكد")) return call("submit_pending_order");
    if (last.includes("اتأخر")) return call("log_complaint", { category: "late_order", description: "الأوردر اتأخر ساعة" });
    return "أهلًا بيك في ستاموني، تحت أمرك";
  }
}

class RecordingMessenger implements OutboundMessengerPort {
  sent: { channel: string; to: string; text: string }[] = [];
  isConfigured(): boolean {
    return true;
  }
  async send(input: { channel: "whatsapp" | "messenger" | "instagram"; to: string; text: string }) {
    this.sent.push(input);
    return { sent: true as const, externalMessageId: `out-${this.sent.length}` };
  }
}

describe("WhatsApp - بوت الرد الآلي (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let branchName: string;
  let itemId: string;
  const phone = "+201000000077";
  const messengerId = "psid-bot-jest-1";
  const ai = new ScriptedAi(() => branchName);
  const messenger = new RecordingMessenger();
  let seq = 0;

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function sendInbound(text: string, from = phone) {
    const body = whatsappPayload({ from, text, id: `wamid.bot-${Date.now()}-${++seq}`, name: "أحمد-بوت-جست" });
    return request(server()).post("/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", signMeta(body)).send(body);
  }

  async function outboundCount(channel = "whatsapp", who = phone): Promise<number> {
    const [row] = await app
      .get<Database>(DATABASE)
      .select({ c: count() })
      .from(whatsappMessages)
      .innerJoin(whatsappConversations, eq(whatsappConversations.id, whatsappMessages.conversation_id))
      .where(and(eq(whatsappConversations.channel, channel), eq(whatsappConversations.phone, who), eq(whatsappMessages.direction, "out")));
    return row.c;
  }

  async function waitForOutbound(expected: number, channel = "whatsapp", who = phone) {
    for (let i = 0; i < 50; i++) {
      if ((await outboundCount(channel, who)) >= expected) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${expected} outbound messages`);
  }

  async function draftFor(who = phone) {
    const [row] = await app
      .get<Database>(DATABASE)
      .select({
        id: whatsappPendingOrders.id,
        status: whatsappPendingOrders.status,
        total: whatsappPendingOrders.total,
        branch_id: whatsappPendingOrders.branch_id,
        customer_name: whatsappPendingOrders.customer_name,
      })
      .from(whatsappPendingOrders)
      .innerJoin(whatsappConversations, eq(whatsappConversations.id, whatsappPendingOrders.conversation_id))
      .where(eq(whatsappConversations.phone, who))
      .orderBy(desc(whatsappPendingOrders.created_at))
      .limit(1);
    return row;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CHAT_CLIENT)
      .useValue(ai)
      .overrideProvider(OUTBOUND_MESSENGER)
      .useValue(messenger)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    await new UserRepository(app.get<Database>(DATABASE)).save(
      User.register({ name: "أدمن-بوت-جست", email: "admin-bot@jest.test", passwordHash: await new BcryptPasswordHasher().hash("12345678"), role: "admin" })
    );
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-bot@jest.test", password: "12345678" })).body.token;

    branchName = `فرع-بوت-جست-${Date.now()}`;
    const branch = Branch.register({ name: branchName });
    await new BranchRepository(app.get<Database>(DATABASE)).save(branch);
    branchId = branch.id;

    const item = await request(server())
      .post("/catalog/items")
      .set(auth())
      .send({ name: "بيتزا-بوت-جست", variants: [{ label: "وسط", price: 50 }, { label: "كبير", price: 80 }] });
    itemId = item.body.id;
    await request(server()).post(`/catalog/items/${itemId}/modifiers`).set(auth()).send({ name: "جبنة زيادة", priceDelta: 10 });
  });

  afterAll(async () => {
    const database = app.get<Database>(DATABASE);
    await request(server()).patch("/pos-settings").set(auth()).send({ whatsappBotEnabled: false });
    const convs = database.select({ id: whatsappConversations.id }).from(whatsappConversations).where(inArray(whatsappConversations.phone, [phone, messengerId]));
    await database.delete(whatsappPendingOrderLines).where(inArray(whatsappPendingOrderLines.pending_order_id, database.select({ id: whatsappPendingOrders.id }).from(whatsappPendingOrders).where(inArray(whatsappPendingOrders.conversation_id, convs))));
    await database.delete(whatsappPendingOrders).where(inArray(whatsappPendingOrders.conversation_id, convs));
    await database.delete(whatsappMessages).where(inArray(whatsappMessages.conversation_id, convs));
    await database.delete(complaints).where(inArray(complaints.customer_phone, [phone, messengerId]));
    await database.delete(whatsappConversations).where(inArray(whatsappConversations.phone, [phone, messengerId]));
    await truncate(database, journalEntryLines, journalEntries);
    await database.delete(printJobs).where(eq(printJobs.branch_id, branchId));
    await database.delete(orderItemModifiers).where(inArray(orderItemModifiers.order_item_id, database.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.order_id, database.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId)))))).catch(() => undefined);
    await database.delete(orderItems).where(inArray(orderItems.order_id, database.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, branchId))));
    await database.delete(orders).where(eq(orders.branch_id, branchId));
    await database.delete(menuPriceHistory).where(inArray(menuPriceHistory.entity_id, database.select({ id: menuItemModifiers.id }).from(menuItemModifiers).where(eq(menuItemModifiers.item_id, itemId))));
    await database.delete(menuItemModifiers).where(eq(menuItemModifiers.item_id, itemId));
    await database.delete(menuItemVariants).where(eq(menuItemVariants.item_id, itemId));
    await database.delete(menuItems).where(eq(menuItems.id, itemId));
    await database.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    await database.delete(branches).where(eq(branches.id, branchId));
    await database.update(posSettings).set({ updated_by: null }).where(inArray(posSettings.updated_by, database.select({ id: users.id }).from(users).where(eq(users.email, "admin-bot@jest.test"))));
    await database.delete(users).where(eq(users.email, "admin-bot@jest.test"));
    await app.close();
  });

  test("webhook من غير توقيع أو بتوقيع غلط بيترفض 401، وخطوة التحقق GET بترجع الـchallenge", async () => {
    const body = whatsappPayload({ from: phone, text: "هاي", id: "wamid.unsigned" });
    const unsigned = await request(server()).post("/whatsapp/webhook").set("Content-Type", "application/json").send(body);
    expect(unsigned.status).toBe(401);
    const forged = await request(server())
      .post("/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", `sha256=${"0".repeat(64)}`)
      .send(body);
    expect(forged.status).toBe(401);

    const ok = await request(server()).get("/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "neo_test_meta_verify_token", "hub.challenge": "12345" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("12345");
    const bad = await request(server()).get("/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" });
    expect(bad.status).toBe(403);
  });

  test("البوت مقفول افتراضيًا: الرسالة بتتسجل من غير رد آلي", async () => {
    const res = await sendInbound("هاي");
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(await outboundCount()).toBe(0);

    const status = await request(server()).get("/whatsapp/bot-status").set(auth());
    expect(status.body).toMatchObject({ enabled: false, aiConfigured: true });
  });

  test("نفس الرسالة (نفس wamid) لو Meta عادت إرسالها بتتسجل مرة واحدة بس", async () => {
    const body = whatsappPayload({ from: phone, text: "مكررة", id: "wamid.duplicate-1" });
    const first = await request(server()).post("/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", signMeta(body)).send(body);
    const second = await request(server()).post("/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", signMeta(body)).send(body);
    expect(first.body.received).toBe(1);
    expect(second.body.received).toBe(0);
  });

  test("البوت مفعّل: بيرد من المنيو الحقيقي ويبعت الرد على نفس القناة", async () => {
    const enable = await request(server()).patch("/pos-settings").set(auth()).send({ whatsappBotEnabled: true });
    expect(enable.status).toBe(200);
    expect(enable.body.whatsappBotEnabled).toBe(true);

    await sendInbound("ممكن المنيو؟");
    await waitForOutbound(1);
    const menuResult = ai.toolResults.find((t) => t.name === "get_menu")!.result;
    expect(menuResult).toContain("بيتزا-بوت-جست");
    expect(menuResult).toContain("كبير: 80.00 ج.م");
    expect(menuResult).toContain("جبنة زيادة");
    expect(messenger.sent.at(-1)).toMatchObject({ channel: "whatsapp", to: phone });
    expect(ai.lastSystem).toContain("حسام");
  });

  test("أوردر كامل: مسودة بالسعر الحقيقي + الإضافات -> العميل يأكد -> يبقى PENDING -> الموظف يأكده أوردر حقيقي", async () => {
    await sendInbound("عايز 2 بيتزا كبير بجبنة زيادة، استلام");
    await waitForOutbound(2);
    const summary = ai.toolResults.at(-1)!.result;
    expect(summary).toContain("2× بيتزا-بوت-جست (كبير) + جبنة زيادة = 180.00 ج.م");
    expect(summary).toContain("كل حاجة كاملة");

    let draft = await draftFor();
    expect(draft.status).toBe("DRAFT");
    expect(Number(draft.total)).toBe(180);
    expect(draft.branch_id).toBe(branchId);

    // المسودة مش بتظهر في طابور المراجعة قبل تأكيد العميل
    const beforeSubmit = await request(server()).get("/whatsapp/pending-orders").set(auth());
    expect(beforeSubmit.body.some((o: { id: string }) => o.id === draft.id)).toBe(false);

    await sendInbound("تمام أكد");
    await waitForOutbound(3);
    expect(ai.toolResults.at(-1)!.result).toContain("اتبعت للفريق");
    draft = await draftFor();
    expect(draft.status).toBe("PENDING");

    const queue = await request(server()).get("/whatsapp/pending-orders").set(auth());
    const pending = queue.body.find((o: { id: string }) => o.id === draft.id);
    expect(pending.lines[0].modifierIds).toHaveLength(1);

    const confirm = await request(server()).post(`/whatsapp/pending-orders/${draft.id}/confirm`).set(auth()).send({});
    expect(confirm.status).toBe(201);
    const orders = await request(server()).get("/orders").set(auth());
    const order = orders.body.find((o: { id: string }) => o.id === confirm.body.confirmedOrderId);
    expect(Number(order.total)).toBe(180);
    expect(order.customerPhone).toBe(phone);
  });

  test("صنف مش موجود في المنيو: الأداة بترفض ومفيش حاجة بتتسجل", async () => {
    await sendInbound("عندكم صنف مش موجود؟");
    await waitForOutbound(4);
    expect(ai.toolResults.at(-1)!.result).toContain('مفيش صنف اسمه "كباب-مش-موجود"');
  });

  test("شكوى: بتتسجل في CRM بنفس القناة", async () => {
    await sendInbound("الأوردر اتأخر جدًا");
    await waitForOutbound(5);
    const latest = await request(server()).get(`/crm/customers/${encodeURIComponent(phone)}/complaints/latest`).set(auth());
    expect(latest.status).toBe(200);
    expect(latest.body).toMatchObject({ channel: "whatsapp", category: "late_order" });
  });

  test("ماسنجر: نفس البوت بيرد على نفس القناة (مش واتساب)", async () => {
    const body = socialPayload({ object: "page", senderId: messengerId, text: "هاي", mid: `m_${Date.now()}` });
    const res = await request(server()).post("/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", signMeta(body)).send(body);
    expect(res.body.received).toBe(1);
    await waitForOutbound(1, "messenger", messengerId);
    expect(messenger.sent.at(-1)).toMatchObject({ channel: "messenger", to: messengerId });
    expect(ai.lastSystem).toContain("صفحة المطعم على فيسبوك");
  });

  test("من غير مفتاح Gemini البوت مابيردش حتى لو مفعّل", async () => {
    ai.configured = false;
    const before = await outboundCount();
    await sendInbound("هاي تاني");
    await new Promise((r) => setTimeout(r, 300));
    expect(await outboundCount()).toBe(before);
    ai.configured = true;
  });
});
