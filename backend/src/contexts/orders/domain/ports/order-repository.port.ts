import type { Order } from "../order.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the orders list. `from`/`to` are inclusive Cairo business dates (YYYY-MM-DD).
export interface OrderListFilter {
  branchId?: string;
  status?: string;
  orderType?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface OrderRepositoryPort {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByLegacyOrderId(legacyId: number): Promise<Order | null>;
  // BL-06: keeps orders.payment_method_id consistent with the payment after an approved payment adjustment
  updatePaymentMethod(orderId: string, paymentMethodId: string): Promise<void>;
  findByClientRequestId(clientRequestId: string): Promise<Order | null>;
  list(filter?: { branchId?: string }): Promise<Order[]>;
  // filtered list; one page with the total when `page` is given, every matching order otherwise
  search(filter: OrderListFilter, page?: PageRequest): Promise<{ orders: Order[]; total: number }>;
}

export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
