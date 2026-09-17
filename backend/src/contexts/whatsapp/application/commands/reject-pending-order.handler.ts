import { Inject, Injectable } from "@nestjs/common";
import { WhatsappPendingOrder } from "../../domain/whatsapp-pending-order.aggregate";
import {
  WHATSAPP_PENDING_ORDER_REPOSITORY,
  type WhatsappPendingOrderRepositoryPort,
} from "../../domain/ports/whatsapp-pending-order-repository.port";
import { WhatsappPendingOrderNotFoundError } from "../../domain/errors";

export interface RejectPendingOrderCommand {
  pendingOrderId: string;
  reason?: string | null;
  reviewedBy: string | null;
}

@Injectable()
export class RejectPendingOrderHandler {
  constructor(@Inject(WHATSAPP_PENDING_ORDER_REPOSITORY) private readonly pendingOrders: WhatsappPendingOrderRepositoryPort) {}

  async execute(command: RejectPendingOrderCommand): Promise<WhatsappPendingOrder> {
    const pendingOrder = await this.pendingOrders.findById(command.pendingOrderId);
    if (!pendingOrder) throw new WhatsappPendingOrderNotFoundError();

    pendingOrder.reject({ reason: command.reason, reviewedBy: command.reviewedBy });
    await this.pendingOrders.save(pendingOrder);
    return pendingOrder;
  }
}
