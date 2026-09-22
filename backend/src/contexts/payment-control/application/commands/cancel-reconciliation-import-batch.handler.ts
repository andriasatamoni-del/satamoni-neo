import { Inject, Injectable } from "@nestjs/common";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";
import { ImportBatchHasDecidedRecordsError, ImportBatchNotFoundError } from "../../domain/errors";

// بيلغي دفعة استيراد كاملة مرة واحدة (مثلًا لو المحاسب اكتشف إنه حدد عمود غلط) - بس لو لسه كل سطورها
// UNMATCHED. سطر اتطابق أو اتجاهل بالفعل لازم يترجع يدويًا سطر سطر، مش تلقائي - راجع تعليق
// ImportBatchHasDecidedRecordsError
@Injectable()
export class CancelReconciliationImportBatchHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort
  ) {}

  async execute(batchId: string): Promise<{ deleted: number }> {
    const batchRecords = await this.records.listByImportBatchId(batchId);
    if (batchRecords.length === 0) throw new ImportBatchNotFoundError();
    if (batchRecords.some((r) => r.matchStatus !== "UNMATCHED")) throw new ImportBatchHasDecidedRecordsError();

    await this.records.deleteByImportBatchId(batchId);
    return { deleted: batchRecords.length };
  }
}
