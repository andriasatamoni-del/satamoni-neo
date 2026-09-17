import { randomUUID } from "node:crypto";

export interface WhatsappConversationProps {
  phone: string;
  customerName: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
}

// WhatsappConversation - نفس مفهوم whatsapp_conversations في الريبو القديم: صف واحد بس لكل رقم تليفون
// (thread واحد مستمر). أجريجيت بسيط عمدًا - مفيش قواعد عمل معقدة، مجرد "آخر رسالة امتى" + اسم العميل
// لو اتعرف من المحادثة. الرسائل نفسها (WhatsappMessage) مش entities تابعة هنا - سجل وقائع append-only
// بحت (زي AuditLogService بالظبط)، مش محتاجة تتحمّل مع الأجريجيت كل مرة عشان نغيّر lastMessageAt بس
export class WhatsappConversation {
  private constructor(
    public readonly id: string,
    private props: WhatsappConversationProps
  ) {}

  static register(input: { phone: string; customerName?: string | null }): WhatsappConversation {
    return new WhatsappConversation(randomUUID(), {
      phone: input.phone,
      customerName: input.customerName ?? null,
      lastMessageAt: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: WhatsappConversationProps): WhatsappConversation {
    return new WhatsappConversation(id, props);
  }

  touch(customerName?: string | null): void {
    this.props.lastMessageAt = new Date();
    if (customerName) this.props.customerName = customerName;
  }

  get phone(): string { return this.props.phone; }
  get customerName(): string | null { return this.props.customerName; }
  get lastMessageAt(): Date | null { return this.props.lastMessageAt; }
  get createdAt(): Date { return this.props.createdAt; }
}
