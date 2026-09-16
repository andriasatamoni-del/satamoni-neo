import { Inject, Injectable } from "@nestjs/common";
import { PaymentAdjustmentRequest } from "../../domain/payment-adjustment-request.aggregate";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../domain/ports/payment-adjustment-request-repository.port";
import { AdjustmentRequestNotFoundError } from "../../domain/errors";

export interface RejectPaymentAdjustmentCommand {
  requestId: string;
  decidedBy?: string | null;
}

@Injectable()
export class RejectPaymentAdjustmentHandler {
  constructor(
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly requests: PaymentAdjustmentRequestRepositoryPort
  ) {}

  async execute(command: RejectPaymentAdjustmentCommand): Promise<PaymentAdjustmentRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new AdjustmentRequestNotFoundError();
    request.reject(command.decidedBy ?? null);
    await this.requests.save(request);
    return request;
  }
}
