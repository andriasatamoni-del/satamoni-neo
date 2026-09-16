import { Inject, Injectable } from "@nestjs/common";
import { ReconciliationRecord } from "../../domain/reconciliation-record.aggregate";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";
import { ReconciliationRecordNotFoundError } from "../../domain/errors";

@Injectable()
export class IgnoreReconciliationRecordHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort
  ) {}

  async execute(recordId: string): Promise<ReconciliationRecord> {
    const record = await this.records.findById(recordId);
    if (!record) throw new ReconciliationRecordNotFoundError();
    record.ignore();
    await this.records.save(record);
    return record;
  }
}
