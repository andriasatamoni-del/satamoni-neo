import { Inject, Injectable } from "@nestjs/common";
import { PaymentAdjustmentRequest } from "../../domain/payment-adjustment-request.aggregate";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../domain/ports/payment-adjustment-request-repository.port";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";
import {
  AdjustmentRequestNotFoundError,
  InsufficientApprovalLevelError,
  PaymentNotFoundError,
  PaymentMethodNotFoundError,
} from "../../domain/errors";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { SegregationOfDutiesError } from "../../../../shared/domain/domain-error";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { PaymentAdjustmentApprovedEvent } from "../../domain/events/payment-adjustment-approved.event";

export const DEFAULT_HIGH_APPROVAL_THRESHOLD_EGP = 500;

export interface ApprovePaymentAdjustmentCommand {
  requestId: string;
  decidedBy?: string | null;
  hasHighApproval: boolean;
}

@Injectable()
export class ApprovePaymentAdjustmentHandler {
  constructor(
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly requests: PaymentAdjustmentRequestRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort,
    private readonly getPosSettings: GetPosSettingsHandler,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  async execute(command: ApprovePaymentAdjustmentCommand): Promise<PaymentAdjustmentRequest> {
    return this.tx.run(() => this.executeInTransaction(command));
  }

  private async executeInTransaction(command: ApprovePaymentAdjustmentCommand): Promise<PaymentAdjustmentRequest> {
    if (!(await this.tx.lockRow("payment_adjustment_requests", command.requestId))) throw new AdjustmentRequestNotFoundError();
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new AdjustmentRequestNotFoundError();

    if (request.requestedBy && command.decidedBy && request.requestedBy === command.decidedBy) {
      throw new SegregationOfDutiesError("اعتماد تعديل الدفع");
    }

    const settings = await this.getPosSettings.execute();
    if (request.amountDelta >= settings.paymentAdjustmentHighThresholdEgp && !command.hasHighApproval) {
      throw new InsufficientApprovalLevelError();
    }

    if (!(await this.tx.lockRow("payments", request.paymentId))) throw new PaymentNotFoundError();
    const payment = await this.payments.findById(request.paymentId);
    if (!payment) throw new PaymentNotFoundError();

    let paymentMethodId = payment.paymentMethodId;
    let methodKind: string = payment.methodKind;
    let settlementChannel = payment.settlementChannel;
    if (request.proposedPaymentMethodId) {
      const proposedMethod = await this.methods.findById(request.proposedPaymentMethodId);
      if (!proposedMethod) throw new PaymentMethodNotFoundError();
      paymentMethodId = proposedMethod.id;
      methodKind = proposedMethod.kind;
      settlementChannel = proposedMethod.settlementChannel;
    }

    const before = { paymentMethodId: payment.paymentMethodId, amount: payment.amount };
    request.approve(command.decidedBy ?? null, before);
    payment.applyAdjustment({ paymentMethodId, methodKind, settlementChannel, amount: request.proposedAmount });

    await this.payments.save(payment);
    await this.requests.save(request);

    auditDetail({
      entityType: "payment-adjustment-request",
      entityId: request.id,
      branchId: payment.branchId,
      before: { paymentMethodId: before.paymentMethodId, amount: before.amount },
      after: { paymentMethodId, amount: request.proposedAmount },
      paymentId: payment.id,
      orderId: payment.orderId,
    });

    await this.eventBus.publish(
      new PaymentAdjustmentApprovedEvent(
        request.id,
        payment.id,
        payment.orderId,
        payment.branchId,
        before.amount,
        request.proposedAmount,
        before.paymentMethodId,
        paymentMethodId,
        command.decidedBy ?? null
      )
    );
    return request;
  }
}
