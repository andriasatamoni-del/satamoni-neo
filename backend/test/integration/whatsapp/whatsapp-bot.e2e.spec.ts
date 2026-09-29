import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";
import { AI_CHAT_CLIENT, type AiChatClientPort, type RunToolLoopInput } from "../../../src/contexts/whatsapp/domain/ports/ai-chat-client.port";
import { OUTBOUND_MESSENGER, type OutboundMessengerPort } from "../../../src/contexts/whatsapp/domain/ports/outbound-messenger.port";
import { signMeta, socialPayload, whatsappPayload } from "./meta-webhook.helpers";

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
    const db = app.get(KYSELY);
    const res = await sql<{ c: number }>`SELECT COUNT(*)::int AS c FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id = m.conversation_id
      WHERE c.channel = ${channel} AND c.phone = ${who} AND m.direction = 'out'`.execute(db);
    return res.rows[0].c;
  }

  async function waitForOutbound(expected: number, channel = "whatsapp", who = phone) {
    for (let i = 0; i < 50; i++) {
      if ((await outboundCount(channel, who)) >= expected) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${expected} outbound messages`);
  }

  async function draftFor(who = phone) {
    const db = app.get(KYSELY);
    const res = await sql<{ id: string; status: string; total: string; branch_id: string | null; customer_name: string | null }>`
      SELECT p.id, p.status, p.total, p.branch_id, p.customer_name FROM whatsapp_pending_orders p
      JOIN whatsapp_conversations c ON c.id = p.conversation_id WHERE c.phone = ${who} ORDER BY p.created_at DESC LIMIT 1`.execute(db);
    return res.rows[0];
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

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");

    const db = app.get(KYSELY);
    await new KyselyUserRepository(db).save(
      User.register({ name: "أدمن-بوت-جست", email: "admin-bot@jest.test", passwordHash: await new BcryptPasswordHasher().hash("12345678"), role: "admin" })
    );
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-bot@jest.test", password: "12345678" })).body.token;

    branchName = `فرع-بوت-جست-${Date.now()}`;
    const branch = Branch.register({ name: branchName });
    await new KyselyBranchRepository(db).save(branch);
    branchId = branch.id;

    const item = await request(server())
      .post("/catalog/items")
      .set(auth())
      .send({ name: "بيتزا-بوت-جست", variants: [{ label: "وسط", price: 50 }, { label: "كبير", price: 80 }] });
    itemId = item.body.id;
    await request(server()).post(`/catalog/items/${itemId}/modifiers`).set(auth()).send({ name: "جبنة زيادة", priceDelta: 10 });
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await request(server()).patch("/pos-settings").set(auth()).send({ whatsappBotEnabled: false });
    const convs = sql`SELECT id FROM whatsapp_conversations WHERE phone IN (${phone}, ${messengerId})`;
    await sql`DELETE FROM whatsapp_pending_order_lines WHERE pending_order_id IN (SELECT id FROM whatsapp_pending_orders WHERE conversation_id IN (${convs}))`.execute(db);
    await sql`DELETE FROM whatsapp_pending_orders WHERE conversation_id IN (${convs})`.execute(db);
    await sql`DELETE FROM whatsapp_messages WHERE conversation_id IN (${convs})`.execute(db);
    await sql`DELETE FROM complaints WHERE customer_phone IN (${phone}, ${messengerId})`.execute(db);
    await sql`DELETE FROM whatsapp_conversations WHERE phone IN (${phone}, ${messengerId})`.execute(db);
    await sql`TRUNCATE journal_entry_lines, journal_entries CASCADE`.execute(db);
    await sql`DELETE FROM print_jobs WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${branchId}))`.execute(db).catch(() => undefined);
    await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${branchId})`.execute(db);
    await sql`DELETE FROM orders WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM menu_price_history WHERE entity_id IN (SELECT id FROM menu_item_modifiers WHERE item_id = ${itemId})`.execute(db);
    await sql`DELETE FROM menu_item_modifiers WHERE item_id = ${itemId}`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE item_id = ${itemId}`.execute(db);
    await sql`DELETE FROM menu_items WHERE id = ${itemId}`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`UPDATE pos_settings SET updated_by = NULL WHERE updated_by = (SELECT id FROM users WHERE email = 'admin-bot@jest.test')`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-bot@jest.test'`.execute(db);
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
