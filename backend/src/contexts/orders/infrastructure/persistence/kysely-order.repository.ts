import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Order, type OrderStatus, type KitchenStatus, type OrderType } from "../../domain/order.aggregate";
import type { OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import type { OrdersTable, OrderItemsTable, OrderItemModifiersTable } from "./order.schema";

@Injectable()
export class KyselyOrderRepository implements OrderRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(order: Order): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("orders")
        .values({
          id: order.id,
          branch_id: order.branchId,
          order_type: order.orderType,
          table_number: order.tableNumber,
          customer_name: order.customerName,
          customer_phone: order.customerPhone,
          address_details: order.addressDetails,
          subtotal: order.subtotal,
          discount: order.discount,
          total: order.total,
          status: order.status,
          kitchen_status: order.kitchenStatus,
          kitchen_accepted_at: order.kitchenAcceptedAt,
          kitchen_ready_at: order.kitchenReadyAt,
          created_by: order.createdBy,
          created_at: order.createdAt,
          legacy_order_id: order.legacyOrderId,
          payment_method_id: order.paymentMethodId,
          rating_token: order.ratingToken,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            status: order.status,
            kitchen_status: order.kitchenStatus,
            kitchen_accepted_at: order.kitchenAcceptedAt,
            kitchen_ready_at: order.kitchenReadyAt,
          })
        )
        .execute();

      for (const item of order.items) {
        await trx
          .insertInto("order_items")
          .values({
            id: item.id,
            order_id: order.id,
            menu_item_id: item.menuItemId,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            line_total: item.lineTotal,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();

        for (const modifier of item.modifiers) {
          await trx
            .insertInto("order_item_modifiers")
            .values({
              order_item_id: item.id,
              modifier_id: modifier.modifierId,
              name_at_sale: modifier.nameAtSale,
              price_at_sale: modifier.priceAtSale,
            })
            .onConflict((oc) => oc.columns(["order_item_id", "modifier_id"]).doNothing())
            .execute();
        }
      }
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.db.selectFrom("orders").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadItems(id));
  }

  async findByLegacyOrderId(legacyId: number): Promise<Order | null> {
    const row = await this.db.selectFrom("orders").selectAll().where("legacy_order_id", "=", legacyId).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadItems(row.id));
  }

  async list(filter?: { branchId?: string }): Promise<Order[]> {
    let query = this.db.selectFrom("orders").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    const rows = await query.orderBy("created_at", "desc").execute();
    const orders: Order[] = [];
    for (const row of rows) orders.push(this.toDomain(row, await this.loadItems(row.id)));
    return orders;
  }

  private async loadItems(
    orderId: string
  ): Promise<{ item: Selectable<OrderItemsTable>; modifiers: Selectable<OrderItemModifiersTable>[] }[]> {
    const itemRows = await this.db.selectFrom("order_items").selectAll().where("order_id", "=", orderId).execute();
    const result: { item: Selectable<OrderItemsTable>; modifiers: Selectable<OrderItemModifiersTable>[] }[] = [];
    for (const item of itemRows) {
      const modifiers = await this.db
        .selectFrom("order_item_modifiers")
        .selectAll()
        .where("order_item_id", "=", item.id)
        .execute();
      result.push({ item, modifiers });
    }
    return result;
  }

  private toDomain(
    row: Selectable<OrdersTable>,
    itemRows: { item: Selectable<OrderItemsTable>; modifiers: Selectable<OrderItemModifiersTable>[] }[]
  ): Order {
    return Order.reconstitute(row.id, {
      branchId: row.branch_id,
      orderType: row.order_type as OrderType,
      tableNumber: row.table_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      addressDetails: row.address_details,
      items: itemRows.map(({ item: i, modifiers }) => ({
        id: i.id,
        menuItemId: i.menu_item_id,
        variantId: i.variant_id,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
        lineTotal: Number(i.line_total),
        modifiers: modifiers.map((m) => ({
          modifierId: m.modifier_id,
          nameAtSale: m.name_at_sale,
          priceAtSale: Number(m.price_at_sale),
        })),
      })),
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      total: Number(row.total),
      status: row.status as OrderStatus,
      kitchenStatus: row.kitchen_status as KitchenStatus,
      kitchenAcceptedAt: row.kitchen_accepted_at,
      kitchenReadyAt: row.kitchen_ready_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      legacyOrderId: row.legacy_order_id,
      paymentMethodId: row.payment_method_id,
      ratingToken: row.rating_token,
    });
  }
}
