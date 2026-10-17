import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Order, type OrderStatus, type KitchenStatus, type OrderType, type OrderSource } from "../../domain/order.aggregate";
import type { OrderListFilter, OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { businessDayRangeCondition, groupBy, inListChunks, orderByOf, paginate, searchCondition, totalOf } from "../../../../shared/database/pagination";
import { orderItemModifiers, orderItems, orders } from "./orders.tables";

type ItemWithModifiers = { item: typeof orderItems.$inferSelect; modifiers: (typeof orderItemModifiers.$inferSelect)[] };

@Injectable()
export class OrderRepository implements OrderRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(order: Order): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(orders)
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
          client_request_id: order.clientRequestId,
          source: order.source,
          customer_notes: order.customerNotes,
        })
        .onConflictDoUpdate({
          target: orders.id,
          set: {
            status: order.status,
            kitchen_status: order.kitchenStatus,
            kitchen_accepted_at: order.kitchenAcceptedAt,
            kitchen_ready_at: order.kitchenReadyAt,
          },
        });

      for (const item of order.items) {
        await tx
          .insert(orderItems)
          .values({
            id: item.id,
            order_id: order.id,
            menu_item_id: item.menuItemId,
            variant_id: item.variantId,
            combo_id: item.comboId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            line_total: item.lineTotal,
          })
          .onConflictDoNothing({ target: orderItems.id });

        for (const modifier of item.modifiers) {
          await tx
            .insert(orderItemModifiers)
            .values({
              order_item_id: item.id,
              modifier_id: modifier.modifierId,
              name_at_sale: modifier.nameAtSale,
              price_at_sale: modifier.priceAtSale,
            })
            .onConflictDoNothing({ target: [orderItemModifiers.order_item_id, orderItemModifiers.modifier_id] });
        }
      }
    });
  }

  async updatePaymentMethod(orderId: string, paymentMethodId: string): Promise<void> {
    await this.db.update(orders).set({ payment_method_id: paymentMethodId }).where(eq(orders.id, orderId));
  }

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadItems(id));
  }

  async findByLegacyOrderId(legacyId: number): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.legacy_order_id, legacyId)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadItems(row.id));
  }

  async findByClientRequestId(clientRequestId: string): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.client_request_id, clientRequestId)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadItems(row.id));
  }

  async list(filter?: { branchId?: string }): Promise<Order[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(filter?.branchId ? eq(orders.branch_id, filter.branchId) : undefined)
      .orderBy(desc(orders.created_at));
    return this.withItems(rows);
  }

  async search(filter: OrderListFilter, page?: PageRequest): Promise<{ orders: Order[]; total: number }> {
    const where = and(
      filter.branchId ? eq(orders.branch_id, filter.branchId) : undefined,
      filter.status ? eq(orders.status, filter.status) : undefined,
      filter.orderType ? eq(orders.order_type, filter.orderType) : undefined,
      filter.source ? eq(orders.source, filter.source) : undefined,
      businessDayRangeCondition(orders.created_at, filter.from, filter.to),
      searchCondition(filter.q, orders.customer_name, orders.customer_phone, orders.table_number, sql`${orders.id}::text`)
    );
    const query = this.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(...orderByOf({ createdAt: orders.created_at, total: orders.total }, filter.sort, filter.order, { key: "createdAt", order: "desc" }, orders.id))
      .$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(orders).where(where)));
    return { orders: await this.withItems(rows), total };
  }

  private async loadItems(orderId: string): Promise<ItemWithModifiers[]> {
    return (await this.loadItemsFor([orderId])).get(orderId) ?? [];
  }

  // NEO-6: items and modifiers of many orders in two queries per 1000 orders/items, instead of one per order and item (N+1)
  private async loadItemsFor(orderIds: string[]): Promise<Map<string, ItemWithModifiers[]>> {
    const byOrder = new Map<string, ItemWithModifiers[]>();
    if (orderIds.length === 0) return byOrder;
    const itemRows: (typeof orderItems.$inferSelect)[] = [];
    for (const ids of inListChunks(orderIds)) itemRows.push(...(await this.db.select().from(orderItems).where(inArray(orderItems.order_id, ids))));
    const modifierRows: (typeof orderItemModifiers.$inferSelect)[] = [];
    for (const ids of inListChunks(itemRows.map((i) => i.id))) {
      modifierRows.push(...(await this.db.select().from(orderItemModifiers).where(inArray(orderItemModifiers.order_item_id, ids))));
    }
    const modifiersByItem = groupBy(modifierRows, (m) => m.order_item_id);
    for (const [orderId, items] of groupBy(itemRows, (i) => i.order_id)) {
      byOrder.set(orderId, items.map((item) => ({ item, modifiers: modifiersByItem.get(item.id) ?? [] })));
    }
    return byOrder;
  }

  private async withItems(rows: (typeof orders.$inferSelect)[]): Promise<Order[]> {
    const items = await this.loadItemsFor(rows.map((r) => r.id));
    return rows.map((row) => this.toDomain(row, items.get(row.id) ?? []));
  }

  private toDomain(row: typeof orders.$inferSelect, itemRows: ItemWithModifiers[]): Order {
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
        comboId: i.combo_id,
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
      clientRequestId: row.client_request_id,
      source: row.source as OrderSource,
      customerNotes: row.customer_notes,
    });
  }
}
