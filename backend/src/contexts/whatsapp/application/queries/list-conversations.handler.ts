import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { WhatsappConversation } from "../../domain/whatsapp-conversation.aggregate";
import { WHATSAPP_CONVERSATION_REPOSITORY, type WhatsappConversationRepositoryPort } from "../../domain/ports/whatsapp-conversation-repository.port";

@Injectable()
export class ListConversationsHandler {
  constructor(@Inject(WHATSAPP_CONVERSATION_REPOSITORY) private readonly conversations: WhatsappConversationRepositoryPort) {}

  async execute(page?: PageRequest): Promise<{ rows: WhatsappConversation[]; total: number }> {
    return this.conversations.listPage(page);
  }
}
