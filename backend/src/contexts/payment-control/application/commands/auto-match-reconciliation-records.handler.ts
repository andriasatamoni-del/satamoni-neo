import { Inject, Injectable } from "@nestjs/common";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import type { ReconciliationRecord } from "../../domain/reconciliation-record.aggregate";
import type { Payment } from "../../domain/payment.aggregate";

const AMOUNT_TOLERANCE_EGP = 1;
const DATE_TOLERANCE_DAYS = 3;
// مقصورة على إنستاباي/أورانج كاش بس - نفس الريبو القديم بالحرف: طلبات (كاش) وفيزا (تسوية) فحوصهم
// مقارنة إجمالي فترة مقابل إجمالي فترة (مؤجّل، محتاج استيراد CSV لكشف الفترة كله - مش موجود هنا)،
// مفيش مفهوم "سطر داخلي = سطر خارجي واحد لواحد" هناك من الأساس يتطابق
const AUTO_MATCHABLE_CHANNELS = ["instapay", "orange_cash"] as const;

export interface AutoMatchResult {
  matched: number;
  leftUnmatched: number;
}

// مطابقة "مؤكدة" بس (unique mutual match): سطر كشف له دفعة واحدة مرشحة ضمن سماحية المبلغ (±1 ج.م)
// والتاريخ (±3 أيام)، والدفعة دي نفسها مالهاش مرشح سطر تاني - أي غموض (أكتر من مرشح لأي طرف) بيتسيب
// UNMATCHED عمدًا، نفس فلسفة "مايخمّنش" في كل الوحدة بالظبط
@Injectable()
export class AutoMatchReconciliationRecordsHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort
  ) {}

  async execute(): Promise<AutoMatchResult> {
    const alreadyMatchedPaymentIds = new Set(
      (await this.records.list({ matchStatus: "MATCHED" })).map((r) => r.matchedPaymentId).filter((id): id is string => !!id)
    );

    let matched = 0;
    let leftUnmatched = 0;

    for (const channel of AUTO_MATCHABLE_CHANNELS) {
      const unmatchedRecords = await this.records.listUnmatchedBySource(channel);
      const candidatePayments = (await this.payments.list({ settlementChannel: channel })).filter(
        (p) => !alreadyMatchedPaymentIds.has(p.id)
      );

      const candidatesByRecord = new Map<string, Payment[]>();
      const candidatesByPayment = new Map<string, ReconciliationRecord[]>();
      for (const record of unmatchedRecords) {
        const candidates = candidatePayments.filter((p) => this.isWithinTolerance(record, p));
        candidatesByRecord.set(record.id, candidates);
        for (const p of candidates) {
          candidatesByPayment.set(p.id, [...(candidatesByPayment.get(p.id) ?? []), record]);
        }
      }

      for (const record of unmatchedRecords) {
        const candidates = candidatesByRecord.get(record.id) ?? [];
        if (candidates.length !== 1) {
          leftUnmatched++;
          continue;
        }
        const payment = candidates[0];
        if ((candidatesByPayment.get(payment.id)?.length ?? 0) !== 1) {
          leftUnmatched++;
          continue;
        }
        record.match(payment.id);
        await this.records.save(record);
        alreadyMatchedPaymentIds.add(payment.id);
        matched++;
      }
    }

    return { matched, leftUnmatched };
  }

  private isWithinTolerance(record: ReconciliationRecord, payment: Payment): boolean {
    const amountDiff = Math.abs(record.externalAmount - payment.amount);
    const dayDiff = Math.abs(record.externalDate.getTime() - payment.lockedAt.getTime()) / (1000 * 60 * 60 * 24);
    return amountDiff <= AMOUNT_TOLERANCE_EGP && dayDiff <= DATE_TOLERANCE_DAYS;
  }
}
