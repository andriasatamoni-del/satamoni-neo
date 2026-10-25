import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { WhatsappPendingOrder } from "../../domain/whatsapp-pending-order.aggregate";
import {
  WHATSAPP_PENDING_ORDER_REPOSITORY,
  type WhatsappPendingOrderRepositoryPort,
} from "../../domain/ports/whatsapp-pending-order-repository.port";

@Injectable()
export class ListPendingOrdersHandler {
  constructor(@Inject(WHATSAPP_PENDING_ORDER_REPOSITORY) private readonly pendingOrders: WhatsappPendingOrderRepositoryPort) {}

  async execute(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: WhatsappPendingOrder[]; total: number }> {
    return this.pendingOrders.listPage(filter, page);
  }
}
