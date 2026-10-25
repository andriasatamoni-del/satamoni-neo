import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { Payment } from "../payment.aggregate";

export interface PaymentRepositoryPort {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  findByLegacyPaymentId(legacyId: number): Promise<Payment | null>;
  list(filter?: { branchId?: string; settlementChannel?: string; fromDate?: Date; toDate?: Date }): Promise<Payment[]>;
  listPage(filter?: { branchId?: string; settlementChannel?: string; fromDate?: Date; toDate?: Date }, page?: PageRequest): Promise<{ rows: Payment[]; total: number }>;
}

export const PAYMENT_REPOSITORY = Symbol("PAYMENT_REPOSITORY");
