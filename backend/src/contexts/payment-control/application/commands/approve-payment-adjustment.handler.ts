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
  TalabatPaymentOverrideRequiredError,
} from "../../domain/errors";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { SegregationOfDutiesError } from "../../../../shared/domain/domain-error";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { PaymentAdjustmentApprovedEvent } from "../../domain/events/payment-adjustment-approved.event";

// نفس سقف الريبو القديم الافتراضي (pos_settings.payment_adjustment_high_threshold_egp) - القيمة
// الفعلية بتتقرا من Settings context، الثابت هنا fallback بس
export const DEFAULT_HIGH_APPROVAL_THRESHOLD_EGP = 500;

export interface ApprovePaymentAdjustmentCommand {
  requestId: string;
  decidedBy?: string | null;
  hasHighApproval: boolean; // بيتحسب في الـcontroller من صلاحية payment_control.adjustment.approve_high
  // بيتحسب في الـcontroller من صلاحية talabat.payment_override - مطلوبة إضافيًا لو الدفعة دي مصدرها
  // Talabat (طريقة الدفع الحالية مربوطة بكود Talabat - راجع TalabatPaymentOverrideRequiredError)
  hasTalabatOverride: boolean;
}

// Phase 3.1:
//  * BL-05 - segregation of duties: the requester of an adjustment can never approve it (no role/admin bypass).
//  * BL-06 - one transaction: the request is locked first (concurrent/replayed approvals queue and the later ones are rejected as
//    already decided), the payment is locked, the BEFORE values are stored on the request, and the critical subscribers keep
//    orders.payment_method_id in sync and post the correcting journal - all atomically.
//  * The original payment evidence and the original sale journal are never overwritten; every approval keeps previous/new values.
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

    // مدير الفرع يقدر يعتمد لوحده لو الفرق تحت السقف؛ فوق السقف لازم محاسب/أدمن (approve_high) -
    // نفس منطق سقف الخصم المرحلي الموجود فعلًا في الريبو القديم بالظبط
    const settings = await this.getPosSettings.execute();
    if (request.amountDelta >= settings.paymentAdjustmentHighThresholdEgp && !command.hasHighApproval) {
      throw new InsufficientApprovalLevelError();
    }

    if (!(await this.tx.lockRow("payments", request.paymentId))) throw new PaymentNotFoundError();
    const payment = await this.payments.findById(request.paymentId);
    if (!payment) throw new PaymentNotFoundError();

    const currentMethod = await this.methods.findById(payment.paymentMethodId);
    if (currentMethod?.talabatPaymentCode && !command.hasTalabatOverride) {
      throw new TalabatPaymentOverrideRequiredError();
    }

    // proposedPaymentMethodId فاضي = "خليها زي ما هي" - بنفضّل حقول الدفعة الحالية نفسها، بنغيّر
    // المبلغ بس
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
