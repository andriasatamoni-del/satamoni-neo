import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { WhatsappPendingOrder } from "../whatsapp-pending-order.aggregate";

export interface WhatsappPendingOrderRepositoryPort {
  save(order: WhatsappPendingOrder): Promise<void>;
  findById(id: string): Promise<WhatsappPendingOrder | null>;
  findDraftByConversation(conversationId: string): Promise<WhatsappPendingOrder | null>;
  list(filter?: { status?: string }): Promise<WhatsappPendingOrder[]>;
  listPage(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: WhatsappPendingOrder[]; total: number }>;
}

export const WHATSAPP_PENDING_ORDER_REPOSITORY = Symbol("WHATSAPP_PENDING_ORDER_REPOSITORY");
