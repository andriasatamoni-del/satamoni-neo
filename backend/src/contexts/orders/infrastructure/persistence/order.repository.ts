import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Order, type OrderStatus, type KitchenStatus, type OrderType, type OrderSource } from "../../domain/order.aggregate";
import type { OrderRepositoryPort } from "../../domain/ports/order-repository.port";
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
    const result: Order[] = [];
    for (const row of rows) result.push(this.toDomain(row, await this.loadItems(row.id)));
    return result;
  }

  private async loadItems(orderId: string): Promise<ItemWithModifiers[]> {
    const itemRows = await this.db.select().from(orderItems).where(eq(orderItems.order_id, orderId));
    const result: ItemWithModifiers[] = [];
    for (const item of itemRows) {
      const modifiers = await this.db.select().from(orderItemModifiers).where(eq(orderItemModifiers.order_item_id, item.id));
      result.push({ item, modifiers });
    }
    return result;
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
