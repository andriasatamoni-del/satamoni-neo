import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { DeliveryAssignment, type DispatchStatus } from "../../domain/delivery-assignment.aggregate";
import type { DeliveryAssignmentRepositoryPort } from "../../domain/ports/delivery-assignment-repository.port";
import { deliveryAssignments } from "./delivery.tables";

@Injectable()
export class DeliveryAssignmentRepository implements DeliveryAssignmentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(assignment: DeliveryAssignment): Promise<void> {
    const row = this.toRow(assignment);
    await this.db
      .insert(deliveryAssignments)
      .values(row)
      .onConflictDoUpdate({
        target: deliveryAssignments.id,
        set: {
          status: row.status,
          delivered_at: row.delivered_at,
          failure_reason: row.failure_reason,
          collected_amount: row.collected_amount,
          settlement_id: row.settlement_id,
        },
      });
  }

  async findById(id: string): Promise<DeliveryAssignment | null> {
    const [row] = await this.db.select().from(deliveryAssignments).where(eq(deliveryAssignments.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<DeliveryAssignment | null> {
    const [row] = await this.db.select().from(deliveryAssignments).where(eq(deliveryAssignments.order_id, orderId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; driverId?: string }): Promise<DeliveryAssignment[]> {
    const rows = await this.db
      .select()
      .from(deliveryAssignments)
      .where(
        and(
          filter?.branchId ? eq(deliveryAssignments.branch_id, filter.branchId) : undefined,
          filter?.driverId ? eq(deliveryAssignments.driver_id, filter.driverId) : undefined
        )
      )
      .orderBy(desc(deliveryAssignments.assigned_at));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(assignment: DeliveryAssignment): typeof deliveryAssignments.$inferInsert {
    return {
      id: assignment.id,
      order_id: assignment.orderId,
      driver_id: assignment.driverId,
      branch_id: assignment.branchId,
      status: assignment.status,
      assigned_by: assignment.assignedBy,
      assigned_at: assignment.assignedAt,
      delivered_at: assignment.deliveredAt,
      failure_reason: assignment.failureReason,
      collected_amount: assignment.collectedAmount,
      settlement_id: assignment.settlementId,
    };
  }

  private toDomain(row: typeof deliveryAssignments.$inferSelect): DeliveryAssignment {
    return DeliveryAssignment.reconstitute(row.id, {
      orderId: row.order_id,
      driverId: row.driver_id,
      branchId: row.branch_id,
      status: row.status as DispatchStatus,
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      deliveredAt: row.delivered_at,
      failureReason: row.failure_reason,
      collectedAmount: row.collected_amount === null ? null : Number(row.collected_amount),
      settlementId: row.settlement_id,
    });
  }
}
