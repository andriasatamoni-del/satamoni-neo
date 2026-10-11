import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { DriverSettlement, type VarianceStatus } from "../../domain/driver-settlement.aggregate";
import type { DriverSettlementRepositoryPort } from "../../domain/ports/driver-settlement-repository.port";
import { driverSettlements } from "./delivery.tables";

@Injectable()
export class DriverSettlementRepository implements DriverSettlementRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(settlement: DriverSettlement): Promise<void> {
    await this.db
      .insert(driverSettlements)
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
      .onConflictDoUpdate({
        target: driverSettlements.id,
        set: {
          variance_status: settlement.varianceStatus,
          variance_reviewed_by: settlement.varianceReviewedBy,
          variance_reviewed_at: settlement.varianceReviewedAt,
          variance_review_notes: settlement.varianceReviewNotes,
        },
      });
  }

  async findById(id: string): Promise<DriverSettlement | null> {
    const [row] = await this.db.select().from(driverSettlements).where(eq(driverSettlements.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { driverId?: string; branchId?: string; varianceStatus?: string }): Promise<DriverSettlement[]> {
    const rows = await this.db
      .select()
      .from(driverSettlements)
      .where(
        and(
          filter?.driverId ? eq(driverSettlements.driver_id, filter.driverId) : undefined,
          filter?.branchId ? eq(driverSettlements.branch_id, filter.branchId) : undefined,
          filter?.varianceStatus ? eq(driverSettlements.variance_status, filter.varianceStatus) : undefined
        )
      )
      .orderBy(desc(driverSettlements.settled_at));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof driverSettlements.$inferSelect): DriverSettlement {
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
