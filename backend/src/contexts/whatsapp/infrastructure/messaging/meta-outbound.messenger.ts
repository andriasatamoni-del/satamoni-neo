import { Injectable } from "@nestjs/common";
import type { ConversationChannel } from "../../domain/whatsapp-conversation.aggregate";
import type { OutboundMessengerPort, OutboundSendResult } from "../../domain/ports/outbound-messenger.port";

const REQUEST_TIMEOUT_MS = 15_000;

function graphVersion(): string {
  return process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";
}

// إرسال عن طريق Meta Graph API مباشرة (من غير BSP وسيط) - نفس db/whatsapp-client.js (واتساب) و
// db/social-client.js (ماسنجر/إنستجرام) في الريبو القديم.
//
// واتساب: WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
// ماسنجر/إنستجرام: META_PAGE_ACCESS_TOKEN (Page Access Token للصفحة المربوط بيها حساب إنستجرام)
@Injectable()
export class MetaOutboundMessenger implements OutboundMessengerPort {
  isConfigured(channel: ConversationChannel): boolean {
    if (channel === "whatsapp") return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    return Boolean(process.env.META_PAGE_ACCESS_TOKEN);
  }

  async send(input: { channel: ConversationChannel; to: string; text: string }): Promise<OutboundSendResult> {
    if (!this.isConfigured(input.channel)) return { sent: false, reason: "not_configured" };

    const request =
      input.channel === "whatsapp"
        ? {
            url: `https://graph.facebook.com/${graphVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            token: process.env.WHATSAPP_ACCESS_TOKEN!,
            body: { messaging_product: "whatsapp", to: input.to, type: "text", text: { body: input.text, preview_url: false } },
          }
        : {
            // ماسنجر وإنستجرام بيستخدموا نفس Send API - الرد لازم يكون جوّه نافذة الـ24 ساعة من آخر رسالة
            // للعميل (messaging_type: RESPONSE)، وده دايمًا حالنا لأننا بنرد على رسالة جديدة
            url: `https://graph.facebook.com/${graphVersion()}/me/messages`,
            token: process.env.META_PAGE_ACCESS_TOKEN!,
            body: { recipient: { id: input.to }, messaging_type: "RESPONSE", message: { text: input.text } },
          };

    try {
      const res = await fetch(request.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${request.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        messages?: { id?: string }[];
        message_id?: string;
      };
      if (!res.ok) return { sent: false, reason: "failed", error: data.error?.message || `HTTP ${res.status}` };
      return { sent: true, externalMessageId: data.messages?.[0]?.id ?? data.message_id ?? null };
    } catch (err) {
      return { sent: false, reason: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
