import { Inject, Injectable } from "@nestjs/common";
import { PaymentAdjustmentRequest } from "../../domain/payment-adjustment-request.aggregate";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../domain/ports/payment-adjustment-request-repository.port";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import { PAYMENT_METHOD_REPOSITORY, type PaymentMethodRepositoryPort } from "../../domain/ports/payment-method-repository.port";
import { PaymentNotFoundError, PaymentMethodNotFoundError } from "../../domain/errors";

export interface RequestPaymentAdjustmentCommand {
  paymentId: string;
  requestedBy?: string | null;
  reason?: string | null;
  // مش متحدد = "خليها زي ما هي، صحّح المبلغ بس" - نفس فلسفة الريبو القديم بالحرف
  proposedPaymentMethodId?: string | null;
  proposedAmount: number;
}

// amount_delta بيتحسب هنا (application layer) بقاعدة الريبو القديم بالحرف: لو تصنيف القناة/النوع
// (channel reclassification) بيتغيّر، المبلغ كله هو الـdelta (أخطر - محتاج مراجعة أوسع)؛ لو نفس
// التصنيف وبس المبلغ بيتغيّر، الفرق المطلق هو الـdelta بس
@Injectable()
export class RequestPaymentAdjustmentHandler {
  constructor(
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly requests: PaymentAdjustmentRequestRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort
  ) {}

  async execute(command: RequestPaymentAdjustmentCommand): Promise<PaymentAdjustmentRequest> {
    const payment = await this.payments.findById(command.paymentId);
    if (!payment) throw new PaymentNotFoundError();

    let isReclassification = false;
    if (command.proposedPaymentMethodId) {
      const proposedMethod = await this.methods.findById(command.proposedPaymentMethodId);
      if (!proposedMethod) throw new PaymentMethodNotFoundError();
      isReclassification = proposedMethod.kind !== payment.methodKind || proposedMethod.settlementChannel !== payment.settlementChannel;
    }
    const amountDelta = isReclassification ? command.proposedAmount : Math.abs(command.proposedAmount - payment.amount);

    const request = PaymentAdjustmentRequest.register({
      paymentId: payment.id,
      requestedBy: command.requestedBy,
      reason: command.reason,
      proposedPaymentMethodId: command.proposedPaymentMethodId ?? null,
      proposedAmount: command.proposedAmount,
      amountDelta,
    });
    await this.requests.save(request);
    return request;
  }
}
