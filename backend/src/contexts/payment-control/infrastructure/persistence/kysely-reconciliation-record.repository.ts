import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { ReconciliationRecord, type MatchStatus, type ReconciliationSource } from "../../domain/reconciliation-record.aggregate";
import type { ReconciliationRecordRepositoryPort } from "../../domain/ports/reconciliation-record-repository.port";
import type { PaymentReconciliationRecordsTable } from "./payment-control.schema";

@Injectable()
export class KyselyReconciliationRecordRepository implements ReconciliationRecordRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(record: ReconciliationRecord): Promise<void> {
    const row = this.toRow(record);
    await this.db
      .insertInto("payment_reconciliation_records")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          external_reference: row.external_reference,
          external_amount: row.external_amount,
          external_date: row.external_date,
          matched_payment_id: row.matched_payment_id,
          match_status: row.match_status,
          notes: row.notes,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<ReconciliationRecord | null> {
    const row = await this.db.selectFrom("payment_reconciliation_records").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyReconciliationRecordId(legacyId: number): Promise<ReconciliationRecord | null> {
    const row = await this.db
      .selectFrom("payment_reconciliation_records")
      .selectAll()
      .where("legacy_reconciliation_record_id", "=", legacyId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; source?: string; matchStatus?: string }): Promise<ReconciliationRecord[]> {
    let query = this.db.selectFrom("payment_reconciliation_records").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.source) query = query.where("source", "=", filter.source);
    if (filter?.matchStatus) query = query.where("match_status", "=", filter.matchStatus);
    const rows = await query.orderBy("external_date", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  async listUnmatchedBySource(source: string): Promise<ReconciliationRecord[]> {
    const rows = await this.db
      .selectFrom("payment_reconciliation_records")
      .selectAll()
      .where("source", "=", source)
      .where("match_status", "=", "UNMATCHED")
      .execute();
    return rows.map((r) => this.toDomain(r));
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
    };
  }

  private toDomain(row: Selectable<PaymentReconciliationRecordsTable>): ReconciliationRecord {
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
    });
  }
}
