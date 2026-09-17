import { Inject, Injectable } from "@nestjs/common";
import { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import {
  WHATSAPP_CONVERSATION_REPOSITORY,
  type WhatsappConversationRepositoryPort,
} from "../../domain/ports/whatsapp-conversation-repository.port";
import { WHATSAPP_MESSAGE_PORT, type WhatsappMessagePort } from "../../domain/ports/whatsapp-message.port";

export interface ReceiveWhatsappMessageCommand {
  phone: string;
  customerName?: string | null;
  body: string;
  waMessageId?: string | null;
}

// نقطة الدخول الوحيدة للرسائل الواردة - سواء جاية من webhook حقيقي لاحقًا (Meta Cloud API، بعد التحقق
// من التوقيع X-Hub-Signature-256 بمقارنة مع WHATSAPP_APP_SECRET) أو من أي مصدر تجريبي دلوقتي. محادثة
// واحدة بس لكل رقم (find-or-create) - نفس فلسفة whatsapp_conversations في الريبو القديم. مفيش رد آلي
// هنا خالص (البوت بذكاء اصطناعي مؤجّل لحد ما ANTHROPIC_API_KEY يتوفر) - الرسالة بس بتتسجل لمراجعة بشرية
@Injectable()
export class ReceiveWhatsappMessageHandler {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    @Inject(WHATSAPP_MESSAGE_PORT) private readonly messages: WhatsappMessagePort
  ) {}

  async execute(command: ReceiveWhatsappMessageCommand): Promise<WhatsappConversation> {
    let conversation = await this.conversations.findByPhone(command.phone);
    if (!conversation) {
      conversation = WhatsappConversation.register({ phone: command.phone, customerName: command.customerName });
    }
    conversation.touch(command.customerName);
    await this.conversations.save(conversation);

    await this.messages.record({
      conversationId: conversation.id,
      direction: "in",
      body: command.body,
      waMessageId: command.waMessageId,
    });

    return conversation;
  }
}
