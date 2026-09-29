import { createHmac, timingSafeEqual } from "node:crypto";
import type { ConversationChannel } from "../../domain/whatsapp-conversation.aggregate";

export interface InboundMetaMessage {
  channel: ConversationChannel;
  phone: string;
  customerName: string | null;
  body: string;
  waMessageId: string | null;
}

function appSecret(): string | undefined {
  return process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
}

// كل إشعار من Meta بيوصل بتوقيع HMAC-SHA256 على الـbody الخام بالـApp Secret. fail-closed: من غير
// secret متضاف، كل الطلبات بتترفض - رابط الـwebhook مش سري (بيتسجل في لوحة Meta)، فمن غير التحقق ده أي
// حد يقدر يبعت رسايل عملاء مزيّفة للنظام
export function verifyMetaSignature(rawBody: Buffer | string | undefined, signatureHeader: string | undefined): boolean {
  const secret = appSecret();
  if (!secret || !rawBody || !signatureHeader) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function verifyMetaHandshake(query: { mode?: string; token?: string; challenge?: string }): string | null {
  const expected = process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (query.mode === "subscribe" && expected && query.token === expected && query.challenge) return query.challenge;
  return null;
}

const WHATSAPP_MEDIA_LABELS: Record<string, string> = {
  image: "صورة", audio: "رسالة صوتية", video: "فيديو", document: "ملف", location: "موقع", sticker: "ستيكر",
};
const SOCIAL_MEDIA_LABELS: Record<string, string> = { image: "صورة", audio: "رسالة صوتية", video: "فيديو", file: "ملف" };

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function whatsappText(message: Json): string {
  const type = str(message.type);
  if (type === "text") return str(obj(message.text).body) ?? "";
  if (type === "button") return str(obj(message.button).text) ?? "[رد بزرار]";
  if (type === "interactive") {
    const interactive = obj(message.interactive);
    return str(obj(interactive.button_reply).title) ?? str(obj(interactive.list_reply).title) ?? "[رد تفاعلي]";
  }
  return `[${WHATSAPP_MEDIA_LABELS[type ?? ""] ?? "رسالة غير مدعومة"} من العميل]`;
}

function socialText(message: Json): string {
  const text = str(message.text);
  if (text) return text;
  const attachment = obj(arr(message.attachments)[0]);
  if (Object.keys(attachment).length > 0) return `[${SOCIAL_MEDIA_LABELS[str(attachment.type) ?? ""] ?? "رسالة غير مدعومة"} من العميل]`;
  return "[رسالة غير مدعومة]";
}

// نفس تطبيق Meta بيبعت واتساب وماسنجر وإنستجرام لنفس الرابط - مفروقين بـobject. أي حاجة مش رسالة عميل
// فعلية (تحديثات حالة التسليم/القراءة، echo لرسايلنا إحنا) بتتجاهل عشان مايحصلش loop
export function parseMetaWebhook(body: unknown): InboundMetaMessage[] {
  const payload = obj(body);
  const object = str(payload.object);
  const result: InboundMetaMessage[] = [];

  for (const entry of arr(payload.entry).map(obj)) {
    if (object === "page" || object === "instagram") {
      const channel: ConversationChannel = object === "page" ? "messenger" : "instagram";
      for (const event of arr(entry.messaging).map(obj)) {
        const message = obj(event.message);
        const senderId = str(obj(event.sender).id);
        if (!senderId || Object.keys(message).length === 0 || message.is_echo === true) continue;
        result.push({ channel, phone: senderId, customerName: null, body: socialText(message), waMessageId: str(message.mid) ?? null });
      }
      continue;
    }

    for (const change of arr(entry.changes).map(obj)) {
      const value = obj(change.value);
      const names = new Map<string, string>();
      for (const contact of arr(value.contacts).map(obj)) {
        const waId = str(contact.wa_id);
        const name = str(obj(contact.profile).name);
        if (waId && name) names.set(waId, name);
      }
      for (const message of arr(value.messages).map(obj)) {
        const from = str(message.from);
        if (!from) continue;
        result.push({
          channel: "whatsapp",
          phone: from,
          customerName: names.get(from) ?? null,
          body: whatsappText(message),
          waMessageId: str(message.id) ?? null,
        });
      }
    }
  }
  return result;
}
