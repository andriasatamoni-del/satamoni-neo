import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { DeliveryAssignment, type DispatchStatus } from "../../domain/delivery-assignment.aggregate";
import type { DeliveryAssignmentRepositoryPort } from "../../domain/ports/delivery-assignment-repository.port";
import type { DeliveryAssignmentsTable } from "./delivery.schema";

@Injectable()
export class KyselyDeliveryAssignmentRepository implements DeliveryAssignmentRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(assignment: DeliveryAssignment): Promise<void> {
    const row = this.toRow(assignment);
    await this.db
      .insertInto("delivery_assignments")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({ status: row.status, delivered_at: row.delivered_at, failure_reason: row.failure_reason })
      )
      .execute();
  }

  async findById(id: string): Promise<DeliveryAssignment | null> {
    const row = await this.db.selectFrom("delivery_assignments").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<DeliveryAssignment | null> {
    const row = await this.db.selectFrom("delivery_assignments").selectAll().where("order_id", "=", orderId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; driverId?: string }): Promise<DeliveryAssignment[]> {
    let query = this.db.selectFrom("delivery_assignments").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.driverId) query = query.where("driver_id", "=", filter.driverId);
    const rows = await query.orderBy("assigned_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(assignment: DeliveryAssignment) {
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
    };
  }

  private toDomain(row: Selectable<DeliveryAssignmentsTable>): DeliveryAssignment {
    return DeliveryAssignment.reconstitute(row.id, {
      orderId: row.order_id,
      driverId: row.driver_id,
      branchId: row.branch_id,
      status: row.status as DispatchStatus,
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      deliveredAt: row.delivered_at,
      failureReason: row.failure_reason,
    });
  }
}
