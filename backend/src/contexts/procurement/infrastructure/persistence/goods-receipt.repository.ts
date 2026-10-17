import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { GoodsReceipt, type GoodsReceiptStatus } from "../../domain/goods-receipt.aggregate";
import type { GoodsReceiptRepositoryPort } from "../../domain/ports/goods-receipt-repository.port";
import type { ProcurementDocumentListFilter } from "../../domain/ports/purchase-order-repository.port";
import { goodsReceiptItems, goodsReceipts, suppliers } from "./procurement.tables";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { businessDayRangeCondition, groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";

@Injectable()
export class GoodsReceiptRepository implements GoodsReceiptRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(receipt: GoodsReceipt): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(goodsReceipts)
        .values({
          id: receipt.id,
          purchase_order_id: receipt.purchaseOrderId,
          supplier_id: receipt.supplierId,
          supplier_document_number: receipt.supplierDocumentNumber,
          branch_id: receipt.branchId,
          status: receipt.status,
          received_by: receipt.receivedBy,
          created_at: receipt.createdAt,
          confirmed_at: receipt.confirmedAt,
          legacy_goods_receipt_id: receipt.legacyGoodsReceiptId,
        })
        .onConflictDoUpdate({ target: goodsReceipts.id, set: { status: receipt.status, confirmed_at: receipt.confirmedAt } });

      for (const line of receipt.lines) {
        await tx
          .insert(goodsReceiptItems)
          .values({
            id: line.id,
            goods_receipt_id: receipt.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            expiry_date: line.expiryDate,
            production_date: line.productionDate,
          })
          .onConflictDoNothing({ target: goodsReceiptItems.id });
      }
    });
  }

  async findById(id: string): Promise<GoodsReceipt | null> {
    const [row] = await this.db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findByLegacyGoodsReceiptId(legacyId: number): Promise<GoodsReceipt | null> {
    const [row] = await this.db.select().from(goodsReceipts).where(eq(goodsReceipts.legacy_goods_receipt_id, legacyId)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async list(filter?: { branchId?: string; purchaseOrderId?: string }): Promise<GoodsReceipt[]> {
    const rows = await this.db
      .select()
      .from(goodsReceipts)
      .where(
        and(
          filter?.branchId ? eq(goodsReceipts.branch_id, filter.branchId) : undefined,
          filter?.purchaseOrderId ? eq(goodsReceipts.purchase_order_id, filter.purchaseOrderId) : undefined
        )
      )
      .orderBy(desc(goodsReceipts.created_at));
    return this.withLines(rows);
  }

  async search(filter: ProcurementDocumentListFilter, page?: PageRequest): Promise<{ receipts: GoodsReceipt[]; total: number }> {
    const supplierSearch = searchCondition(filter.q, suppliers.name);
    const where = and(
      filter.branchId ? eq(goodsReceipts.branch_id, filter.branchId) : undefined,
      filter.status ? eq(goodsReceipts.status, filter.status) : undefined,
      filter.supplierId ? eq(goodsReceipts.supplier_id, filter.supplierId) : undefined,
      businessDayRangeCondition(goodsReceipts.created_at, filter.from, filter.to),
      // a receipt matches by its supplier name or by the supplier document number
      supplierSearch
        ? or(
            searchCondition(filter.q, goodsReceipts.supplier_document_number),
            inArray(goodsReceipts.supplier_id, this.db.select({ id: suppliers.id }).from(suppliers).where(supplierSearch))
          )
        : undefined
    );
    const query = this.db
      .select()
      .from(goodsReceipts)
      .where(where)
      .orderBy(...orderByOf({ createdAt: goodsReceipts.created_at }, filter.sort, filter.order, { key: "createdAt", order: "desc" }, goodsReceipts.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(goodsReceipts).where(where)));
    return { receipts: await this.withLines(rows), total };
  }

  // NEO-6: the lines of many receipts in one query per 1000 receipts instead of one per receipt
  private async withLines(rows: (typeof goodsReceipts.$inferSelect)[]): Promise<GoodsReceipt[]> {
    const lines: (typeof goodsReceiptItems.$inferSelect)[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      lines.push(...(await this.db.select().from(goodsReceiptItems).where(inArray(goodsReceiptItems.goods_receipt_id, ids))));
    }
    const byReceipt = groupBy(lines, (l) => l.goods_receipt_id);
    return rows.map((row) => this.toDomain(row, byReceipt.get(row.id) ?? []));
  }

  private loadLines(receiptId: string): Promise<(typeof goodsReceiptItems.$inferSelect)[]> {
    return this.db.select().from(goodsReceiptItems).where(eq(goodsReceiptItems.goods_receipt_id, receiptId));
  }

  private toDomain(row: typeof goodsReceipts.$inferSelect, lineRows: (typeof goodsReceiptItems.$inferSelect)[]): GoodsReceipt {
    return GoodsReceipt.reconstitute(row.id, {
      purchaseOrderId: row.purchase_order_id,
      supplierId: row.supplier_id,
      supplierDocumentNumber: row.supplier_document_number,
      branchId: row.branch_id,
      status: row.status as GoodsReceiptStatus,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost),
        expiryDate: l.expiry_date,
        productionDate: l.production_date,
      })),
      receivedBy: row.received_by,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      legacyGoodsReceiptId: row.legacy_goods_receipt_id,
    });
  }
}
