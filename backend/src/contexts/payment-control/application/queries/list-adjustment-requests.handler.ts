import { Inject, Injectable } from "@nestjs/common";
import { PaymentAdjustmentRequest } from "../../domain/payment-adjustment-request.aggregate";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../domain/ports/payment-adjustment-request-repository.port";

@Injectable()
export class ListAdjustmentRequestsHandler {
  constructor(
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly requests: PaymentAdjustmentRequestRepositoryPort
  ) {}

  async execute(filter?: { paymentId?: string; status?: string }): Promise<PaymentAdjustmentRequest[]> {
    return this.requests.list(filter);
  }
}
