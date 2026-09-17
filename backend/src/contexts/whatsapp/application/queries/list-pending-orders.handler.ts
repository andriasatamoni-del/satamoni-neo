import { Inject, Injectable } from "@nestjs/common";
import { WhatsappPendingOrder } from "../../domain/whatsapp-pending-order.aggregate";
import {
  WHATSAPP_PENDING_ORDER_REPOSITORY,
  type WhatsappPendingOrderRepositoryPort,
} from "../../domain/ports/whatsapp-pending-order-repository.port";

@Injectable()
export class ListPendingOrdersHandler {
  constructor(@Inject(WHATSAPP_PENDING_ORDER_REPOSITORY) private readonly pendingOrders: WhatsappPendingOrderRepositoryPort) {}

  async execute(filter?: { status?: string }): Promise<WhatsappPendingOrder[]> {
    return this.pendingOrders.list(filter);
  }
}
