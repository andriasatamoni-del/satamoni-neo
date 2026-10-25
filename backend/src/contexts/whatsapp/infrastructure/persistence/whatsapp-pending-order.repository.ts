import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { WhatsappPendingOrder, type WhatsappPendingOrderStatus } from "../../domain/whatsapp-pending-order.aggregate";
import type { WhatsappPendingOrderRepositoryPort } from "../../domain/ports/whatsapp-pending-order-repository.port";
import { whatsappPendingOrderLines, whatsappPendingOrders } from "./whatsapp.tables";

@Injectable()
export class WhatsappPendingOrderRepository implements WhatsappPendingOrderRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(order: WhatsappPendingOrder): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(whatsappPendingOrders)
        .values({
          id: order.id,
          conversation_id: order.conversationId,
          customer_phone: order.customerPhone,
          customer_name: order.customerName,
          order_type: order.orderType,
          branch_id: order.branchId,
          address_details: order.addressDetails,
          total: order.total,
          status: order.status,
          rejection_reason: order.rejectionReason,
          reviewed_by: order.reviewedBy,
          reviewed_at: order.reviewedAt,
          confirmed_order_id: order.confirmedOrderId,
          created_at: order.createdAt,
        })
        .onConflictDoUpdate({
          target: whatsappPendingOrders.id,
          set: {
            customer_name: order.customerName,
            order_type: order.orderType,
            branch_id: order.branchId,
            address_details: order.addressDetails,
            total: order.total,
            status: order.status,
            rejection_reason: order.rejectionReason,
            reviewed_by: order.reviewedBy,
            reviewed_at: order.reviewedAt,
            confirmed_order_id: order.confirmedOrderId,
            updated_at: new Date(),
          },
        });

      // المسودة بتتعدّل بالكامل كل مرة (البوت بيبعت قايمة الأصناف كاملة) - أبسط وأصح من diff سطر بسطر
      await tx.delete(whatsappPendingOrderLines).where(eq(whatsappPendingOrderLines.pending_order_id, order.id));
      for (const line of order.lines) {
        // modifier_ids is jsonb: Drizzle serialises the array.
        await tx.insert(whatsappPendingOrderLines).values({
          id: line.id,
          pending_order_id: order.id,
          variant_id: line.variantId,
          item_name: line.itemName,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          modifier_ids: [...line.modifierIds],
        });
      }
    });
  }

  async findById(id: string): Promise<WhatsappPendingOrder | null> {
    const [row] = await this.db.select().from(whatsappPendingOrders).where(eq(whatsappPendingOrders.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async findDraftByConversation(conversationId: string): Promise<WhatsappPendingOrder | null> {
    const [row] = await this.db
      .select()
      .from(whatsappPendingOrders)
      .where(and(eq(whatsappPendingOrders.conversation_id, conversationId), eq(whatsappPendingOrders.status, "DRAFT")))
      .limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(row.id));
  }

  // المسودات (اللي البوت لسه بيجمّعها) مش بتظهر لطاقم المراجعة إلا لو اتطلبت صراحة بالحالة
  async list(filter?: { status?: string }): Promise<WhatsappPendingOrder[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: WhatsappPendingOrder[]; total: number }> {
    const where = filter?.status ? eq(whatsappPendingOrders.status, filter.status) : ne(whatsappPendingOrders.status, "DRAFT");
    const query = this.db.select().from(whatsappPendingOrders).where(where).orderBy(desc(whatsappPendingOrders.created_at), desc(whatsappPendingOrders.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(whatsappPendingOrders).where(where)));
    const orders: WhatsappPendingOrder[] = [];
    for (const row of rows) orders.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: orders, total };
  }

  private loadLines(pendingOrderId: string): Promise<(typeof whatsappPendingOrderLines.$inferSelect)[]> {
    return this.db.select().from(whatsappPendingOrderLines).where(eq(whatsappPendingOrderLines.pending_order_id, pendingOrderId));
  }

  private toDomain(
    row: typeof whatsappPendingOrders.$inferSelect,
    lineRows: (typeof whatsappPendingOrderLines.$inferSelect)[]
  ): WhatsappPendingOrder {
    return WhatsappPendingOrder.reconstitute(row.id, {
      conversationId: row.conversation_id,
      customerPhone: row.customer_phone,
      customerName: row.customer_name,
      orderType: row.order_type,
      branchId: row.branch_id,
      addressDetails: row.address_details,
      lines: lineRows.map((l) => ({
        id: l.id,
        variantId: l.variant_id,
        itemName: l.item_name,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        modifierIds: Array.isArray(l.modifier_ids) ? l.modifier_ids : [],
      })),
      total: Number(row.total),
      status: row.status as WhatsappPendingOrderStatus,
      rejectionReason: row.rejection_reason,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      confirmedOrderId: row.confirmed_order_id,
      createdAt: row.created_at,
    });
  }
}
