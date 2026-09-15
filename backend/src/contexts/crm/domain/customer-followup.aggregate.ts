import { randomUUID } from "node:crypto";
import { UnknownCallResultError, UnknownSatisfactionRatingError } from "./errors";

export const CALL_RESULTS = ["answered", "no_answer", "no_answer_after_3_tries"] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export const SATISFACTION_RATINGS = ["excellent", "good", "average", "bad"] as const;
export type SatisfactionRating = (typeof SATISFACTION_RATINGS)[number];

export interface CustomerFollowupProps {
  legacyOrderId: number | null;
  branchId: string | null;
  customerPhone: string;
  callResult: CallResult;
  satisfactionRating: SatisfactionRating | null;
  notes: string | null;
  hasComplaint: boolean;
  calledBy: string | null;
  calledAt: Date;
  legacyFollowupId: number | null;
}

// نفس مفهوم customer_followups في الريبو القديم (CRM-1): مكالمة متابعة جودة بعد تسليم أوردر دليفري.
// order_id بقى legacyOrderId عادي (مش FK) لأن Orders context لسه ما اتبناش - راجع تعليق migration
// 002_create_crm_tables. صف واحد بيتحدّث (upsert) لكل legacyOrderId - نفس منطق ON CONFLICT (order_id)
// في الريبو القديم، بس هنا الـapplication layer (RecordFollowupHandler) هو اللي بيقرر create/update.
export class CustomerFollowup {
  private constructor(
    public readonly id: string,
    private props: CustomerFollowupProps
  ) {}

  static register(input: {
    legacyOrderId?: number | null;
    branchId?: string | null;
    customerPhone: string;
    callResult: string;
    satisfactionRating?: string | null;
    notes?: string | null;
    hasComplaint?: boolean;
    calledBy?: string | null;
    legacyFollowupId?: number | null;
  }): CustomerFollowup {
    if (!CALL_RESULTS.includes(input.callResult as CallResult)) {
      throw new UnknownCallResultError(input.callResult);
    }
    if (
      input.satisfactionRating != null &&
      !SATISFACTION_RATINGS.includes(input.satisfactionRating as SatisfactionRating)
    ) {
      throw new UnknownSatisfactionRatingError(input.satisfactionRating);
    }

    return new CustomerFollowup(randomUUID(), {
      legacyOrderId: input.legacyOrderId ?? null,
      branchId: input.branchId ?? null,
      customerPhone: input.customerPhone,
      callResult: input.callResult as CallResult,
      satisfactionRating: (input.satisfactionRating as SatisfactionRating) ?? null,
      notes: input.notes ?? null,
      hasComplaint: !!input.hasComplaint,
      calledBy: input.calledBy ?? null,
      calledAt: new Date(),
      legacyFollowupId: input.legacyFollowupId ?? null,
    });
  }

  static reconstitute(id: string, props: CustomerFollowupProps): CustomerFollowup {
    return new CustomerFollowup(id, props);
  }

  // محاولة اتصال تانية على نفس الأوردر - بتحدّث نفس الصف زي الريبو القديم بالظبط
  recordCall(input: {
    callResult: string;
    satisfactionRating?: string | null;
    notes?: string | null;
    hasComplaint?: boolean;
    calledBy?: string | null;
  }): void {
    if (!CALL_RESULTS.includes(input.callResult as CallResult)) {
      throw new UnknownCallResultError(input.callResult);
    }
    if (
      input.satisfactionRating != null &&
      !SATISFACTION_RATINGS.includes(input.satisfactionRating as SatisfactionRating)
    ) {
      throw new UnknownSatisfactionRatingError(input.satisfactionRating);
    }
    this.props.callResult = input.callResult as CallResult;
    this.props.satisfactionRating = (input.satisfactionRating as SatisfactionRating) ?? null;
    this.props.notes = input.notes ?? null;
    this.props.hasComplaint = !!input.hasComplaint;
    this.props.calledBy = input.calledBy ?? null;
    this.props.calledAt = new Date();
  }

  get legacyOrderId(): number | null { return this.props.legacyOrderId; }
  get branchId(): string | null { return this.props.branchId; }
  get customerPhone(): string { return this.props.customerPhone; }
  get callResult(): CallResult { return this.props.callResult; }
  get satisfactionRating(): SatisfactionRating | null { return this.props.satisfactionRating; }
  get notes(): string | null { return this.props.notes; }
  get hasComplaint(): boolean { return this.props.hasComplaint; }
  get calledBy(): string | null { return this.props.calledBy; }
  get calledAt(): Date { return this.props.calledAt; }
  get legacyFollowupId(): number | null { return this.props.legacyFollowupId; }
}
