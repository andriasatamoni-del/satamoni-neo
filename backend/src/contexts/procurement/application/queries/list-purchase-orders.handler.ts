import { Inject, Injectable } from "@nestjs/common";
import { PurchaseOrder } from "../../domain/purchase-order.aggregate";
import {
  PURCHASE_ORDER_REPOSITORY,
  type ProcurementDocumentListFilter,
  type PurchaseOrderRepositoryPort,
} from "../../domain/ports/purchase-order-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListPurchaseOrdersHandler {
  constructor(@Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepositoryPort) {}

  async execute(filter: ProcurementDocumentListFilter = {}, page?: PageRequest): Promise<{ orders: PurchaseOrder[]; total: number }> {
    return this.orders.search(filter, page);
  }
}
