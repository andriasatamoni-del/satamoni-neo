import { Inject, Injectable } from "@nestjs/common";
import { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";

@Injectable()
export class ListConversationsHandler {
  constructor(@Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort) {}

  async execute(): Promise<WhatsappConversation[]> {
    return this.conversations.list();
  }
}
