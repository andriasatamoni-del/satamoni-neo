import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderListFilter, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListOrdersHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async execute(filter: OrderListFilter = {}, page?: PageRequest): Promise<{ orders: Order[]; total: number }> {
    return this.orders.search(filter, page);
  }
}
