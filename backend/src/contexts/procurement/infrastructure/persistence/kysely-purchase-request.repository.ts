import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PurchaseRequest, type PurchaseRequestStatus } from "../../domain/purchase-request.aggregate";
import type { PurchaseRequestRepositoryPort } from "../../domain/ports/purchase-request-repository.port";
import type { PurchaseRequestItemsTable, PurchaseRequestsTable } from "./procurement.schema";

@Injectable()
export class KyselyPurchaseRequestRepository implements PurchaseRequestRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(request: PurchaseRequest): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("purchase_requests")
        .values({
          id: request.id,
          branch_id: request.branchId,
          requested_by: request.requestedBy,
          required_date: request.requiredDate,
          reason: request.reason,
          status: request.status,
          approved_by: request.approvedBy,
          approved_at: request.approvedAt,
          rejected_by: request.rejectedBy,
          rejection_reason: request.rejectionReason,
          cancelled_by: request.cancelledBy,
          cancelled_at: request.cancelledAt,
          converted_to_purchase_order_id: request.convertedToPurchaseOrderId,
          created_at: request.createdAt,
          updated_at: request.updatedAt,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            required_date: request.requiredDate,
            reason: request.reason,
            status: request.status,
            approved_by: request.approvedBy,
            approved_at: request.approvedAt,
            rejected_by: request.rejectedBy,
            rejection_reason: request.rejectionReason,
            cancelled_by: request.cancelledBy,
            cancelled_at: request.cancelledAt,
            converted_to_purchase_order_id: request.convertedToPurchaseOrderId,
            updated_at: request.updatedAt,
          })
        )
        .execute();

      await trx.deleteFrom("purchase_request_items").where("purchase_request_id", "=", request.id).execute();
      for (const line of request.lines) {
        await trx
          .insertInto("purchase_request_items")
          .values({
            id: line.id,
            purchase_request_id: request.id,
            inventory_item_id: line.inventoryItemId,
            requested_quantity: line.requestedQuantity,
            unit: line.unit,
            notes: line.notes,
          })
          .execute();
      }
    });
  }

  async findById(id: string): Promise<PurchaseRequest | null> {
    const row = await this.db.selectFrom("purchase_requests").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string; status?: string }): Promise<PurchaseRequest[]> {
    let query = this.db.selectFrom("purchase_requests").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    const requests: PurchaseRequest[] = [];
    for (const row of rows) requests.push(this.toDomain(row, await this.loadLines(row.id)));
    return requests;
  }

  private loadLines(requestId: string): Promise<Selectable<PurchaseRequestItemsTable>[]> {
    return this.db.selectFrom("purchase_request_items").selectAll().where("purchase_request_id", "=", requestId).execute();
  }

  private toDomain(row: Selectable<PurchaseRequestsTable>, lineRows: Selectable<PurchaseRequestItemsTable>[]): PurchaseRequest {
    return PurchaseRequest.reconstitute(row.id, {
      branchId: row.branch_id,
      requestedBy: row.requested_by,
      requiredDate: row.required_date,
      reason: row.reason,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        requestedQuantity: Number(l.requested_quantity),
        unit: l.unit,
        notes: l.notes,
      })),
      status: row.status as PurchaseRequestStatus,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectedBy: row.rejected_by,
      rejectionReason: row.rejection_reason,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      convertedToPurchaseOrderId: row.converted_to_purchase_order_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
