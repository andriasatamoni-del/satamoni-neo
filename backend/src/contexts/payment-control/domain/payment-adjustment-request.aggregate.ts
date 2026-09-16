import { randomUUID } from "node:crypto";
import { AdjustmentRequestAlreadyDecidedError } from "./errors";

export const ADJUSTMENT_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type AdjustmentRequestStatus = (typeof ADJUSTMENT_REQUEST_STATUSES)[number];

export interface PaymentAdjustmentRequestProps {
  paymentId: string;
  requestedBy: string | null;
  requestedAt: Date;
  reason: string | null;
  // null = خليها زي ما هي (تصحيح مبلغ بس، نفس طريقة الدفع)، مش reclassification - نفس فلسفة الريبو
  // القديم بالحرف
  proposedPaymentMethodId: string | null;
  proposedAmount: number;
  amountDelta: number;
  status: AdjustmentRequestStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  legacyAdjustmentRequestId: number | null;
}

// PaymentAdjustmentRequest - نفس مفهوم payment_adjustment_requests في الريبو القديم: الطريقة الوحيدة
// لتغيير Payment مقفولة. amount_delta بيحدده الطالب (application layer - RequestPaymentAdjustmentHandler)
// حسب قاعدة الريبو القديم بالحرف: لو تصنيف القناة اتغيّر بالكامل، المبلغ كله هو الـdelta (أخطر من فرق
// مبلغ بسيط)؛ لو نفس القناة وبس المبلغ اتغيّر، الفرق المطلق هو الـdelta. السقف المزدوج (عادي/عالي)
// بيتفحص في application layer وقت الاعتماد (ApprovePaymentAdjustmentHandler) مش هنا - الدومين هنا
// مسؤول بس عن "متقرّرش فيه قبل كده".
export class PaymentAdjustmentRequest {
  private constructor(
    public readonly id: string,
    private props: PaymentAdjustmentRequestProps
  ) {}

  static register(input: {
    paymentId: string;
    requestedBy?: string | null;
    reason?: string | null;
    proposedPaymentMethodId?: string | null;
    proposedAmount: number;
    amountDelta: number;
    legacyAdjustmentRequestId?: number | null;
  }): PaymentAdjustmentRequest {
    return new PaymentAdjustmentRequest(randomUUID(), {
      paymentId: input.paymentId,
      requestedBy: input.requestedBy ?? null,
      requestedAt: new Date(),
      reason: input.reason ?? null,
      proposedPaymentMethodId: input.proposedPaymentMethodId ?? null,
      proposedAmount: input.proposedAmount,
      amountDelta: input.amountDelta,
      status: "PENDING",
      decidedBy: null,
      decidedAt: null,
      legacyAdjustmentRequestId: input.legacyAdjustmentRequestId ?? null,
    });
  }

  static reconstitute(id: string, props: PaymentAdjustmentRequestProps): PaymentAdjustmentRequest {
    return new PaymentAdjustmentRequest(id, props);
  }

  approve(decidedBy: string | null): void {
    if (this.props.status !== "PENDING") throw new AdjustmentRequestAlreadyDecidedError();
    this.props.status = "APPROVED";
    this.props.decidedBy = decidedBy;
    this.props.decidedAt = new Date();
  }

  reject(decidedBy: string | null): void {
    if (this.props.status !== "PENDING") throw new AdjustmentRequestAlreadyDecidedError();
    this.props.status = "REJECTED";
    this.props.decidedBy = decidedBy;
    this.props.decidedAt = new Date();
  }

  get paymentId(): string { return this.props.paymentId; }
  get requestedBy(): string | null { return this.props.requestedBy; }
  get requestedAt(): Date { return this.props.requestedAt; }
  get reason(): string | null { return this.props.reason; }
  get proposedPaymentMethodId(): string | null { return this.props.proposedPaymentMethodId; }
  get proposedAmount(): number { return this.props.proposedAmount; }
  get amountDelta(): number { return this.props.amountDelta; }
  get status(): AdjustmentRequestStatus { return this.props.status; }
  get decidedBy(): string | null { return this.props.decidedBy; }
  get decidedAt(): Date | null { return this.props.decidedAt; }
  get legacyAdjustmentRequestId(): number | null { return this.props.legacyAdjustmentRequestId; }
}
