import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Purchase, type PurchaseStatus } from "../../domain/purchase.aggregate";
import type { PurchaseRepositoryPort } from "../../domain/ports/purchase-repository.port";
import { purchaseLines, purchases } from "./purchases.tables";

@Injectable()
export class PurchaseRepository implements PurchaseRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(purchase: Purchase): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(purchases)
        .values({
          id: purchase.id,
          branch_id: purchase.branchId,
          business_date: purchase.businessDate,
          category: purchase.category,
          amount: purchase.amount,
          notes: purchase.notes,
          supplier_id: purchase.supplierId,
          supplier_document_number: purchase.supplierDocumentNumber,
          status: purchase.status,
          created_by: purchase.createdBy,
          reviewed_by: purchase.reviewedBy,
          reviewed_at: purchase.reviewedAt,
          rejection_reason: purchase.rejectionReason,
          posted_to_inventory: purchase.postedToInventory,
          created_at: purchase.createdAt,
        })
        .onConflictDoUpdate({
          target: purchases.id,
          set: {
            amount: purchase.amount,
            notes: purchase.notes,
            status: purchase.status,
            reviewed_by: purchase.reviewedBy,
            reviewed_at: purchase.reviewedAt,
            rejection_reason: purchase.rejectionReason,
            posted_to_inventory: purchase.postedToInventory,
          },
        });

      await tx.delete(purchaseLines).where(eq(purchaseLines.purchase_id, purchase.id));
      for (const line of purchase.lines) {
        await tx.insert(purchaseLines).values({
          id: line.id,
          purchase_id: purchase.id,
          inventory_item_id: line.inventoryItemId,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          line_total: line.lineTotal,
        });
      }
    });
  }

  async findById(id: string): Promise<Purchase | null> {
    const [row] = await this.db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
    return row ? this.toDomain(row, await this.loadLines(id)) : null;
  }

  async list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Purchase[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string; businessDate?: Date; status?: string }, page?: PageRequest): Promise<{ rows: Purchase[]; total: number }> {
    const where = and(
      filter?.branchId ? eq(purchases.branch_id, filter.branchId) : undefined,
      filter?.businessDate ? eq(purchases.business_date, filter.businessDate) : undefined,
      filter?.status ? eq(purchases.status, filter.status) : undefined
    );
    const query = this.db.select().from(purchases).where(where).orderBy(desc(purchases.business_date), desc(purchases.created_at), desc(purchases.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(purchases).where(where)));
    const result: Purchase[] = [];
    for (const row of rows) result.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: result, total };
  }

  private loadLines(purchaseId: string): Promise<(typeof purchaseLines.$inferSelect)[]> {
    return this.db.select().from(purchaseLines).where(eq(purchaseLines.purchase_id, purchaseId));
  }

  private toDomain(row: typeof purchases.$inferSelect, lineRows: (typeof purchaseLines.$inferSelect)[]): Purchase {
    return Purchase.reconstitute(row.id, {
      branchId: row.branch_id,
      businessDate: row.business_date,
      category: row.category,
      amount: Number(row.amount),
      notes: row.notes,
      supplierId: row.supplier_id,
      supplierDocumentNumber: row.supplier_document_number,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        quantity: Number(l.quantity),
        unit: l.unit,
        unitPrice: Number(l.unit_price),
        lineTotal: Number(l.line_total),
      })),
      status: row.status as PurchaseStatus,
      createdBy: row.created_by,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
      postedToInventory: row.posted_to_inventory,
      createdAt: row.created_at,
    });
  }
}
