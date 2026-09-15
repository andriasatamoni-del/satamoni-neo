import type { Order } from "../order.aggregate";

export interface OrderRepositoryPort {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByLegacyOrderId(legacyId: number): Promise<Order | null>;
  list(filter?: { branchId?: string }): Promise<Order[]>;
}

export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
