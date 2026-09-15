import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PurchaseOrder, type PurchaseOrderStatus } from "../../domain/purchase-order.aggregate";
import type { PurchaseOrderRepositoryPort } from "../../domain/ports/purchase-order-repository.port";
import type { PurchaseOrdersTable, PurchaseOrderItemsTable } from "./procurement.schema";

@Injectable()
export class KyselyPurchaseOrderRepository implements PurchaseOrderRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(order: PurchaseOrder): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("purchase_orders")
        .values({
          id: order.id,
          supplier_id: order.supplierId,
          branch_id: order.branchId,
          status: order.status,
          created_by: order.createdBy,
          created_at: order.createdAt,
          legacy_purchase_order_id: order.legacyPurchaseOrderId,
        })
        .onConflict((oc) => oc.column("id").doUpdateSet({ status: order.status }))
        .execute();

      for (const line of order.lines) {
        await trx
          .insertInto("purchase_order_items")
          .values({
            id: line.id,
            purchase_order_id: order.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }
    });
  }

  async findById(id: string): Promise<PurchaseOrder | null> {
    const row = await this.db.selectFrom("purchase_orders").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findByLegacyPurchaseOrderId(legacyId: number): Promise<PurchaseOrder | null> {
    const row = await this.db
      .selectFrom("purchase_orders")
      .selectAll()
      .where("legacy_purchase_order_id", "=", legacyId)
      .executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  async list(): Promise<PurchaseOrder[]> {
    const rows = await this.db.selectFrom("purchase_orders").selectAll().orderBy("created_at", "desc").execute();
    const orders: PurchaseOrder[] = [];
    for (const row of rows) orders.push(this.toDomain(row, await this.loadLines(row.id)));
    return orders;
  }

  private loadLines(orderId: string): Promise<Selectable<PurchaseOrderItemsTable>[]> {
    return this.db.selectFrom("purchase_order_items").selectAll().where("purchase_order_id", "=", orderId).execute();
  }

  private toDomain(row: Selectable<PurchaseOrdersTable>, lineRows: Selectable<PurchaseOrderItemsTable>[]): PurchaseOrder {
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
