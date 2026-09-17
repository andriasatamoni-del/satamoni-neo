import { randomUUID } from "node:crypto";
import { InvalidCashAmountError, ShiftNotActiveError, ShiftNotPendingReviewError } from "./errors";

export const SHIFT_STATUSES = ["ACTIVE", "CLOSED", "PENDING_REVIEW"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const VARIANCE_STATUSES = ["NONE", "PENDING_REVIEW", "APPROVED", "ACKNOWLEDGED"] as const;
export type VarianceStatus = (typeof VARIANCE_STATUSES)[number];

// حد اعتماد الفرق الثابت (بالجنيه) - فرق جوّاه بيتقفل تلقائيًا، غير كده محتاج مراجعة مدير/محاسب.
// في الريبو القديم ده كان قابل للتهيئة (pos_settings.shift_variance_ack_threshold_egp) - هنا ثابت
// عمدًا للسلايس الأول (مفيش جدول إعدادات لسه)
export const VARIANCE_ACK_THRESHOLD_EGP = 20;

export interface ShiftFinancials {
  cashSales: number;
  cardSales: number;
  otherSales: number;
  orderCount: number;
}

export interface CashierShiftProps {
  branchId: string;
  userId: string;
  status: ShiftStatus;
  openedAt: Date;
  openingCash: number;
  openingNotes: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  actualCash: number | null;
  expectedCash: number | null;
  cashVariance: number | null;
  closingNotes: string | null;
  cashSales: number;
  cardSales: number;
  otherSales: number;
  orderCount: number;
  varianceStatus: VarianceStatus;
  varianceReviewedBy: string | null;
  varianceReviewedAt: Date | null;
  varianceReviewNotes: string | null;
}

// CashierShift - نفس مفهوم pos_shifts في الريبو القديم، مبسّط (راجع تعليق migration 013 للتفاصيل
// المؤجّلة). الكاش المتوقع بيتحسب في الـapplication layer (محتاج قراءة orders/payments عبر port
// منفصل، مش مسؤولية الأجريجيت) وبيتمرّر هنا جاهز وقت القفل - الأجريجيت مسؤول بس عن قواعد الحالة
// (مفيش قفل شيفت مقفول، مفيش مراجعة شيفت مش PENDING_REVIEW) وتصنيف الفرق
export class CashierShift {
  private constructor(
    public readonly id: string,
    private props: CashierShiftProps
  ) {}

  static register(input: { branchId: string; userId: string; openingCash: number; openingNotes?: string | null }): CashierShift {
    if (input.openingCash < 0 || Number.isNaN(input.openingCash)) throw new InvalidCashAmountError();
    const now = new Date();
    return new CashierShift(randomUUID(), {
      branchId: input.branchId,
      userId: input.userId,
      status: "ACTIVE",
      openedAt: now,
      openingCash: input.openingCash,
      openingNotes: input.openingNotes ?? null,
      closedAt: null,
      closedBy: null,
      actualCash: null,
      expectedCash: null,
      cashVariance: null,
      closingNotes: null,
      cashSales: 0,
      cardSales: 0,
      otherSales: 0,
      orderCount: 0,
      varianceStatus: "NONE",
      varianceReviewedBy: null,
      varianceReviewedAt: null,
      varianceReviewNotes: null,
    });
  }

  static reconstitute(id: string, props: CashierShiftProps): CashierShift {
    return new CashierShift(id, props);
  }

  close(input: { actualCash: number; financials: ShiftFinancials; closingNotes?: string | null; closedBy: string }): void {
    if (this.props.status !== "ACTIVE") throw new ShiftNotActiveError();
    if (input.actualCash < 0 || Number.isNaN(input.actualCash)) throw new InvalidCashAmountError();

    const expectedCash = this.props.openingCash + input.financials.cashSales;
    const cashVariance = input.actualCash - expectedCash;
    const varianceStatus: VarianceStatus = Math.abs(cashVariance) <= VARIANCE_ACK_THRESHOLD_EGP ? "NONE" : "PENDING_REVIEW";

    this.props.status = varianceStatus === "NONE" ? "CLOSED" : "PENDING_REVIEW";
    this.props.closedAt = new Date();
    this.props.closedBy = input.closedBy;
    this.props.actualCash = input.actualCash;
    this.props.expectedCash = expectedCash;
    this.props.cashVariance = cashVariance;
    this.props.closingNotes = input.closingNotes ?? null;
    this.props.cashSales = input.financials.cashSales;
    this.props.cardSales = input.financials.cardSales;
    this.props.otherSales = input.financials.otherSales;
    this.props.orderCount = input.financials.orderCount;
    this.props.varianceStatus = varianceStatus;
  }

  reviewVariance(input: { decision: "approve" | "acknowledge"; notes?: string | null; reviewerId: string }): void {
    if (this.props.status !== "PENDING_REVIEW") throw new ShiftNotPendingReviewError();
    this.props.status = "CLOSED";
    this.props.varianceStatus = input.decision === "approve" ? "APPROVED" : "ACKNOWLEDGED";
    this.props.varianceReviewedBy = input.reviewerId;
    this.props.varianceReviewedAt = new Date();
    this.props.varianceReviewNotes = input.notes ?? null;
  }

  get branchId(): string { return this.props.branchId; }
  get userId(): string { return this.props.userId; }
  get status(): ShiftStatus { return this.props.status; }
  get openedAt(): Date { return this.props.openedAt; }
  get openingCash(): number { return this.props.openingCash; }
  get openingNotes(): string | null { return this.props.openingNotes; }
  get closedAt(): Date | null { return this.props.closedAt; }
  get closedBy(): string | null { return this.props.closedBy; }
  get actualCash(): number | null { return this.props.actualCash; }
  get expectedCash(): number | null { return this.props.expectedCash; }
  get cashVariance(): number | null { return this.props.cashVariance; }
  get closingNotes(): string | null { return this.props.closingNotes; }
  get cashSales(): number { return this.props.cashSales; }
  get cardSales(): number { return this.props.cardSales; }
  get otherSales(): number { return this.props.otherSales; }
  get orderCount(): number { return this.props.orderCount; }
  get varianceStatus(): VarianceStatus { return this.props.varianceStatus; }
  get varianceReviewedBy(): string | null { return this.props.varianceReviewedBy; }
  get varianceReviewedAt(): Date | null { return this.props.varianceReviewedAt; }
  get varianceReviewNotes(): string | null { return this.props.varianceReviewNotes; }
}
