import { Inject, Injectable } from "@nestjs/common";
import { PurchaseOrder } from "../../domain/purchase-order.aggregate";
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";

@Injectable()
export class ListPurchaseOrdersHandler {
  constructor(@Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepositoryPort) {}

  async execute(): Promise<PurchaseOrder[]> {
    return this.orders.list();
  }
}
