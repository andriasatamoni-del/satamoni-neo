import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { TransferRequest, type TransferRequestStatus } from "../../domain/transfer-request.aggregate";
import type { TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import type { TransferRequestLinesTable, TransferRequestsTable } from "./transfer-request.schema";

@Injectable()
export class KyselyTransferRequestRepository implements TransferRequestRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(request: TransferRequest): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("transfer_requests")
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
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
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
          })
        )
        .execute();

      for (const line of request.lines) {
        await trx
          .insertInto("transfer_request_lines")
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
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              approved_quantity: line.approvedQuantity,
              dispatched_quantity: line.dispatchedQuantity,
              received_quantity: line.receivedQuantity,
              dispatch_movement_id: line.dispatchMovementId,
              receive_movement_id: line.receiveMovementId,
            })
          )
          .execute();
      }
    });
  }

  async findById(id: string): Promise<TransferRequest | null> {
    const row = await this.db.selectFrom("transfer_requests").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { fromBranchId?: string; toBranchId?: string; status?: string; fromDate?: Date; toDate?: Date }): Promise<TransferRequest[]> {
    let query = this.db.selectFrom("transfer_requests").selectAll();
    if (filter?.fromBranchId) query = query.where("from_branch_id", "=", filter.fromBranchId);
    if (filter?.toBranchId) query = query.where("to_branch_id", "=", filter.toBranchId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    if (filter?.fromDate) query = query.where("required_date", ">=", filter.fromDate);
    if (filter?.toDate) query = query.where("required_date", "<=", filter.toDate);
    const rows = await query.orderBy("created_at", "desc").execute();
    const requests: TransferRequest[] = [];
    for (const row of rows) requests.push(this.toDomain(row, await this.loadLines(row.id)));
    return requests;
  }

  private loadLines(requestId: string): Promise<Selectable<TransferRequestLinesTable>[]> {
    return this.db.selectFrom("transfer_request_lines").selectAll().where("transfer_request_id", "=", requestId).execute();
  }

  private toDomain(row: Selectable<TransferRequestsTable>, lineRows: Selectable<TransferRequestLinesTable>[]): TransferRequest {
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
