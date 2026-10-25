import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PurchaseRequest, type PurchaseRequestStatus } from "../../domain/purchase-request.aggregate";
import type { PurchaseRequestRepositoryPort } from "../../domain/ports/purchase-request-repository.port";
import { purchaseRequestItems, purchaseRequests } from "./procurement.tables";

@Injectable()
export class PurchaseRequestRepository implements PurchaseRequestRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(request: PurchaseRequest): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(purchaseRequests)
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
        .onConflictDoUpdate({
          target: purchaseRequests.id,
          set: {
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
          },
        });

      await tx.delete(purchaseRequestItems).where(eq(purchaseRequestItems.purchase_request_id, request.id));
      for (const line of request.lines) {
        await tx.insert(purchaseRequestItems).values({
          id: line.id,
          purchase_request_id: request.id,
          inventory_item_id: line.inventoryItemId,
          requested_quantity: line.requestedQuantity,
          unit: line.unit,
          notes: line.notes,
        });
      }
    });
  }

  async findById(id: string): Promise<PurchaseRequest | null> {
    const [row] = await this.db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string; status?: string }): Promise<PurchaseRequest[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string; status?: string }, page?: PageRequest): Promise<{ rows: PurchaseRequest[]; total: number }> {
    const where = and(
      filter?.branchId ? eq(purchaseRequests.branch_id, filter.branchId) : undefined,
      filter?.status ? eq(purchaseRequests.status, filter.status) : undefined
    );
    const query = this.db.select().from(purchaseRequests).where(where).orderBy(desc(purchaseRequests.created_at), desc(purchaseRequests.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(purchaseRequests).where(where)));
    const requests: PurchaseRequest[] = [];
    for (const row of rows) requests.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: requests, total };
  }

  private loadLines(requestId: string): Promise<(typeof purchaseRequestItems.$inferSelect)[]> {
    return this.db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.purchase_request_id, requestId));
  }

  private toDomain(
    row: typeof purchaseRequests.$inferSelect,
    lineRows: (typeof purchaseRequestItems.$inferSelect)[]
  ): PurchaseRequest {
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
