import { randomUUID } from "node:crypto";
import {
  DriverSettlementNotPendingReviewError,
  InvalidHandoverAmountError,
  NothingToSettleError,
} from "./errors";

export const VARIANCE_STATUSES = ["NONE", "PENDING_REVIEW", "ACKNOWLEDGED", "APPROVED"] as const;
export type VarianceStatus = (typeof VARIANCE_STATUSES)[number];

// حد اعتماد فرق التسليم الثابت (بالجنيه) - نفس مفهوم VARIANCE_ACK_THRESHOLD_EGP في CashierShift
// بالظبط (ثابت عمدًا، مفيش جدول إعدادات لسه - راجع تعليق pos_settings.driver_settlement_variance_ack_threshold_egp
// في الريبو القديم اللي كانت قابلة للتهيئة)
export const HANDOVER_VARIANCE_ACK_THRESHOLD_EGP = 30;

export interface DriverSettlementCandidateOrder {
  assignmentId: string;
  isCash: boolean;
  orderTotal: number;
  collectedAmount: number;
  bonus: number;
}

export interface DriverSettlementProps {
  driverId: string;
  branchId: string;
  settledBy: string | null;
  settledAt: Date;
  orderCount: number;
  codExpected: number;
  codCollected: number;
  expectedHandover: number;
  actualHandover: number;
  handoverVariance: number;
  varianceStatus: VarianceStatus;
  varianceReviewedBy: string | null;
  varianceReviewedAt: Date | null;
  varianceReviewNotes: string | null;
  bonusTotal: number;
  notes: string | null;
}

// DriverSettlement - نفس مفهوم driver_settlements في الريبو القديم بالظبط: مش "شيفت" وليها فتح/قفل،
// دفعة واحدة بتتحسب حيّة وقت التسجيل من كل طلبات التوصيل المُسلَّمة ولسه مش متسوّاة (candidates بتتحسب
// وتتقفل في الـapplication layer - راجع RegisterDriverSettlementHandler، الأجريجيت هنا مسؤول بس عن
// قواعد الحالة وتصنيف الفرق، نفس فلسفة CashierShift.close() بالظبط). expected_handover = cod_collected
// مش cod_expected - التسوية بتقيس "هل سلّم السائق اللي هو نفسه قال إنه حصّله" مش "هل حصّل قيمة الطلب
// كاملة" (ده اتحسم وقت التسليم نفسه في الريبو القديم - مش موجود هنا، تبسيط متعمّد، راجع تعليق
// DeliveryAssignment.updateStatus)
export class DriverSettlement {
  private constructor(
    public readonly id: string,
    private props: DriverSettlementProps
  ) {}

  static register(input: {
    driverId: string;
    branchId: string;
    settledBy?: string | null;
    actualHandover: number;
    notes?: string | null;
    candidates: DriverSettlementCandidateOrder[];
  }): DriverSettlement {
    if (input.candidates.length === 0) throw new NothingToSettleError();
    if (input.actualHandover < 0 || Number.isNaN(input.actualHandover)) throw new InvalidHandoverAmountError();

    const cashCandidates = input.candidates.filter((c) => c.isCash);
    const codExpected = cashCandidates.reduce((sum, c) => sum + c.orderTotal, 0);
    const codCollected = cashCandidates.reduce((sum, c) => sum + c.collectedAmount, 0);
    const bonusTotal = input.candidates.reduce((sum, c) => sum + c.bonus, 0);
    const expectedHandover = codCollected;
    const handoverVariance = input.actualHandover - expectedHandover;
    const varianceStatus: VarianceStatus =
      Math.abs(handoverVariance) <= HANDOVER_VARIANCE_ACK_THRESHOLD_EGP ? "NONE" : "PENDING_REVIEW";

    return new DriverSettlement(randomUUID(), {
      driverId: input.driverId,
      branchId: input.branchId,
      settledBy: input.settledBy ?? null,
      settledAt: new Date(),
      orderCount: input.candidates.length,
      codExpected,
      codCollected,
      expectedHandover,
      actualHandover: input.actualHandover,
      handoverVariance,
      varianceStatus,
      varianceReviewedBy: null,
      varianceReviewedAt: null,
      varianceReviewNotes: null,
      bonusTotal,
      notes: input.notes ?? null,
    });
  }

  static reconstitute(id: string, props: DriverSettlementProps): DriverSettlement {
    return new DriverSettlement(id, props);
  }

  reviewVariance(input: { decision: "approve" | "acknowledge"; notes?: string | null; reviewerId: string }): void {
    if (this.props.varianceStatus !== "PENDING_REVIEW") throw new DriverSettlementNotPendingReviewError();
    this.props.varianceStatus = input.decision === "approve" ? "APPROVED" : "ACKNOWLEDGED";
    this.props.varianceReviewedBy = input.reviewerId;
    this.props.varianceReviewedAt = new Date();
    this.props.varianceReviewNotes = input.notes ?? null;
  }

  get driverId(): string { return this.props.driverId; }
  get branchId(): string { return this.props.branchId; }
  get settledBy(): string | null { return this.props.settledBy; }
  get settledAt(): Date { return this.props.settledAt; }
  get orderCount(): number { return this.props.orderCount; }
  get codExpected(): number { return this.props.codExpected; }
  get codCollected(): number { return this.props.codCollected; }
  get expectedHandover(): number { return this.props.expectedHandover; }
  get actualHandover(): number { return this.props.actualHandover; }
  get handoverVariance(): number { return this.props.handoverVariance; }
  get varianceStatus(): VarianceStatus { return this.props.varianceStatus; }
  get varianceReviewedBy(): string | null { return this.props.varianceReviewedBy; }
  get varianceReviewedAt(): Date | null { return this.props.varianceReviewedAt; }
  get varianceReviewNotes(): string | null { return this.props.varianceReviewNotes; }
  get bonusTotal(): number { return this.props.bonusTotal; }
  get notes(): string | null { return this.props.notes; }
}
