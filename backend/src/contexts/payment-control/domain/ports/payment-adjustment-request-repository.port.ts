import type { PaymentAdjustmentRequest } from "../payment-adjustment-request.aggregate";

export interface PaymentAdjustmentRequestRepositoryPort {
  save(request: PaymentAdjustmentRequest): Promise<void>;
  findById(id: string): Promise<PaymentAdjustmentRequest | null>;
  findByLegacyAdjustmentRequestId(legacyId: number): Promise<PaymentAdjustmentRequest | null>;
  list(filter?: { paymentId?: string; status?: string }): Promise<PaymentAdjustmentRequest[]>;
}

export const PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY = Symbol("PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY");
