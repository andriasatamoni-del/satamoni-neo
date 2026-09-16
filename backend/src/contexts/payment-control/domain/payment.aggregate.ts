import { randomUUID } from "node:crypto";
import type { PaymentMethodKind, SettlementChannel } from "./payment-method.aggregate";

export interface PaymentProps {
  orderId: string;
  branchId: string;
  paymentMethodId: string;
  methodKind: PaymentMethodKind;
  settlementChannel: SettlementChannel | null;
  amount: number;
  lockedAt: Date;
  lockedBy: string | null;
  legacyPaymentId: number | null;
  createdAt: Date;
}

// Payment - نفس مفهوم payments في الريبو القديم: نسخة مجمّدة (snapshot) من طريقة الدفع وقت قفل الطلب،
// نفس فلسفة cost_at_sale بالظبط - لو حد غيّر تصنيف طريقة الدفع نفسها بعد كده، الدفعات القديمة تفضل
// صحيحة تاريخيًا. بتتقفل مرة واحدة بس (وقت تسجيل الطلب - LockPaymentForOrderHandler)، وبعد كده
// التغيير الوحيد المسموح بيه هو applyAdjustment() بعد اعتماد طلب تعديل (PaymentAdjustmentRequest).
// 1:1 مع الطلب (مفيش split payments - برّه النطاق هنا زي الريبو القديم بالظبط).
export class Payment {
  private constructor(
    public readonly id: string,
    private props: PaymentProps
  ) {}

  static lock(input: {
    orderId: string;
    branchId: string;
    paymentMethodId: string;
    methodKind: string;
    settlementChannel: string | null;
    amount: number;
    lockedBy?: string | null;
    legacyPaymentId?: number | null;
  }): Payment {
    const now = new Date();
    return new Payment(randomUUID(), {
      orderId: input.orderId,
      branchId: input.branchId,
      paymentMethodId: input.paymentMethodId,
      methodKind: input.methodKind as PaymentMethodKind,
      settlementChannel: input.settlementChannel as SettlementChannel | null,
      amount: input.amount,
      lockedAt: now,
      lockedBy: input.lockedBy ?? null,
      legacyPaymentId: input.legacyPaymentId ?? null,
      createdAt: now,
    });
  }

  static reconstitute(id: string, props: PaymentProps): Payment {
    return new Payment(id, props);
  }

  // بيتنفّذ بس من ApprovePaymentAdjustmentHandler بعد اعتماد طلب تعديل - مش أي حتة تانية في الكود
  applyAdjustment(input: { paymentMethodId: string; methodKind: string; settlementChannel: string | null; amount: number }): void {
    this.props.paymentMethodId = input.paymentMethodId;
    this.props.methodKind = input.methodKind as PaymentMethodKind;
    this.props.settlementChannel = input.settlementChannel as SettlementChannel | null;
    this.props.amount = input.amount;
  }

  get orderId(): string { return this.props.orderId; }
  get branchId(): string { return this.props.branchId; }
  get paymentMethodId(): string { return this.props.paymentMethodId; }
  get methodKind(): PaymentMethodKind { return this.props.methodKind; }
  get settlementChannel(): SettlementChannel | null { return this.props.settlementChannel; }
  get amount(): number { return this.props.amount; }
  get lockedAt(): Date { return this.props.lockedAt; }
  get lockedBy(): string | null { return this.props.lockedBy; }
  get legacyPaymentId(): number | null { return this.props.legacyPaymentId; }
  get createdAt(): Date { return this.props.createdAt; }
}
