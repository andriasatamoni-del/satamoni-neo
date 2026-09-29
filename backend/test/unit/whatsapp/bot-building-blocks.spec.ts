import { createHmac } from "node:crypto";
import { parseMetaWebhook, verifyMetaHandshake, verifyMetaSignature } from "../../../src/contexts/whatsapp/infrastructure/meta/meta-webhook";
import { stripAdditionalProperties } from "../../../src/contexts/whatsapp/infrastructure/ai/gemini-chat.client";
import { WhatsappPendingOrder } from "../../../src/contexts/whatsapp/domain/whatsapp-pending-order.aggregate";
import { IncompletePendingOrderDraftError, WhatsappPendingOrderNotDraftError } from "../../../src/contexts/whatsapp/domain/errors";

describe("Meta webhook", () => {
  const secret = "unit-secret";
  beforeEach(() => {
    process.env.META_APP_SECRET = secret;
    process.env.META_VERIFY_TOKEN = "unit-verify";
  });
  afterEach(() => {
    delete process.env.META_APP_SECRET;
    delete process.env.META_VERIFY_TOKEN;
  });

  it("التوقيع الصحيح بيعدّي، وأي تغيير في البايتات أو التوقيع بيترفض", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyMetaSignature(Buffer.from(body), sig)).toBe(true);
    expect(verifyMetaSignature(Buffer.from(body + " "), sig)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), "sha256=abc")).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), undefined)).toBe(false);
  });

  it("من غير secret متضاف كل حاجة بتترفض (fail-closed)", () => {
    const body = "{}";
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    delete process.env.META_APP_SECRET;
    expect(verifyMetaSignature(Buffer.from(body), sig)).toBe(false);
  });

  it("handshake بيرجع الـchallenge بس مع التوكن الصح", () => {
    expect(verifyMetaHandshake({ mode: "subscribe", token: "unit-verify", challenge: "42" })).toBe("42");
    expect(verifyMetaHandshake({ mode: "subscribe", token: "nope", challenge: "42" })).toBeNull();
    expect(verifyMetaHandshake({ mode: "unsubscribe", token: "unit-verify", challenge: "42" })).toBeNull();
  });

  it("بيفك رسايل واتساب (نص + وسائط + اسم العميل) وبيتجاهل إشعارات الحالة", () => {
    const messages = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "2010", profile: { name: "سارة" } }],
                messages: [
                  { from: "2010", id: "w1", type: "text", text: { body: "عايز منيو" } },
                  { from: "2010", id: "w2", type: "image" },
                ],
              },
            },
            { value: { statuses: [{ id: "w0", status: "read" }] } },
          ],
        },
      ],
    });
    expect(messages).toEqual([
      { channel: "whatsapp", phone: "2010", customerName: "سارة", body: "عايز منيو", waMessageId: "w1" },
      { channel: "whatsapp", phone: "2010", customerName: "سارة", body: "[صورة من العميل]", waMessageId: "w2" },
    ]);
  });

  it("ماسنجر وإنستجرام: بيتجاهل الـecho (رسايلنا إحنا) والإشعارات اللي مفيهاش رسالة", () => {
    const messages = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          messaging: [
            { sender: { id: "ig1" }, message: { mid: "m1", text: "سعر البيتزا؟" } },
            { sender: { id: "page" }, message: { mid: "m2", text: "رد مننا", is_echo: true } },
            { sender: { id: "ig1" }, read: { watermark: 1 } },
          ],
        },
      ],
    });
    expect(messages).toEqual([{ channel: "instagram", phone: "ig1", customerName: null, body: "سعر البيتزا؟", waMessageId: "m1" }]);
    expect(parseMetaWebhook({ object: "page", entry: [{ messaging: [{ sender: { id: "p1" }, message: { mid: "x" } }] }] })[0]).toMatchObject({
      channel: "messenger",
      body: "[رسالة غير مدعومة]",
    });
  });

  it("payload غريب/فاضي مابيوقعش", () => {
    expect(parseMetaWebhook(null)).toEqual([]);
    expect(parseMetaWebhook({ entry: "not-an-array" })).toEqual([]);
  });
});

describe("stripAdditionalProperties (Gemini بيرفضها)", () => {
  it("بيشيلها من كل المستويات", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: { items: { type: "array", items: { type: "object", additionalProperties: false, properties: { a: { type: "string" } } } } },
    };
    expect(JSON.stringify(stripAdditionalProperties(schema))).not.toContain("additionalProperties");
  });
});

describe("WhatsappPendingOrder - مسودة البوت", () => {
  const line = { variantId: "v1", itemName: "بيتزا (كبير)", quantity: 2, unitPrice: 90, modifierIds: ["m1"] };

  it("المسودة بتتحدّث تدريجيًا وبتحسب الإجمالي، والإرسال بيطلب كل البيانات", () => {
    const draft = WhatsappPendingOrder.startDraft({ conversationId: "c1", customerPhone: "2010" });
    expect(draft.status).toBe("DRAFT");
    expect(draft.missingForSubmission()).toEqual(["الأصناف", "اسم العميل", "الفرع", "عنوان التوصيل"]);

    draft.updateDraft({ lines: [line] });
    expect(draft.total).toBe(180);
    expect(() => draft.submit()).toThrow(IncompletePendingOrderDraftError);

    draft.updateDraft({ customerName: "سارة", branchId: "b1", orderType: "takeaway" });
    expect(draft.missingForSubmission()).toEqual([]);
    draft.submit();
    expect(draft.status).toBe("PENDING");
    expect(draft.lines[0].modifierIds).toEqual(["m1"]);
  });

  it("مينفعش تعدّل أو تبعت مسودة اتبعتت خلاص", () => {
    const draft = WhatsappPendingOrder.startDraft({ conversationId: "c1", customerPhone: "2010", customerName: "سارة" });
    draft.updateDraft({ lines: [line], branchId: "b1", addressDetails: "شارع 9" });
    draft.submit();
    expect(() => draft.updateDraft({ customerName: "تاني" })).toThrow(WhatsappPendingOrderNotDraftError);
    expect(() => draft.submit()).toThrow(WhatsappPendingOrderNotDraftError);
  });

  it("قيم فاضية ما بتمسحش بيانات معروفة", () => {
    const draft = WhatsappPendingOrder.startDraft({ conversationId: "c1", customerPhone: "2010", customerName: "سارة" });
    draft.updateDraft({ customerName: null, addressDetails: null });
    expect(draft.customerName).toBe("سارة");
  });
});
