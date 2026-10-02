import { Inject, Injectable } from "@nestjs/common";
import { PaymentAdjustmentRequest } from "../../domain/payment-adjustment-request.aggregate";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../domain/ports/payment-adjustment-request-repository.port";
import { AdjustmentRequestNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { auditDetail } from "../../../../shared/audit/audit-context";

export interface RejectPaymentAdjustmentCommand {
  requestId: string;
  decidedBy?: string | null;
}

@Injectable()
export class RejectPaymentAdjustmentHandler {
  constructor(
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly requests: PaymentAdjustmentRequestRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: RejectPaymentAdjustmentCommand): Promise<PaymentAdjustmentRequest> {
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("payment_adjustment_requests", command.requestId))) throw new AdjustmentRequestNotFoundError();
      const request = await this.requests.findById(command.requestId);
      if (!request) throw new AdjustmentRequestNotFoundError();
      request.reject(command.decidedBy ?? null);
      await this.requests.save(request);
      auditDetail({ entityType: "payment-adjustment-request", entityId: request.id, before: { status: "PENDING" }, after: { status: "REJECTED" } });
      return request;
    });
  }
}
