import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { ReconciliationRecord, type MatchStatus, type ReconciliationSource } from "../../domain/reconciliation-record.aggregate";
import type { ReconciliationRecordRepositoryPort } from "../../domain/ports/reconciliation-record-repository.port";
import { paymentReconciliationRecords } from "./payment-control.tables";

@Injectable()
export class ReconciliationRecordRepository implements ReconciliationRecordRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: ReconciliationRecord): Promise<void> {
    const row = this.toRow(record);
    await this.db
      .insert(paymentReconciliationRecords)
      .values(row)
      .onConflictDoUpdate({
        target: paymentReconciliationRecords.id,
        set: {
          external_reference: row.external_reference,
          external_amount: row.external_amount,
          external_date: row.external_date,
          matched_payment_id: row.matched_payment_id,
          match_status: row.match_status,
          notes: row.notes,
        },
      });
  }

  async findById(id: string): Promise<ReconciliationRecord | null> {
    const [row] = await this.db.select().from(paymentReconciliationRecords).where(eq(paymentReconciliationRecords.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyReconciliationRecordId(legacyId: number): Promise<ReconciliationRecord | null> {
    const [row] = await this.db
      .select()
      .from(paymentReconciliationRecords)
      .where(eq(paymentReconciliationRecords.legacy_reconciliation_record_id, legacyId))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; source?: string; matchStatus?: string }): Promise<ReconciliationRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentReconciliationRecords)
      .where(
        and(
          filter?.branchId ? eq(paymentReconciliationRecords.branch_id, filter.branchId) : undefined,
          filter?.source ? eq(paymentReconciliationRecords.source, filter.source) : undefined,
          filter?.matchStatus ? eq(paymentReconciliationRecords.match_status, filter.matchStatus) : undefined
        )
      )
      .orderBy(desc(paymentReconciliationRecords.external_date));
    return rows.map((r) => this.toDomain(r));
  }

  async listUnmatchedBySource(source: string): Promise<ReconciliationRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentReconciliationRecords)
      .where(and(eq(paymentReconciliationRecords.source, source), eq(paymentReconciliationRecords.match_status, "UNMATCHED")));
    return rows.map((r) => this.toDomain(r));
  }

  async listByImportBatchId(importBatchId: string): Promise<ReconciliationRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentReconciliationRecords)
      .where(eq(paymentReconciliationRecords.import_batch_id, importBatchId));
    return rows.map((r) => this.toDomain(r));
  }

  async deleteByImportBatchId(importBatchId: string): Promise<void> {
    await this.db.delete(paymentReconciliationRecords).where(eq(paymentReconciliationRecords.import_batch_id, importBatchId));
  }

  private toRow(record: ReconciliationRecord) {
    return {
      id: record.id,
      branch_id: record.branchId,
      source: record.source,
      external_reference: record.externalReference,
      external_amount: record.externalAmount,
      external_date: record.externalDate,
      matched_payment_id: record.matchedPaymentId,
      match_status: record.matchStatus,
      notes: record.notes,
      entered_by: record.enteredBy,
      entered_at: record.enteredAt,
      legacy_reconciliation_record_id: record.legacyReconciliationRecordId,
      import_batch_id: record.importBatchId,
    };
  }

  private toDomain(row: typeof paymentReconciliationRecords.$inferSelect): ReconciliationRecord {
    return ReconciliationRecord.reconstitute(row.id, {
      branchId: row.branch_id,
      source: row.source as ReconciliationSource,
      externalReference: row.external_reference,
      externalAmount: Number(row.external_amount),
      externalDate: row.external_date,
      matchedPaymentId: row.matched_payment_id,
      matchStatus: row.match_status as MatchStatus,
      notes: row.notes,
      enteredBy: row.entered_by,
      enteredAt: row.entered_at,
      legacyReconciliationRecordId: row.legacy_reconciliation_record_id,
      importBatchId: row.import_batch_id,
    });
  }
}
