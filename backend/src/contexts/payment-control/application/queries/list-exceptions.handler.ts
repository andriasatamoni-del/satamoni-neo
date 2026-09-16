import { Inject, Injectable } from "@nestjs/common";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";

const STALE_UNMATCHED_DAYS = 3;
const STALE_UNMATCHED_RISK_SCORE = 30;
const MATCHABLE_CHANNELS = ["instapay", "orange_cash"];

export interface PaymentException {
  paymentId: string;
  orderId: string;
  branchId: string;
  settlementChannel: string;
  amount: number;
  lockedAt: Date;
  riskScore: number;
  riskLevel: "منخفض" | "متوسط" | "عالي";
  reason: string;
}

// نقاط مخاطر (Risk Score) - بتتحسب لحظيًا وقت الاستعلام (مش عمود مخزّن)، نفس فلسفة الريبو القديم
// بالظبط. مبسّط عمدًا لنوع استثناء واحد بس فعليًا قابل للحساب من غير استيراد CSV: دفعة إنستاباي/أورانج
// كاش من غير مطابقة بعد 3 أيام (30 نقطة - نفس وزن الريبو القديم). باقي أنواع الريبو القديم (فرق كاش
// طلبات، فرق تسوية فيزا الدوري، تكرار تعديلات نفس الكاشير في شيفت) محتاجة مفاهيم مش موجودة في النظام
// الجديد لسه (استيراد كشف حساب دوري، مفهوم "أوردر من طلبات" مميز عن التوصيل العادي، aggregate شيفت) -
// مؤجّلة صراحة، مش مبنية بتخمين.
@Injectable()
export class ListExceptionsHandler {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort
  ) {}

  async execute(filter?: { branchId?: string }): Promise<PaymentException[]> {
    const matchedPaymentIds = new Set(
      (await this.records.list({ matchStatus: "MATCHED" })).map((r) => r.matchedPaymentId).filter((id): id is string => !!id)
    );

    const exceptions: PaymentException[] = [];
    const staleCutoff = Date.now() - STALE_UNMATCHED_DAYS * 24 * 60 * 60 * 1000;

    for (const channel of MATCHABLE_CHANNELS) {
      const payments = await this.payments.list({ branchId: filter?.branchId, settlementChannel: channel });
      for (const payment of payments) {
        if (matchedPaymentIds.has(payment.id)) continue;
        if (payment.lockedAt.getTime() > staleCutoff) continue;
        exceptions.push({
          paymentId: payment.id,
          orderId: payment.orderId,
          branchId: payment.branchId,
          settlementChannel: channel,
          amount: payment.amount,
          lockedAt: payment.lockedAt,
          riskScore: STALE_UNMATCHED_RISK_SCORE,
          riskLevel: this.classify(STALE_UNMATCHED_RISK_SCORE),
          reason: `دفعة ${channel} من غير مطابقة بعد ${STALE_UNMATCHED_DAYS} أيام`,
        });
      }
    }

    return exceptions;
  }

  private classify(score: number): "منخفض" | "متوسط" | "عالي" {
    if (score >= 60) return "عالي";
    if (score >= 30) return "متوسط";
    return "منخفض";
  }
}
