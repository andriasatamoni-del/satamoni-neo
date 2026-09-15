import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { GoodsReceipt, type GoodsReceiptStatus } from "../../domain/goods-receipt.aggregate";
import type { GoodsReceiptRepositoryPort } from "../../domain/ports/goods-receipt-repository.port";
import type { GoodsReceiptsTable, GoodsReceiptItemsTable } from "./procurement.schema";

@Injectable()
export class KyselyGoodsReceiptRepository implements GoodsReceiptRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(receipt: GoodsReceipt): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("goods_receipts")
        .values({
          id: receipt.id,
          purchase_order_id: receipt.purchaseOrderId,
          supplier_id: receipt.supplierId,
          branch_id: receipt.branchId,
          status: receipt.status,
          received_by: receipt.receivedBy,
          created_at: receipt.createdAt,
          confirmed_at: receipt.confirmedAt,
          legacy_goods_receipt_id: receipt.legacyGoodsReceiptId,
        })
        .onConflict((oc) => oc.column("id").doUpdateSet({ status: receipt.status, confirmed_at: receipt.confirmedAt }))
        .execute();

      for (const line of receipt.lines) {
        await trx
          .insertInto("goods_receipt_items")
          .values({
            id: line.id,
            goods_receipt_id: receipt.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit_cost: line.unitCost,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }
    });
  }

  async findById(id: string): Promise<GoodsReceipt | null> {
    const row = await this.db.selectFrom("goods_receipts").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findByLegacyGoodsReceiptId(legacyId: number): Promise<GoodsReceipt | null> {
    const row = await this.db
      .selectFrom("goods_receipts")
      .selectAll()
      .where("legacy_goods_receipt_id", "=", legacyId)
      .executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async list(filter?: { branchId?: string }): Promise<GoodsReceipt[]> {
    let query = this.db.selectFrom("goods_receipts").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    const rows = await query.orderBy("created_at", "desc").execute();
    const receipts: GoodsReceipt[] = [];
    for (const row of rows) receipts.push(this.toDomain(row, await this.loadLines(row.id)));
    return receipts;
  }

  private loadLines(receiptId: string): Promise<Selectable<GoodsReceiptItemsTable>[]> {
    return this.db.selectFrom("goods_receipt_items").selectAll().where("goods_receipt_id", "=", receiptId).execute();
  }

  private toDomain(row: Selectable<GoodsReceiptsTable>, lineRows: Selectable<GoodsReceiptItemsTable>[]): GoodsReceipt {
    return GoodsReceipt.reconstitute(row.id, {
      purchaseOrderId: row.purchase_order_id,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      status: row.status as GoodsReceiptStatus,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost),
      })),
      receivedBy: row.received_by,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      legacyGoodsReceiptId: row.legacy_goods_receipt_id,
    });
  }
}
