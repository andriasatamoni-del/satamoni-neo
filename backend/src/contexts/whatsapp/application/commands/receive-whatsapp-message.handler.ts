import { Inject, Injectable } from "@nestjs/common";
import { WhatsappConversation, type ConversationChannel } from "../../domain/whatsapp-conversation.aggregate";
import {
  WHATSAPP_CONVERSATION_REPOSITORY,
  type WhatsappConversationRepositoryPort,
} from "../../domain/ports/whatsapp-conversation-repository.port";
import { WHATSAPP_MESSAGE_PORT, type WhatsappMessagePort } from "../../domain/ports/whatsapp-message.port";

export interface ReceiveWhatsappMessageCommand {
  channel?: ConversationChannel;
  phone: string;
  customerName?: string | null;
  body: string;
  waMessageId?: string | null;
}

export interface ReceiveWhatsappMessageResult {
  conversation: WhatsappConversation;
  isNewConversation: boolean;
  // false لو نفس الرسالة (نفس waMessageId) وصلت قبل كده - Meta بتعيد الإرسال لو ماردّناش بسرعة
  isNewMessage: boolean;
}

// نقطة الدخول الوحيدة للرسائل الواردة (webhook Meta بعد التحقق من التوقيع). محادثة واحدة بس لكل
// (قناة، رقم) - نفس فلسفة whatsapp_conversations في الريبو القديم. الرد الآلي (لو البوت مفعّل) بيحصل
// بعد كده في WhatsappBotService، مش هنا
@Injectable()
export class ReceiveWhatsappMessageHandler {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    @Inject(WHATSAPP_MESSAGE_PORT) private readonly messages: WhatsappMessagePort
  ) {}

  async execute(command: ReceiveWhatsappMessageCommand): Promise<ReceiveWhatsappMessageResult> {
    const channel = command.channel ?? "whatsapp";
    let conversation = await this.conversations.findByChannelAndPhone(channel, command.phone);
    const isNewConversation = !conversation;
    if (!conversation) {
      conversation = WhatsappConversation.register({ channel, phone: command.phone, customerName: command.customerName });
    }

    if (command.waMessageId && (await this.messages.existsByWaMessageId(command.waMessageId))) {
      return { conversation, isNewConversation: false, isNewMessage: false };
    }

    conversation.touch(command.customerName);
    await this.conversations.save(conversation);
    await this.messages.record({
      conversationId: conversation.id,
      direction: "in",
      body: command.body,
      waMessageId: command.waMessageId,
    });

    return { conversation, isNewConversation, isNewMessage: true };
  }
}
