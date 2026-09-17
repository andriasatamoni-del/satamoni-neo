import { Inject, Injectable } from "@nestjs/common";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import { WHATSAPP_MESSAGE_PORT, type WhatsappMessagePort, type WhatsappMessageRecord } from "../../domain/ports/whatsapp-message.port";
import { WhatsappConversationNotFoundError } from "../../domain/errors";

export interface SendWhatsappReplyCommand {
  conversationId: string;
  body: string;
  sentBy: string | null;
}

// بيسجّل الرد كرسالة صادرة بس - **مفيش إرسال حقيقي لـMeta Graph API هنا** (محتاج WHATSAPP_ACCESS_TOKEN
// حقيقي، مؤجّل لحد ما بيانات الاعتماد تتوفر - نفس فلسفة "not_configured بهدوء" في الريبو القديم). أول
// ما الاعتماد يتوفر، نقطة التوسيع الوحيدة هنا: نداء فعلي لـMeta Graph API بعد التسجيل مباشرة
@Injectable()
export class SendWhatsappReplyHandler {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    @Inject(WHATSAPP_MESSAGE_PORT) private readonly messages: WhatsappMessagePort
  ) {}

  async execute(command: SendWhatsappReplyCommand): Promise<WhatsappMessageRecord> {
    const conversation = await this.conversations.findById(command.conversationId);
    if (!conversation) throw new WhatsappConversationNotFoundError();

    return this.messages.record({
      conversationId: conversation.id,
      direction: "out",
      body: command.body,
      sentBy: command.sentBy,
    });
  }
}
