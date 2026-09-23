import { randomUUID } from "node:crypto";
import {
  AdjustmentAmountMustBePositiveError,
  CancellationReasonRequiredError,
  PayrollAdjustmentAlreadyCancelledError,
  UnknownAdjustmentTypeError,
} from "./errors";

export const ADJUSTMENT_TYPES = ["advance", "penalty", "bonus"] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_STATUSES = ["ACTIVE", "CANCELLED"] as const;
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

export interface PayrollAdjustmentProps {
  employeeId: string;
  entryDate: Date;
  adjustmentType: AdjustmentType;
  amount: number;
  notes: string | null;
  status: AdjustmentStatus;
  createdBy: string | null;
  createdAt: Date;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

// PayrollAdjustment - سلفة/جزاء/مكافأة فردية لموظف، نفس مفهوم payroll_adjustments في الريبو القديم
// بعد HRF-4 بالظبط: سجل تاريخي دائم، الإلغاء soft-cancel بس (status) مع سبب إجباري - مفيش DELETE
// فعلي أبدًا (كان ثغرة حقيقية في الريبو القديم قبل HRF-4: حذف صامت بدون أثر ولا سبب)
export class PayrollAdjustment {
  private constructor(
    public readonly id: string,
    private props: PayrollAdjustmentProps
  ) {}

  static register(input: {
    employeeId: string;
    entryDate: Date;
    adjustmentType: string;
    amount: number;
    notes?: string | null;
    createdBy?: string | null;
  }): PayrollAdjustment {
    if (!ADJUSTMENT_TYPES.includes(input.adjustmentType as AdjustmentType)) {
      throw new UnknownAdjustmentTypeError(input.adjustmentType);
    }
    if (input.amount <= 0) throw new AdjustmentAmountMustBePositiveError();

    return new PayrollAdjustment(randomUUID(), {
      employeeId: input.employeeId,
      entryDate: input.entryDate,
      adjustmentType: input.adjustmentType as AdjustmentType,
      amount: input.amount,
      notes: input.notes ?? null,
      status: "ACTIVE",
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
    });
  }

  static reconstitute(id: string, props: PayrollAdjustmentProps): PayrollAdjustment {
    return new PayrollAdjustment(id, props);
  }

  cancel(input: { reason: string; cancelledBy?: string | null }): void {
    if (this.props.status === "CANCELLED") throw new PayrollAdjustmentAlreadyCancelledError();
    if (!input.reason?.trim()) throw new CancellationReasonRequiredError();

    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy ?? null;
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = input.reason.trim();
  }

  get employeeId(): string { return this.props.employeeId; }
  get entryDate(): Date { return this.props.entryDate; }
  get adjustmentType(): AdjustmentType { return this.props.adjustmentType; }
  get amount(): number { return this.props.amount; }
  get notes(): string | null { return this.props.notes; }
  get status(): AdjustmentStatus { return this.props.status; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
}
