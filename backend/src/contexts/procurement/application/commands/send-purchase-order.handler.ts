import { Inject, Injectable } from "@nestjs/common";
import { PurchaseOrder } from "../../domain/purchase-order.aggregate";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import { PurchaseOrderNotFoundError } from "../../domain/errors";

@Injectable()
export class SendPurchaseOrderHandler {
  constructor(@Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepositoryPort) {}

  async execute(purchaseOrderId: string): Promise<PurchaseOrder> {
    const order = await this.orders.findById(purchaseOrderId);
    if (!order) throw new PurchaseOrderNotFoundError();

    order.markSent();
    await this.orders.save(order);
    return order;
  }
}
