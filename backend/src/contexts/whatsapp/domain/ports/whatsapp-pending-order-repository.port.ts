import type { WhatsappPendingOrder } from "../whatsapp-pending-order.aggregate";

export interface WhatsappPendingOrderRepositoryPort {
  save(order: WhatsappPendingOrder): Promise<void>;
  findById(id: string): Promise<WhatsappPendingOrder | null>;
  list(filter?: { status?: string }): Promise<WhatsappPendingOrder[]>;
}

export const WHATSAPP_PENDING_ORDER_REPOSITORY = Symbol("WHATSAPP_PENDING_ORDER_REPOSITORY");
