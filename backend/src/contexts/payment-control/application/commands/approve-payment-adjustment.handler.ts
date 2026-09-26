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

@Injectable()
export class ApprovePaymentAdjustmentHandler {
  constructor(
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly requests: PaymentAdjustmentRequestRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepositoryPort,
    private readonly getPosSettings: GetPosSettingsHandler
  ) {}

  async execute(command: ApprovePaymentAdjustmentCommand): Promise<PaymentAdjustmentRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new AdjustmentRequestNotFoundError();
    // مدير الفرع يقدر يعتمد لوحده لو الفرق تحت السقف؛ فوق السقف لازم محاسب/أدمن (approve_high) -
    // نفس منطق سقف الخصم المرحلي الموجود فعلًا في الريبو القديم بالظبط
    const settings = await this.getPosSettings.execute();
    if (request.amountDelta >= settings.paymentAdjustmentHighThresholdEgp && !command.hasHighApproval) {
      throw new InsufficientApprovalLevelError();
    }

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

    request.approve(command.decidedBy ?? null);
    payment.applyAdjustment({ paymentMethodId, methodKind, settlementChannel, amount: request.proposedAmount });

    await this.payments.save(payment);
    await this.requests.save(request);
    return request;
  }
}
