import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { ReconciliationRecord } from "../../domain/reconciliation-record.aggregate";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";

@Injectable()
export class ListReconciliationRecordsHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort
  ) {}

  async execute(filter?: { branchId?: string; source?: string; matchStatus?: string }, page?: PageRequest): Promise<{ rows: ReconciliationRecord[]; total: number }> {
    return this.records.listPage(filter, page);
  }
}
