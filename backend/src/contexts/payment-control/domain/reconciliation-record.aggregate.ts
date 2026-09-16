import { randomUUID } from "node:crypto";
import { ReconciliationRecordAlreadyDecidedError } from "./errors";

export const RECONCILIATION_SOURCES = ["talabat_statement", "visa_settlement", "instapay", "orange_cash"] as const;
export type ReconciliationSource = (typeof RECONCILIATION_SOURCES)[number];

export const MATCH_STATUSES = ["UNMATCHED", "MATCHED", "IGNORED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface ReconciliationRecordProps {
  branchId: string | null;
  source: ReconciliationSource;
  externalReference: string | null;
  externalAmount: number;
  externalDate: Date;
  matchedPaymentId: string | null;
  matchStatus: MatchStatus;
  notes: string | null;
  enteredBy: string | null;
  enteredAt: Date;
  legacyReconciliationRecordId: number | null;
}

// ReconciliationRecord - سطر كشف حساب خارجي (طلبات/فيزا/إنستاباي/أورانج كاش) بيتقارن مع Payment مقفولة
// - المصدر المستقل التاني في المطابقة (نفس فلسفة الريبو القديم: "المطابقة بتقارن مصدرين مستقلين،
// مايوحّدهمش تلقائي"). match()/ignore() قرار بشري أو مطابقة تلقائية "مؤكدة بس" (راجع
// AutoMatchReconciliationRecordsHandler) - مفيش تخمين.
export class ReconciliationRecord {
  private constructor(
    public readonly id: string,
    private props: ReconciliationRecordProps
  ) {}

  static register(input: {
    branchId?: string | null;
    source: string;
    externalReference?: string | null;
    externalAmount: number;
    externalDate: Date;
    notes?: string | null;
    enteredBy?: string | null;
    legacyReconciliationRecordId?: number | null;
  }): ReconciliationRecord {
    return new ReconciliationRecord(randomUUID(), {
      branchId: input.branchId ?? null,
      source: input.source as ReconciliationSource,
      externalReference: input.externalReference ?? null,
      externalAmount: input.externalAmount,
      externalDate: input.externalDate,
      matchedPaymentId: null,
      matchStatus: "UNMATCHED",
      notes: input.notes ?? null,
      enteredBy: input.enteredBy ?? null,
      enteredAt: new Date(),
      legacyReconciliationRecordId: input.legacyReconciliationRecordId ?? null,
    });
  }

  static reconstitute(id: string, props: ReconciliationRecordProps): ReconciliationRecord {
    return new ReconciliationRecord(id, props);
  }

  match(paymentId: string): void {
    if (this.props.matchStatus !== "UNMATCHED") throw new ReconciliationRecordAlreadyDecidedError();
    this.props.matchStatus = "MATCHED";
    this.props.matchedPaymentId = paymentId;
  }

  ignore(): void {
    if (this.props.matchStatus !== "UNMATCHED") throw new ReconciliationRecordAlreadyDecidedError();
    this.props.matchStatus = "IGNORED";
  }

  get branchId(): string | null { return this.props.branchId; }
  get source(): ReconciliationSource { return this.props.source; }
  get externalReference(): string | null { return this.props.externalReference; }
  get externalAmount(): number { return this.props.externalAmount; }
  get externalDate(): Date { return this.props.externalDate; }
  get matchedPaymentId(): string | null { return this.props.matchedPaymentId; }
  get matchStatus(): MatchStatus { return this.props.matchStatus; }
  get notes(): string | null { return this.props.notes; }
  get enteredBy(): string | null { return this.props.enteredBy; }
  get enteredAt(): Date { return this.props.enteredAt; }
  get legacyReconciliationRecordId(): number | null { return this.props.legacyReconciliationRecordId; }
}
