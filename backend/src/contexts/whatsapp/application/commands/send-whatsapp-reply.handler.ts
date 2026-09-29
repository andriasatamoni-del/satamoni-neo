import { Inject, Injectable } from "@nestjs/common";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import { WHATSAPP_MESSAGE_PORT, type WhatsappMessagePort, type WhatsappMessageRecord } from "../../domain/ports/whatsapp-message.port";
import { OUTBOUND_MESSENGER, type OutboundMessengerPort, type OutboundSendResult } from "../../domain/ports/outbound-messenger.port";
import { WhatsappConversationNotFoundError } from "../../domain/errors";

export interface SendWhatsappReplyCommand {
  conversationId: string;
  body: string;
  sentBy: string | null;
}

// رد يدوي من موظف: بيتبعت فعليًا على نفس قناة العميل (واتساب/ماسنجر/إنستجرام) وبيتسجّل في المحادثة.
// لو بيانات اعتماد القناة مش متضافة، الرد بيتسجّل بس ومعاه delivery=not_configured عشان الموظف يعرف
// إن العميل ماوصلوش حاجة
@Injectable()
export class SendWhatsappReplyHandler {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    @Inject(WHATSAPP_MESSAGE_PORT) private readonly messages: WhatsappMessagePort,
    @Inject(OUTBOUND_MESSENGER) private readonly outbound: OutboundMessengerPort
  ) {}

  async execute(command: SendWhatsappReplyCommand): Promise<{ message: WhatsappMessageRecord; delivery: OutboundSendResult }> {
    const conversation = await this.conversations.findById(command.conversationId);
    if (!conversation) throw new WhatsappConversationNotFoundError();

    const delivery = await this.outbound.send({ channel: conversation.channel, to: conversation.phone, text: command.body });
    const message = await this.messages.record({
      conversationId: conversation.id,
      direction: "out",
      body: command.body,
      sentBy: command.sentBy,
      waMessageId: delivery.sent ? delivery.externalMessageId : null,
    });
    return { message, delivery };
  }
}
