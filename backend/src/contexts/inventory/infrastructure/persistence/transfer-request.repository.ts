import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, lte, or } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { TransferRequest, type TransferRequestStatus } from "../../domain/transfer-request.aggregate";
import type { TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { transferRequestLines, transferRequests } from "./inventory.tables";

@Injectable()
export class TransferRequestRepository implements TransferRequestRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(request: TransferRequest): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(transferRequests)
        .values({
          id: request.id,
          from_branch_id: request.fromBranchId,
          to_branch_id: request.toBranchId,
          requested_by: request.requestedBy,
          required_date: request.requiredDate,
          notes: request.notes,
          status: request.status,
          approved_by: request.approvedBy,
          approved_at: request.approvedAt,
          rejected_by: request.rejectedBy,
          rejection_reason: request.rejectionReason,
          dispatched_by: request.dispatchedBy,
          dispatched_at: request.dispatchedAt,
          received_by: request.receivedBy,
          received_at: request.receivedAt,
          cancelled_by: request.cancelledBy,
          cancelled_at: request.cancelledAt,
          cancellation_reason: request.cancellationReason,
          created_at: request.createdAt,
        })
        .onConflictDoUpdate({
          target: transferRequests.id,
          set: {
            status: request.status,
            approved_by: request.approvedBy,
            approved_at: request.approvedAt,
            rejected_by: request.rejectedBy,
            rejection_reason: request.rejectionReason,
            dispatched_by: request.dispatchedBy,
            dispatched_at: request.dispatchedAt,
            received_by: request.receivedBy,
            received_at: request.receivedAt,
            cancelled_by: request.cancelledBy,
            cancelled_at: request.cancelledAt,
            cancellation_reason: request.cancellationReason,
          },
        });

      for (const line of request.lines) {
        await tx
          .insert(transferRequestLines)
          .values({
            id: line.id,
            transfer_request_id: request.id,
            inventory_item_id: line.inventoryItemId,
            requested_quantity: line.requestedQuantity,
            approved_quantity: line.approvedQuantity,
            dispatched_quantity: line.dispatchedQuantity,
            received_quantity: line.receivedQuantity,
            dispatch_movement_id: line.dispatchMovementId,
            receive_movement_id: line.receiveMovementId,
          })
          .onConflictDoUpdate({
            target: transferRequestLines.id,
            set: {
              approved_quantity: line.approvedQuantity,
              dispatched_quantity: line.dispatchedQuantity,
              received_quantity: line.receivedQuantity,
              dispatch_movement_id: line.dispatchMovementId,
              receive_movement_id: line.receiveMovementId,
            },
          });
      }
    });
  }

  async findById(id: string): Promise<TransferRequest | null> {
    const [row] = await this.db.select().from(transferRequests).where(eq(transferRequests.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { fromBranchId?: string; toBranchId?: string; involvingBranchId?: string; status?: string; fromDate?: Date; toDate?: Date }): Promise<TransferRequest[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { fromBranchId?: string; toBranchId?: string; involvingBranchId?: string; status?: string; fromDate?: Date; toDate?: Date }, page?: PageRequest): Promise<{ rows: TransferRequest[]; total: number }> {
    const where = and(
      filter?.fromBranchId ? eq(transferRequests.from_branch_id, filter.fromBranchId) : undefined,
      filter?.toBranchId ? eq(transferRequests.to_branch_id, filter.toBranchId) : undefined,
      filter?.involvingBranchId
        ? or(eq(transferRequests.from_branch_id, filter.involvingBranchId), eq(transferRequests.to_branch_id, filter.involvingBranchId))
        : undefined,
      filter?.status ? eq(transferRequests.status, filter.status) : undefined,
      filter?.fromDate ? gte(transferRequests.required_date, filter.fromDate) : undefined,
      filter?.toDate ? lte(transferRequests.required_date, filter.toDate) : undefined
    );
    const query = this.db.select().from(transferRequests).where(where).orderBy(desc(transferRequests.created_at), desc(transferRequests.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(transferRequests).where(where)));
    const requests: TransferRequest[] = [];
    for (const row of rows) requests.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: requests, total };
  }

  private loadLines(requestId: string): Promise<(typeof transferRequestLines.$inferSelect)[]> {
    return this.db.select().from(transferRequestLines).where(eq(transferRequestLines.transfer_request_id, requestId));
  }

  private toDomain(
    row: typeof transferRequests.$inferSelect,
    lineRows: (typeof transferRequestLines.$inferSelect)[]
  ): TransferRequest {
    return TransferRequest.reconstitute(row.id, {
      fromBranchId: row.from_branch_id,
      toBranchId: row.to_branch_id,
      requestedBy: row.requested_by,
      requiredDate: row.required_date,
      notes: row.notes,
      status: row.status as TransferRequestStatus,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        requestedQuantity: Number(l.requested_quantity),
        approvedQuantity: l.approved_quantity === null ? null : Number(l.approved_quantity),
        dispatchedQuantity: l.dispatched_quantity === null ? null : Number(l.dispatched_quantity),
        receivedQuantity: l.received_quantity === null ? null : Number(l.received_quantity),
        dispatchMovementId: l.dispatch_movement_id,
        receiveMovementId: l.receive_movement_id,
      })),
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectedBy: row.rejected_by,
      rejectionReason: row.rejection_reason,
      dispatchedBy: row.dispatched_by,
      dispatchedAt: row.dispatched_at,
      receivedBy: row.received_by,
      receivedAt: row.received_at,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
    });
  }
}
