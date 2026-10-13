import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PurchaseOrder, type PurchaseOrderStatus } from "../../domain/purchase-order.aggregate";
import type { PurchaseOrderRepositoryPort } from "../../domain/ports/purchase-order-repository.port";
import { purchaseOrderItems, purchaseOrders } from "./procurement.tables";

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
    const rows = await this.db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.created_at));
    const orders: PurchaseOrder[] = [];
    for (const row of rows) orders.push(this.toDomain(row, await this.loadLines(row.id)));
    return orders;
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
