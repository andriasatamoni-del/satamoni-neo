import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type {
  NotifiableOrder,
  OrderNotificationKind,
  OrderNotificationRecord,
  OrderNotificationStorePort,
} from "../../domain/ports/order-notification-store.port";

@Injectable()
export class KyselyOrderNotificationStore implements OrderNotificationStorePort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async findOrder(orderId: string): Promise<NotifiableOrder | null> {
    const row = await this.db
      .selectFrom("orders")
      .select(["id", "order_type", "customer_phone", "total", "rating_token"])
      .where("id", "=", orderId)
      .executeTakeFirst();
    if (!row) return null;
    return { id: row.id, orderType: row.order_type, customerPhone: row.customer_phone, total: Number(row.total), ratingToken: row.rating_token };
  }

  // الحالة المبدئية failed لحد ما الإرسال يخلص - لو السيرفر وقع في النص يفضل الصف واضح إنه ماوصلش
  async reserve(input: { orderId: string; kind: OrderNotificationKind; recipient: string; message: string }): Promise<string | null> {
    const row = await this.db
      .insertInto("order_notifications")
      .values({
        order_id: input.orderId,
        kind: input.kind,
        channel: "sms",
        recipient: input.recipient,
        message: input.message,
        status: "failed",
        error: "لسه بيتبعت",
      })
      .onConflict((oc) => oc.columns(["order_id", "kind"]).doNothing())
      .returning("id")
      .executeTakeFirst();
    return row?.id ?? null;
  }

  async complete(id: string, result: { status: OrderNotificationRecord["status"]; error?: string | null }): Promise<void> {
    await this.db.updateTable("order_notifications").set({ status: result.status, error: result.error ?? null }).where("id", "=", id).execute();
  }

  async listRecent(limit: number): Promise<OrderNotificationRecord[]> {
    const rows = await this.db.selectFrom("order_notifications").selectAll().orderBy("created_at", "desc").limit(limit).execute();
    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      kind: r.kind as OrderNotificationKind,
      channel: "sms",
      recipient: r.recipient,
      message: r.message,
      status: r.status as OrderNotificationRecord["status"],
      error: r.error,
      createdAt: r.created_at,
    }));
  }
}
