import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { ConversationChannel, WhatsappConversation } from "../whatsapp-conversation.aggregate";

export interface WhatsappConversationRepositoryPort {
  save(conversation: WhatsappConversation): Promise<void>;
  findById(id: string): Promise<WhatsappConversation | null>;
  findByChannelAndPhone(channel: ConversationChannel, phone: string): Promise<WhatsappConversation | null>;
  list(): Promise<WhatsappConversation[]>;
  listPage(page?: PageRequest): Promise<{ rows: WhatsappConversation[]; total: number }>;
}

export const WHATSAPP_CONVERSATION_REPOSITORY = Symbol("WHATSAPP_CONVERSATION_REPOSITORY");
