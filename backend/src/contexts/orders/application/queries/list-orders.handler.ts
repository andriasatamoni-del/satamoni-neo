import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";

@Injectable()
export class ListOrdersHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async execute(filter?: { branchId?: string }): Promise<Order[]> {
    return this.orders.list(filter);
  }
}
