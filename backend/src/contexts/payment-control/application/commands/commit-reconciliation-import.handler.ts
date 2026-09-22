import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ReconciliationRecord } from "../../domain/reconciliation-record.aggregate";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";
import { EmptyImportBatchError } from "../../domain/errors";

export interface ImportReconciliationRow {
  externalDate: Date;
  externalAmount: number;
  externalReference?: string | null;
}

export interface CommitReconciliationImportCommand {
  source: string;
  branchId?: string | null;
  rows: ImportReconciliationRow[];
  enteredBy?: string | null;
}

// استيراد كشف حساب (CSV) بالجملة - راجع تعليق migration 034. اختيار عمود التاريخ/المبلغ/المرجع بيحصل
// في الفرونت إند (المحاسب بيشوف عيّنة من الملف الخام ويحدد بنفسه)، هنا بنستقبل الصفوف بعد ما
// اتحدّدت أعمدتها بالفعل - نفس فلسفة الريبو القديم (Phase 2 import) بس من غير endpoint preview منفصل،
// لأن المعاينة والتحويل لعمود بيحصلوا محليًا في المتصفح على ملف المحاسب نفسه من غير حاجة لرحلة شبكة
@Injectable()
export class CommitReconciliationImportHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort
  ) {}

  async execute(command: CommitReconciliationImportCommand): Promise<{ batchId: string; count: number }> {
    if (command.rows.length === 0) throw new EmptyImportBatchError();

    const batchId = randomUUID();
    for (const row of command.rows) {
      const record = ReconciliationRecord.register({
        source: command.source,
        branchId: command.branchId,
        externalAmount: row.externalAmount,
        externalDate: row.externalDate,
        externalReference: row.externalReference,
        enteredBy: command.enteredBy,
        importBatchId: batchId,
      });
      await this.records.save(record);
    }

    return { batchId, count: command.rows.length };
  }
}
