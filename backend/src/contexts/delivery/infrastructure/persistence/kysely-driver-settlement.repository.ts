import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { DriverSettlement, type VarianceStatus } from "../../domain/driver-settlement.aggregate";
import type { DriverSettlementRepositoryPort } from "../../domain/ports/driver-settlement-repository.port";
import type { DriverSettlementsTable } from "./delivery.schema";

@Injectable()
export class KyselyDriverSettlementRepository implements DriverSettlementRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(settlement: DriverSettlement): Promise<void> {
    await this.db
      .insertInto("driver_settlements")
      .values({
        id: settlement.id,
        driver_id: settlement.driverId,
        branch_id: settlement.branchId,
        settled_by: settlement.settledBy,
        settled_at: settlement.settledAt,
        order_count: settlement.orderCount,
        cod_expected: settlement.codExpected,
        cod_collected: settlement.codCollected,
        expected_handover: settlement.expectedHandover,
        actual_handover: settlement.actualHandover,
        handover_variance: settlement.handoverVariance,
        variance_status: settlement.varianceStatus,
        variance_reviewed_by: settlement.varianceReviewedBy,
        variance_reviewed_at: settlement.varianceReviewedAt,
        variance_review_notes: settlement.varianceReviewNotes,
        bonus_total: settlement.bonusTotal,
        notes: settlement.notes,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          variance_status: settlement.varianceStatus,
          variance_reviewed_by: settlement.varianceReviewedBy,
          variance_reviewed_at: settlement.varianceReviewedAt,
          variance_review_notes: settlement.varianceReviewNotes,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<DriverSettlement | null> {
    const row = await this.db.selectFrom("driver_settlements").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { driverId?: string; branchId?: string; varianceStatus?: string }): Promise<DriverSettlement[]> {
    let query = this.db.selectFrom("driver_settlements").selectAll();
    if (filter?.driverId) query = query.where("driver_id", "=", filter.driverId);
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.varianceStatus) query = query.where("variance_status", "=", filter.varianceStatus);
    const rows = await query.orderBy("settled_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<DriverSettlementsTable>): DriverSettlement {
    return DriverSettlement.reconstitute(row.id, {
      driverId: row.driver_id,
      branchId: row.branch_id,
      settledBy: row.settled_by,
      settledAt: row.settled_at,
      orderCount: row.order_count,
      codExpected: Number(row.cod_expected),
      codCollected: Number(row.cod_collected),
      expectedHandover: Number(row.expected_handover),
      actualHandover: Number(row.actual_handover),
      handoverVariance: Number(row.handover_variance),
      varianceStatus: row.variance_status as VarianceStatus,
      varianceReviewedBy: row.variance_reviewed_by,
      varianceReviewedAt: row.variance_reviewed_at,
      varianceReviewNotes: row.variance_review_notes,
      bonusTotal: Number(row.bonus_total),
      notes: row.notes,
    });
  }
}
