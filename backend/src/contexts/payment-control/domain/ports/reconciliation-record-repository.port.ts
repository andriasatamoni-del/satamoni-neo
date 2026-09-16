import type { ReconciliationRecord } from "../reconciliation-record.aggregate";

export interface ReconciliationRecordRepositoryPort {
  save(record: ReconciliationRecord): Promise<void>;
  findById(id: string): Promise<ReconciliationRecord | null>;
  findByLegacyReconciliationRecordId(legacyId: number): Promise<ReconciliationRecord | null>;
  list(filter?: { branchId?: string; source?: string; matchStatus?: string }): Promise<ReconciliationRecord[]>;
  listUnmatchedBySource(source: string): Promise<ReconciliationRecord[]>;
}

export const RECONCILIATION_RECORD_REPOSITORY = Symbol("RECONCILIATION_RECORD_REPOSITORY");
