import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PurchaseOrder, type PurchaseOrderStatus } from "../../domain/purchase-order.aggregate";
import type { ProcurementDocumentListFilter, PurchaseOrderRepositoryPort } from "../../domain/ports/purchase-order-repository.port";
import { purchaseOrderItems, purchaseOrders, suppliers } from "./procurement.tables";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { businessDayRangeCondition, groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";

@Injectable()
export class PurchaseOrderRepository implements PurchaseOrderRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(order: PurchaseOrder): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(purchaseOrders)
        .values({
          id: order.id,
          supplier_id: order.supplierId,
          branch_id: order.branchId,
          status: order.status,
          created_by: order.createdBy,
          created_at: order.createdAt,
          legacy_purchase_order_id: order.legacyPurchaseOrderId,
        })
        .onConflictDoUpdate({ target: purchaseOrders.id, set: { status: order.status } });

      for (const line of order.lines) {
        await tx
          .insert(purchaseOrderItems)
          .values({
            id: line.id,
            purchase_order_id: order.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
          })
          .onConflictDoNothing({ target: purchaseOrderItems.id });
      }
    });
  }

  async findById(id: string): Promise<PurchaseOrder | null> {
    const [row] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findByLegacyPurchaseOrderId(legacyId: number): Promise<PurchaseOrder | null> {
    const [row] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.legacy_purchase_order_id, legacyId)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async list(): Promise<PurchaseOrder[]> {
    return this.withLines(await this.db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.created_at)));
  }

  async search(filter: ProcurementDocumentListFilter, page?: PageRequest): Promise<{ orders: PurchaseOrder[]; total: number }> {
    const supplierSearch = searchCondition(filter.q, suppliers.name);
    const where = and(
      filter.branchId ? eq(purchaseOrders.branch_id, filter.branchId) : undefined,
      filter.status ? eq(purchaseOrders.status, filter.status) : undefined,
      filter.supplierId ? eq(purchaseOrders.supplier_id, filter.supplierId) : undefined,
      businessDayRangeCondition(purchaseOrders.created_at, filter.from, filter.to),
      supplierSearch ? inArray(purchaseOrders.supplier_id, this.db.select({ id: suppliers.id }).from(suppliers).where(supplierSearch)) : undefined
    );
    const query = this.db
      .select()
      .from(purchaseOrders)
      .where(where)
      .orderBy(...orderByOf({ createdAt: purchaseOrders.created_at }, filter.sort, filter.order, { key: "createdAt", order: "desc" }, purchaseOrders.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(purchaseOrders).where(where)));
    return { orders: await this.withLines(rows), total };
  }

  // NEO-6: the lines of many orders in one query per 1000 orders instead of one per order
  private async withLines(rows: (typeof purchaseOrders.$inferSelect)[]): Promise<PurchaseOrder[]> {
    const lines: (typeof purchaseOrderItems.$inferSelect)[] = [];
    for (const ids of inListChunks(rows.map((r) => r.id))) {
      lines.push(...(await this.db.select().from(purchaseOrderItems).where(inArray(purchaseOrderItems.purchase_order_id, ids))));
    }
    const byOrder = groupBy(lines, (l) => l.purchase_order_id);
    return rows.map((row) => this.toDomain(row, byOrder.get(row.id) ?? []));
  }

  private loadLines(orderId: string): Promise<(typeof purchaseOrderItems.$inferSelect)[]> {
    return this.db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchase_order_id, orderId));
  }

  private toDomain(row: typeof purchaseOrders.$inferSelect, lineRows: (typeof purchaseOrderItems.$inferSelect)[]): PurchaseOrder {
    return PurchaseOrder.reconstitute(row.id, {
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      status: row.status as PurchaseOrderStatus,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
      })),
      createdBy: row.created_by,
      createdAt: row.created_at,
      legacyPurchaseOrderId: row.legacy_purchase_order_id,
    });
  }
}
