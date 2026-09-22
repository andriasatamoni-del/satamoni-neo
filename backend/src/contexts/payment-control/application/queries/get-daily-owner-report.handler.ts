import { Inject, Injectable } from "@nestjs/common";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../domain/ports/payment-adjustment-request-repository.port";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";
import { ListExceptionsHandler } from "./list-exceptions.handler";

export interface DailyOwnerReportQuery {
  date: string; // YYYY-MM-DD
  branchId?: string;
}

export interface DailyOwnerReport {
  date: string;
  branchId: string | null;
  totalsByChannel: { channel: string; count: number; totalAmount: number }[];
  totalAmount: number;
  pendingAdjustmentRequests: number;
  unmatchedReconciliationRecords: { source: string; count: number }[];
  exceptionsCount: number;
  highRiskExceptionsCount: number;
}

// تقرير المالك اليومي - ملخّص سريع لحالة المدفوعات في يوم معيّن، بديل "شوف كل تبويب لوحده" للمالك.
// بيتحسب لحظيًا وقت الطلب (زي نقاط المخاطر بالظبط)، مش عمود مخزّن ولا تقرير مجدوَل. الإرسال التلقائي
// عبر SMS (زي الريبو القديم db/payment-report-scheduler.js) برّه النطاق هنا عمدًا - النظام الجديد
// مفيهوش تكامل بوابة SMS لسه، وإضافته لمجرد التقرير ده قرار منفصل يستاهل تفكير خاص بيه
@Injectable()
export class GetDailyOwnerReportHandler {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly adjustmentRequests: PaymentAdjustmentRequestRepositoryPort,
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort,
    private readonly listExceptions: ListExceptionsHandler
  ) {}

  async execute(query: DailyOwnerReportQuery): Promise<DailyOwnerReport> {
    const dayStart = new Date(`${query.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${query.date}T23:59:59.999Z`);

    const dayPayments = await this.payments.list({ branchId: query.branchId, fromDate: dayStart, toDate: dayEnd });

    const byChannel = new Map<string, { count: number; totalAmount: number }>();
    for (const payment of dayPayments) {
      const key = payment.settlementChannel ?? payment.methodKind;
      const entry = byChannel.get(key) ?? { count: 0, totalAmount: 0 };
      entry.count += 1;
      entry.totalAmount += payment.amount;
      byChannel.set(key, entry);
    }

    const pendingAdjustmentRequests = (await this.adjustmentRequests.list({ status: "PENDING" })).length;

    const unmatched = await this.records.list({ branchId: query.branchId, matchStatus: "UNMATCHED" });
    const unmatchedBySource = new Map<string, number>();
    for (const record of unmatched) {
      unmatchedBySource.set(record.source, (unmatchedBySource.get(record.source) ?? 0) + 1);
    }

    const exceptions = await this.listExceptions.execute({ branchId: query.branchId });

    return {
      date: query.date,
      branchId: query.branchId ?? null,
      totalsByChannel: [...byChannel.entries()].map(([channel, v]) => ({ channel, ...v })),
      totalAmount: dayPayments.reduce((sum, p) => sum + p.amount, 0),
      pendingAdjustmentRequests,
      unmatchedReconciliationRecords: [...unmatchedBySource.entries()].map(([source, count]) => ({ source, count })),
      exceptionsCount: exceptions.length,
      highRiskExceptionsCount: exceptions.filter((e) => e.riskLevel === "عالي").length,
    };
  }
}
