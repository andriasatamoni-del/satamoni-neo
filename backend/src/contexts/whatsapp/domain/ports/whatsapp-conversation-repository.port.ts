import type { ConversationChannel, WhatsappConversation } from "../whatsapp-conversation.aggregate";

export interface WhatsappConversationRepositoryPort {
  save(conversation: WhatsappConversation): Promise<void>;
  findById(id: string): Promise<WhatsappConversation | null>;
  findByChannelAndPhone(channel: ConversationChannel, phone: string): Promise<WhatsappConversation | null>;
  list(): Promise<WhatsappConversation[]>;
}

export const WHATSAPP_CONVERSATION_REPOSITORY = Symbol("WHATSAPP_CONVERSATION_REPOSITORY");
