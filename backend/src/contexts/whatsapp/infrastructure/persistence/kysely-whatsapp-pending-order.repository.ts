import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { WhatsappPendingOrder, type WhatsappPendingOrderStatus } from "../../domain/whatsapp-pending-order.aggregate";
import type { WhatsappPendingOrderRepositoryPort } from "../../domain/ports/whatsapp-pending-order-repository.port";
import type { WhatsappPendingOrderLinesTable, WhatsappPendingOrdersTable } from "./whatsapp.schema";

@Injectable()
export class KyselyWhatsappPendingOrderRepository implements WhatsappPendingOrderRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(order: WhatsappPendingOrder): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("whatsapp_pending_orders")
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
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            status: order.status,
            rejection_reason: order.rejectionReason,
            reviewed_by: order.reviewedBy,
            reviewed_at: order.reviewedAt,
            confirmed_order_id: order.confirmedOrderId,
          })
        )
        .execute();

      for (const line of order.lines) {
        await trx
          .insertInto("whatsapp_pending_order_lines")
          .values({
            id: line.id,
            pending_order_id: order.id,
            variant_id: line.variantId,
            item_name: line.itemName,
            quantity: line.quantity,
            unit_price: line.unitPrice,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }
    });
  }

  async findById(id: string): Promise<WhatsappPendingOrder | null> {
    const row = await this.db.selectFrom("whatsapp_pending_orders").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { status?: string }): Promise<WhatsappPendingOrder[]> {
    let query = this.db.selectFrom("whatsapp_pending_orders").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    const orders: WhatsappPendingOrder[] = [];
    for (const row of rows) orders.push(this.toDomain(row, await this.loadLines(row.id)));
    return orders;
  }

  private loadLines(pendingOrderId: string): Promise<Selectable<WhatsappPendingOrderLinesTable>[]> {
    return this.db.selectFrom("whatsapp_pending_order_lines").selectAll().where("pending_order_id", "=", pendingOrderId).execute();
  }

  private toDomain(
    row: Selectable<WhatsappPendingOrdersTable>,
    lineRows: Selectable<WhatsappPendingOrderLinesTable>[]
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
