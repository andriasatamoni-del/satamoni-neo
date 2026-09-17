import { Inject, Injectable } from "@nestjs/common";
import { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";
import { WHATSAPP_MESSAGE_PORT, type WhatsappMessagePort, type WhatsappMessageRecord } from "../../domain/ports/whatsapp-message.port";
import { WhatsappConversationNotFoundError } from "../../domain/errors";

export interface ConversationDetail {
  conversation: WhatsappConversation;
  messages: WhatsappMessageRecord[];
}

@Injectable()
export class GetConversationHandler {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort,
    @Inject(WHATSAPP_MESSAGE_PORT) private readonly messages: WhatsappMessagePort
  ) {}

  async execute(id: string): Promise<ConversationDetail> {
    const conversation = await this.conversations.findById(id);
    if (!conversation) throw new WhatsappConversationNotFoundError();
    const messages = await this.messages.listByConversation(id);
    return { conversation, messages };
  }
}
