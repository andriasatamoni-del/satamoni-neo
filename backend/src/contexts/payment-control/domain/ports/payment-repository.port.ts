import type { Payment } from "../payment.aggregate";

export interface PaymentRepositoryPort {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  findByLegacyPaymentId(legacyId: number): Promise<Payment | null>;
  list(filter?: { branchId?: string; settlementChannel?: string }): Promise<Payment[]>;
}

export const PAYMENT_REPOSITORY = Symbol("PAYMENT_REPOSITORY");
