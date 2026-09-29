import type { ConversationChannel } from "../whatsapp-conversation.aggregate";

export type OutboundSendResult =
  | { sent: true; externalMessageId: string | null }
  | { sent: false; reason: "not_configured" | "failed"; error?: string };

// إرسال رسالة نصية فعلية للعميل على نفس القناة اللي كلّمنا منها. لو بيانات اعتماد القناة مش متضافة،
// الإرسال بيرجع not_configured من غير أي محاولة اتصال (الرسالة بتفضل متسجلة في المحادثة عادي)
export interface OutboundMessengerPort {
  isConfigured(channel: ConversationChannel): boolean;
  send(input: { channel: ConversationChannel; to: string; text: string }): Promise<OutboundSendResult>;
}

export const OUTBOUND_MESSENGER = Symbol("OUTBOUND_MESSENGER");
