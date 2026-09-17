// WhatsappMessage - سجل وقائع append-only بحت (زي AuditLogService بالظبط) مش أجريجيت دومين له قواعد
// عمل - مجرد رسالة اتسجلت في وقت معيّن، مفيش حاجة تتغيّر فيها بعد كده
export interface WhatsappMessageRecord {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  body: string;
  waMessageId: string | null;
  sentBy: string | null;
  createdAt: Date;
}

export interface RecordWhatsappMessageInput {
  conversationId: string;
  direction: "in" | "out";
  body: string;
  waMessageId?: string | null;
  sentBy?: string | null;
}

export interface WhatsappMessagePort {
  record(input: RecordWhatsappMessageInput): Promise<WhatsappMessageRecord>;
  listByConversation(conversationId: string): Promise<WhatsappMessageRecord[]>;
}

export const WHATSAPP_MESSAGE_PORT = Symbol("WHATSAPP_MESSAGE_PORT");
