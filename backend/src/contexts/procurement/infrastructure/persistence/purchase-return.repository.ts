import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PurchaseReturn, type PurchaseReturnStatus } from "../../domain/purchase-return.aggregate";
import type { PurchaseReturnRepositoryPort } from "../../domain/ports/purchase-return-repository.port";
import { purchaseReturnItems, purchaseReturns } from "./procurement.tables";

@Injectable()
export class PurchaseReturnRepository implements PurchaseReturnRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(purchaseReturn: PurchaseReturn): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(purchaseReturns)
        .values({
          id: purchaseReturn.id,
          branch_id: purchaseReturn.branchId,
          supplier_id: purchaseReturn.supplierId,
          goods_receipt_id: purchaseReturn.goodsReceiptId,
          status: purchaseReturn.status,
          reason: purchaseReturn.reason,
          notes: purchaseReturn.notes,
          total_value: purchaseReturn.totalValue,
          journal_entry_id: purchaseReturn.journalEntryId,
          created_by: purchaseReturn.createdBy,
          created_at: purchaseReturn.createdAt,
          posted_by: purchaseReturn.postedBy,
          posted_at: purchaseReturn.postedAt,
          cancelled_by: purchaseReturn.cancelledBy,
          cancelled_at: purchaseReturn.cancelledAt,
        })
        .onConflictDoUpdate({
          target: purchaseReturns.id,
          set: {
            status: purchaseReturn.status,
            total_value: purchaseReturn.totalValue,
            journal_entry_id: purchaseReturn.journalEntryId,
            posted_by: purchaseReturn.postedBy,
            posted_at: purchaseReturn.postedAt,
            cancelled_by: purchaseReturn.cancelledBy,
            cancelled_at: purchaseReturn.cancelledAt,
          },
        });

      for (const line of purchaseReturn.lines) {
        await tx
          .insert(purchaseReturnItems)
          .values({
            id: line.id,
            purchase_return_id: purchaseReturn.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unitCost,
            line_value: line.lineValue,
          })
          .onConflictDoNothing({ target: purchaseReturnItems.id });
      }
    });
  }

  async findById(id: string): Promise<PurchaseReturn | null> {
    const [row] = await this.db.select().from(purchaseReturns).where(eq(purchaseReturns.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string; supplierId?: string; status?: string }): Promise<PurchaseReturn[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string; supplierId?: string; status?: string }, page?: PageRequest): Promise<{ rows: PurchaseReturn[]; total: number }> {
    const where = and(
      filter?.branchId ? eq(purchaseReturns.branch_id, filter.branchId) : undefined,
      filter?.supplierId ? eq(purchaseReturns.supplier_id, filter.supplierId) : undefined,
      filter?.status ? eq(purchaseReturns.status, filter.status) : undefined
    );
    const query = this.db.select().from(purchaseReturns).where(where).orderBy(desc(purchaseReturns.created_at), desc(purchaseReturns.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(purchaseReturns).where(where)));
    const returns: PurchaseReturn[] = [];
    for (const row of rows) returns.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: returns, total };
  }

  private loadLines(returnId: string): Promise<(typeof purchaseReturnItems.$inferSelect)[]> {
    return this.db.select().from(purchaseReturnItems).where(eq(purchaseReturnItems.purchase_return_id, returnId));
  }

  private toDomain(
    row: typeof purchaseReturns.$inferSelect,
    lineRows: (typeof purchaseReturnItems.$inferSelect)[]
  ): PurchaseReturn {
    return PurchaseReturn.reconstitute(row.id, {
      branchId: row.branch_id,
      supplierId: row.supplier_id,
      goodsReceiptId: row.goods_receipt_id,
      reason: row.reason,
      notes: row.notes,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        quantity: Number(l.quantity),
        unit: l.unit,
        unitCost: l.unit_cost === null ? null : Number(l.unit_cost),
        lineValue: l.line_value === null ? null : Number(l.line_value),
      })),
      totalValue: row.total_value === null ? null : Number(row.total_value),
      status: row.status as PurchaseReturnStatus,
      journalEntryId: row.journal_entry_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      postedBy: row.posted_by,
      postedAt: row.posted_at,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
    });
  }
}
