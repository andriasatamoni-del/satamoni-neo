import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PurchaseReturn, type PurchaseReturnStatus } from "../../domain/purchase-return.aggregate";
import type { PurchaseReturnRepositoryPort } from "../../domain/ports/purchase-return-repository.port";
import type { PurchaseReturnItemsTable, PurchaseReturnsTable } from "./procurement.schema";

@Injectable()
export class KyselyPurchaseReturnRepository implements PurchaseReturnRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(purchaseReturn: PurchaseReturn): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("purchase_returns")
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
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            status: purchaseReturn.status,
            total_value: purchaseReturn.totalValue,
            journal_entry_id: purchaseReturn.journalEntryId,
            posted_by: purchaseReturn.postedBy,
            posted_at: purchaseReturn.postedAt,
            cancelled_by: purchaseReturn.cancelledBy,
            cancelled_at: purchaseReturn.cancelledAt,
          })
        )
        .execute();

      for (const line of purchaseReturn.lines) {
        await trx
          .insertInto("purchase_return_items")
          .values({
            id: line.id,
            purchase_return_id: purchaseReturn.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unitCost,
            line_value: line.lineValue,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }
    });
  }

  async findById(id: string): Promise<PurchaseReturn | null> {
    const row = await this.db.selectFrom("purchase_returns").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string; supplierId?: string; status?: string }): Promise<PurchaseReturn[]> {
    let query = this.db.selectFrom("purchase_returns").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.supplierId) query = query.where("supplier_id", "=", filter.supplierId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    const returns: PurchaseReturn[] = [];
    for (const row of rows) returns.push(this.toDomain(row, await this.loadLines(row.id)));
    return returns;
  }

  private loadLines(returnId: string): Promise<Selectable<PurchaseReturnItemsTable>[]> {
    return this.db.selectFrom("purchase_return_items").selectAll().where("purchase_return_id", "=", returnId).execute();
  }

  private toDomain(row: Selectable<PurchaseReturnsTable>, lineRows: Selectable<PurchaseReturnItemsTable>[]): PurchaseReturn {
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
