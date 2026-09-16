import { Inject, Injectable } from "@nestjs/common";
import { ReconciliationRecord } from "../../domain/reconciliation-record.aggregate";
import {
  RECONCILIATION_RECORD_REPOSITORY,
  type ReconciliationRecordRepositoryPort,
} from "../../domain/ports/reconciliation-record-repository.port";

export interface RegisterReconciliationRecordCommand {
  branchId?: string | null;
  source: string;
  externalReference?: string | null;
  externalAmount: number;
  externalDate: Date;
  notes?: string | null;
  enteredBy?: string | null;
}

@Injectable()
export class RegisterReconciliationRecordHandler {
  constructor(
    @Inject(RECONCILIATION_RECORD_REPOSITORY) private readonly records: ReconciliationRecordRepositoryPort
  ) {}

  async execute(command: RegisterReconciliationRecordCommand): Promise<ReconciliationRecord> {
    const record = ReconciliationRecord.register(command);
    await this.records.save(record);
    return record;
  }
}
