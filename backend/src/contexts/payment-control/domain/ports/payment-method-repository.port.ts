import type { PaymentMethod } from "../payment-method.aggregate";

export interface PaymentMethodRepositoryPort {
  save(method: PaymentMethod): Promise<void>;
  findById(id: string): Promise<PaymentMethod | null>;
  findByLegacyPaymentMethodId(legacyId: number): Promise<PaymentMethod | null>;
  list(): Promise<PaymentMethod[]>;
}

export const PAYMENT_METHOD_REPOSITORY = Symbol("PAYMENT_METHOD_REPOSITORY");
